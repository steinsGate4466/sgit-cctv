import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { estadoRutina, motivoBloqueo, actividadDesdeHallazgo } from './checklist.util';

/**
 * Rutina preventiva por tipo de activo.
 *
 * Antes de esto, QUÉ se hace en una visita preventiva no existía como dato:
 * vivía en la cabeza del técnico. Cada uno hacía lo que recordaba, el que
 * entraba nuevo no sabía por dónde empezar, y no había forma de comprobar si
 * se hizo lo que había que hacer.
 */
@Injectable()
export class ChecklistService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- PLANTILLAS

  async plantillas() {
    return this.prisma.checklistTemplate.findMany({
      orderBy: { assetType: 'asc' },
      include: {
        items: { where: { active: true }, orderBy: [{ sequence: 'asc' }, { createdAt: 'asc' }] },
        _count: { select: { items: true } },
      },
    });
  }

  async crearPlantilla(dto: any, userId?: string | null, ip?: string | null) {
    if (!dto?.assetType) throw new BadRequestException('Indica el tipo de activo.');
    const ya = await this.prisma.checklistTemplate.findUnique({
      where: { assetType: dto.assetType },
    });
    // Una sola rutina por tipo: dos para cámaras acabarían divergiendo y nadie
    // sabría cuál es la buena.
    if (ya) throw new BadRequestException(`Ya existe una rutina para ${dto.assetType}.`);

    const t = await this.prisma.checklistTemplate.create({
      data: {
        assetType: dto.assetType,
        name: (dto.name || '').trim() || `Rutina preventiva · ${dto.assetType}`,
      },
    });
    await this.audit.record({
      userId: userId || null, action: 'RUTINA_CREATE', entity: 'checklist_templates',
      entityId: t.id, ip, after: { tipo: t.assetType, nombre: t.name },
    });
    return t;
  }

  async actualizarPlantilla(id: string, dto: any) {
    const ya = await this.prisma.checklistTemplate.findUnique({ where: { id } });
    if (!ya) throw new NotFoundException('Rutina no encontrada');
    return this.prisma.checklistTemplate.update({
      where: { id },
      data: {
        name: dto.name?.trim() || undefined,
        active: dto.active !== undefined ? !!dto.active : undefined,
      },
    });
  }

  // -------------------------------------------------------------------- PUNTOS

  async agregarPunto(templateId: string, dto: any, userId?: string | null, ip?: string | null) {
    const t = await this.prisma.checklistTemplate.findUnique({ where: { id: templateId } });
    if (!t) throw new NotFoundException('Rutina no encontrada');

    const texto = (dto?.text || '').trim();
    // En imperativo y sin ambigüedad: "Limpiar el lente y comprobar imagen en
    // el púlpito", no "revisar cámara". Un punto vago no se puede responder.
    if (!texto) throw new BadRequestException('Escribe qué hay que comprobar.');
    if (texto.length > 200) throw new BadRequestException('El punto es demasiado largo (máximo 200).');

    const item = await this.prisma.checklistItem.create({
      data: {
        templateId,
        text: texto,
        help: dto.help?.trim() || null,
        sequence: Number(dto.sequence) || 0,
        critical: !!dto.critical,
      },
    });
    await this.audit.record({
      userId: userId || null, action: 'RUTINA_PUNTO_ADD', entity: 'checklist_templates',
      entityId: templateId, ip, after: { tipo: t.assetType, punto: texto, critico: item.critical },
    });
    return item;
  }

  async actualizarPunto(id: string, dto: any) {
    const ya = await this.prisma.checklistItem.findUnique({ where: { id } });
    if (!ya) throw new NotFoundException('Punto no encontrado');
    return this.prisma.checklistItem.update({
      where: { id },
      data: {
        text: dto.text?.trim() || undefined,
        help: dto.help !== undefined ? (dto.help?.trim() || null) : undefined,
        sequence: dto.sequence !== undefined ? Number(dto.sequence) || 0 : undefined,
        critical: dto.critical !== undefined ? !!dto.critical : undefined,
        active: dto.active !== undefined ? !!dto.active : undefined,
      },
    });
  }

  /**
   * DESACTIVA el punto. No lo borra.
   * Las órdenes ya cerradas respondieron a él: borrarlo dejaría esas rutinas
   * con respuestas huérfanas y el informe de una visita pasada mentiría.
   */
  async quitarPunto(id: string) {
    const ya = await this.prisma.checklistItem.findUnique({ where: { id } });
    if (!ya) throw new NotFoundException('Punto no encontrado');
    return this.prisma.checklistItem.update({ where: { id }, data: { active: false } });
  }

  // ------------------------------------------------------------ EN LA ORDEN

  /**
   * La rutina que le toca a esta orden, con lo ya respondido y su estado.
   *
   * La rutina se elige por el TIPO DEL ACTIVO de la orden. Si la orden no
   * cuelga de un activo, o si ese tipo no tiene rutina definida, se devuelve
   * vacío con el motivo: es información, no un error.
   */
  async rutinaDeOrden(workOrderId: string) {
    const wo = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: { id: true, type: true, assetId: true, asset: { select: { assetCode: true, type: true } } },
    });
    if (!wo) throw new NotFoundException('Orden de mantenimiento no encontrada');

    if (!wo.asset) {
      return { aplica: false, motivo: 'La orden no cuelga de un activo concreto.' };
    }

    const plantilla = await this.prisma.checklistTemplate.findUnique({
      where: { assetType: wo.asset.type },
      include: {
        items: { where: { active: true }, orderBy: [{ sequence: 'asc' }, { createdAt: 'asc' }] },
      },
    });

    if (!plantilla || !plantilla.active || !plantilla.items.length) {
      return {
        aplica: false,
        assetType: wo.asset.type,
        motivo: `Todavía no hay rutina definida para ${wo.asset.type}. Se crea en Preventivo → Rutinas.`,
      };
    }

    const respuestas = await this.prisma.workOrderChecklist.findMany({
      where: { workOrderId },
      select: { itemId: true, result: true, note: true },
    });

    const estado = estadoRutina(plantilla.items as any, respuestas as any);

    return {
      aplica: true,
      assetCode: wo.asset.assetCode,
      assetType: wo.asset.type,
      plantilla: { id: plantilla.id, name: plantilla.name },
      puntos: plantilla.items,
      respuestas,
      estado,
      bloqueo: motivoBloqueo(estado),
      // Lo que se ofrecerá convertir en correctivo. Se PROPONE, no se crea:
      // una tarde de preventivos no puede llenar el tablero de órdenes que
      // nadie decidió.
      propuestas: estado.paraCorrectivo.map((p) => ({
        itemId: p.id,
        texto: p.text,
        actividad: actividadDesdeHallazgo(
          p,
          respuestas.find((r) => r.itemId === p.id)?.note,
          wo.asset?.assetCode,
        ),
      })),
    };
  }

  /** Responde (o corrige) un punto. Vuelve a responder ACTUALIZA, no duplica. */
  async responder(workOrderId: string, dto: any, userId?: string | null, ip?: string | null) {
    const wo = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: { id: true, code: true, status: true },
    });
    if (!wo) throw new NotFoundException('Orden de mantenimiento no encontrada');
    if (wo.status === 'CERRADA' || wo.status === 'CANCELADA') {
      throw new BadRequestException('La orden ya está cerrada: la rutina no se puede modificar.');
    }
    if (!dto?.itemId || !dto?.result) {
      throw new BadRequestException('Falta el punto o el resultado.');
    }

    const item = await this.prisma.checklistItem.findUnique({ where: { id: dto.itemId } });
    if (!item) throw new NotFoundException('Punto de rutina no encontrado');

    const nota = (dto.note || '').trim() || null;
    // Un "no conforme" mudo no le dice nada a quien lea la orden dentro de seis
    // meses. Se exige aquí y no solo en la pantalla: la pantalla se puede
    // saltar, el servidor no.
    if (dto.result === 'NO_OK' && !nota) {
      throw new BadRequestException(`"${item.text}": marcaste NO conforme. Di qué encontraste.`);
    }

    const respuesta = await this.prisma.workOrderChecklist.upsert({
      where: { workOrderId_itemId: { workOrderId, itemId: dto.itemId } },
      create: { workOrderId, itemId: dto.itemId, result: dto.result, note: nota },
      update: { result: dto.result, note: nota },
    });

    // Solo se audita el NO conforme: es el que tiene consecuencias. Auditar
    // cada "OK" llenaría el registro de ruido y escondería lo que importa.
    if (dto.result === 'NO_OK') {
      await this.audit.record({
        userId: userId || null, action: 'RUTINA_NO_CONFORME', entity: 'work_orders',
        entityId: workOrderId, ip,
        after: { om: wo.code, punto: item.text, critico: item.critical, detalle: nota },
      });
    }
    return respuesta;
  }
}
