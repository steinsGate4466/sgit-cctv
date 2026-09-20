import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { equiposDeLaOrden, Papel } from './om-equipos';

/**
 * APUNTAR LOS EQUIPOS DE UNA ORDEN — bloque 110-B.
 *
 * =============================================================================
 *  LO QUE CIERRA
 * =============================================================================
 *  El 110-A creó la tabla y traspasó lo que ya había. Esto es lo que permite
 *  apuntar equipos NUEVOS: el técnico llega, ve que además de la cámara hay que
 *  tocar el switch, y lo añade a la misma orden en vez de abrir otra o dejarlo
 *  sin registrar.
 *
 *  Hasta hoy la única salida era dejarlo sin registrar, y por eso los
 *  indicadores estaban bajos.
 *
 * =============================================================================
 *  QUIÉN PUEDE, Y POR QUÉ NO ES EL SUPERVISOR
 * =============================================================================
 *  Apuntar un equipo es registrar lo que ACABA DE PASAR en campo. Es el trabajo
 *  del técnico, y va con `wo.update` —el mismo permiso con el que ya detalla la
 *  orden—. La regla del bloque 106-B, aplicada igual:
 *
 *    · REGISTRAR lo que acaba de pasar  → el permiso de quien lo hace.
 *    · REESCRIBIR lo que ya está escrito → el supervisor.
 *
 *  Aquí no se reescribe nada: se añade. Y quitar una fila mal apuntada es
 *  corregir un error del momento, no reescribir el pasado, así que va con el
 *  mismo permiso y queda auditado con el antes.
 */
@Injectable()
export class OmEquiposService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** Tope por orden. Una OM con más de 200 equipos es un error de dedo. */
  static readonly TOPE = 200;

  private async orden(id: string) {
    const w = await this.prisma.workOrder.findUnique({
      where: { id },
      select: { id: true, code: true, status: true },
    });
    if (!w) throw new NotFoundException('Orden de mantenimiento no encontrada');
    return w;
  }

  /** Los equipos de una orden, con las listas ya separadas por papel. */
  async listar(workOrderId: string) {
    const w = await this.orden(workOrderId);
    const filas = await this.prisma.omEquipo.findMany({
      where: { workOrderId },
      orderBy: [{ papel: 'asc' }, { createdAt: 'asc' }],
      take: OmEquiposService.TOPE,
      select: {
        id: true, assetId: true, papel: true, accionCode: true, nota: true,
        createdAt: true,
        asset: { select: { id: true, assetCode: true, type: true, status: true } },
        apuntadoPor: { select: { id: true, fullName: true } },
      },
    });

    const resumen = equiposDeLaOrden(
      filas.map((f) => ({ assetId: f.assetId, papel: f.papel as Papel })),
    );
    return { orden: { id: w.id, code: w.code, status: w.status }, resumen, items: filas };
  }

  /**
   * APUNTAR un equipo en la orden.
   *
   * ---------------------------------------------------------------------------
   * SOBRE UNA ORDEN CERRADA NO SE APUNTA NADA
   * ---------------------------------------------------------------------------
   * Y no es rigidez: una orden cerrada ya entró en los indicadores del mes.
   * Añadirle un equipo después cambiaría una cifra que alguien ya leyó en una
   * reunión, sin que nadie se entere. Si hay que corregirla, se reabre —que
   * deja rastro— o se abre otra orden.
   */
  async apuntar(
    workOrderId: string,
    dto: { assetId?: string; papel?: string; accionCode?: string; nota?: string },
    actorId?: string | null,
    ip?: string,
  ) {
    const w = await this.orden(workOrderId);
    if (w.status === 'CERRADA' || w.status === 'CANCELADA') {
      throw new BadRequestException(
        `Esta orden está ${w.status.toLowerCase()} y ya entró en los indicadores. `
        + 'Para añadirle un equipo hay que reabrirla, que deja rastro, o abrir otra orden.',
      );
    }

    const assetId = (dto.assetId || '').trim();
    if (!assetId) throw new BadRequestException('Elige el equipo que se va a apuntar.');

    const papel = (dto.papel || 'INTERVENIDO').toUpperCase();
    if (papel !== 'REPORTADO' && papel !== 'INTERVENIDO') {
      throw new BadRequestException('El papel sólo puede ser REPORTADO o INTERVENIDO.');
    }

    const activo = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: { id: true, assetCode: true, deletedAt: true },
    });
    if (!activo || activo.deletedAt) throw new NotFoundException('Activo no encontrado');

    const cuantos = await this.prisma.omEquipo.count({ where: { workOrderId } });
    if (cuantos >= OmEquiposService.TOPE) {
      throw new BadRequestException(
        `Esta orden ya tiene ${cuantos} equipos apuntados. Si de verdad son tantos, `
        + 'conviene partirla en varias: una orden que toca doscientos equipos no se '
        + 'puede cerrar ni medir.',
      );
    }

    /* VOLVER A APUNTARLO ACTUALIZA, NO DUPLICA. El índice único lo garantiza
       igual, pero mejor que lo resuelva esto a que el técnico se lleve un error
       de base de datos por pulsar dos veces. */
    const fila = await this.prisma.omEquipo.upsert({
      where: { workOrderId_assetId_papel: { workOrderId, assetId, papel: papel as any } },
      create: {
        workOrderId,
        assetId,
        papel: papel as any,
        accionCode: dto.accionCode?.trim() || null,
        nota: dto.nota?.trim() || null,
        apuntadoPorId: actorId || null,
      },
      update: {
        accionCode: dto.accionCode?.trim() || null,
        nota: dto.nota?.trim() || null,
      },
    });

    await this.audit.record({
      userId: actorId || null,
      action: 'OM_EQUIPO_APUNTADO',
      entity: 'om_equipos',
      entityId: fila.id,
      ip,
      after: { orden: w.code, equipo: activo.assetCode, papel },
    });

    return { ok: true, id: fila.id };
  }

  /** Quitar una fila mal apuntada. Queda auditado CON lo que había. */
  async quitar(workOrderId: string, id: string, actorId?: string | null, ip?: string) {
    const w = await this.orden(workOrderId);
    const fila = await this.prisma.omEquipo.findUnique({
      where: { id },
      select: {
        id: true, workOrderId: true, papel: true,
        asset: { select: { assetCode: true } },
      },
    });
    if (!fila || fila.workOrderId !== workOrderId) {
      throw new NotFoundException('Ese equipo no está apuntado en esta orden');
    }
    if (w.status === 'CERRADA' || w.status === 'CANCELADA') {
      throw new BadRequestException(
        'La orden está cerrada: quitarle un equipo cambiaría un indicador ya publicado.',
      );
    }

    await this.prisma.omEquipo.delete({ where: { id } });

    /* AQUÍ SÍ SE BORRA, y es la única excepción del proyecto. Una fila apuntada
       por error no es historia: es ruido que ensucia la cuenta de
       intervenciones. Por eso la auditoría guarda QUÉ se quitó — el hecho
       sobrevive aunque la fila no. */
    await this.audit.record({
      userId: actorId || null,
      action: 'OM_EQUIPO_RETIRADO',
      entity: 'om_equipos',
      entityId: id,
      ip,
      before: { orden: w.code, equipo: fila.asset?.assetCode ?? null, papel: fila.papel },
    });

    return { ok: true };
  }
}
