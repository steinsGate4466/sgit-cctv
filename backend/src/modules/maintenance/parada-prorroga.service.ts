import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  EventoParada, evaluarEventoDeParada, evaluarPedidoDeProrroga, evaluarResolucion,
} from './parada-prorroga';

/**
 * PARADA REAL Y PRÓRROGA — bloques 138 y 135.
 * Las reglas viven en `parada-prorroga.ts` (puras y probadas); aquí sólo se
 * leen y escriben las filas, y todo queda en auditoría.
 */
@Injectable()
export class ParadaProrrogaService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private async orden(id: string) {
    const wo = await this.prisma.workOrder.findUnique({
      where: { id },
      select: {
        id: true, code: true, status: true, scheduledDate: true, fechaOriginal: true,
        paradaInicioReal: true, paradaFinReal: true, plannedDurationMin: true,
      },
    });
    if (!wo) throw new NotFoundException('Orden de mantenimiento no encontrada');
    return wo;
  }

  // ------------------------------------------------------------ 138 · parada
  async declararParada(id: string, evento: EventoParada, hora: string | undefined, userId: string | null, ip?: string) {
    const wo = await this.orden(id);
    const ahora = new Date();
    const r = evaluarEventoDeParada(wo, evento, hora ? new Date(hora) : ahora, ahora);
    if ('error' in r) throw new BadRequestException(r.error);
    const antes = { paradaInicioReal: wo.paradaInicioReal, paradaFinReal: wo.paradaFinReal };
    const hecha = await this.prisma.workOrder.update({
      where: { id },
      data: { [r.campo]: r.valor },
      select: { id: true, paradaInicioReal: true, paradaFinReal: true, plannedDurationMin: true },
    });
    await this.audit.record({
      userId, ip,
      action: evento === 'INICIO' ? 'WO_PARADA_INICIO' : 'WO_PARADA_FIN',
      entity: 'work_orders', entityId: id,
      before: antes, after: { [r.campo]: r.valor },
    });
    return hecha;
  }

  // --------------------------------------------------------- 135 · prórrogas
  listar(id: string) {
    return this.prisma.prorrogaDeOm.findMany({
      where: { workOrderId: id },
      orderBy: { pedidaEn: 'desc' },
      include: {
        pedidaPor: { select: { id: true, fullName: true } },
        resueltaPor: { select: { id: true, fullName: true } },
      },
    });
  }

  async pedir(id: string, fechaPedida: string, motivo: string, userId: string | null, ip?: string) {
    const wo = await this.orden(id);
    const pendiente = await this.prisma.prorrogaDeOm.count({ where: { workOrderId: id, estado: 'PENDIENTE' } });
    const fecha = new Date(fechaPedida);
    const r = evaluarPedidoDeProrroga(wo, fecha, motivo, pendiente > 0, new Date());
    if ('error' in r) throw new BadRequestException(r.error);
    const p = await this.prisma.prorrogaDeOm.create({
      data: {
        workOrderId: id, fechaAnterior: wo.scheduledDate, fechaPedida: fecha,
        motivo: motivo.trim(), pedidaPorId: userId,
      },
    });
    await this.audit.record({
      userId, ip, action: 'WO_PRORROGA_PEDIDA', entity: 'prorrogas_om', entityId: p.id,
      after: { orden: wo.code, fechaAnterior: wo.scheduledDate, fechaPedida: fecha, motivo: p.motivo },
    });
    return p;
  }

  async resolver(id: string, prorrogaId: string, aprobar: boolean, nota: string | undefined, userId: string | null, ip?: string) {
    const p = await this.prisma.prorrogaDeOm.findFirst({ where: { id: prorrogaId, workOrderId: id } });
    if (!p) throw new NotFoundException('Prórroga no encontrada');
    const r = evaluarResolucion(p, userId, aprobar, nota);
    if ('error' in r) throw new BadRequestException(r.error);
    const wo = await this.orden(id);

    /* Todo o nada: si se aprueba, la prórroga y la fecha nueva de la orden
       cambian juntas. La fecha ORIGINAL se guarda una sola vez. */
    const ahora = new Date();
    const resuelta = await this.prisma.$transaction(async (tx) => {
      const hecha = await tx.prorrogaDeOm.update({
        where: { id: prorrogaId },
        data: {
          estado: aprobar ? 'APROBADA' : 'RECHAZADA',
          resueltaPorId: userId, resueltaEn: ahora, nota: nota?.trim() || null,
        },
      });
      if (aprobar) {
        await tx.workOrder.update({
          where: { id },
          data: {
            scheduledDate: p.fechaPedida,
            fechaOriginal: wo.fechaOriginal ?? wo.scheduledDate ?? p.fechaAnterior,
          },
        });
      }
      return hecha;
    });
    await this.audit.record({
      userId, ip,
      action: aprobar ? 'WO_PRORROGA_APROBADA' : 'WO_PRORROGA_RECHAZADA',
      entity: 'prorrogas_om', entityId: prorrogaId,
      before: { scheduledDate: wo.scheduledDate },
      after: { orden: wo.code, scheduledDate: aprobar ? p.fechaPedida : wo.scheduledDate, nota: nota || null },
    });
    return resuelta;
  }

  /** Para la bandeja del supervisor: lo que espera su visto bueno. */
  pendientes() {
    return this.prisma.prorrogaDeOm.findMany({
      where: { estado: 'PENDIENTE', workOrder: { status: { in: ['ABIERTA', 'EN_PROCESO', 'EN_ESPERA'] } } },
      orderBy: { pedidaEn: 'asc' },
      take: 50,
      include: {
        pedidaPor: { select: { id: true, fullName: true } },
        workOrder: { select: { id: true, code: true, activity: true, scheduledDate: true } },
      },
    });
  }
}
