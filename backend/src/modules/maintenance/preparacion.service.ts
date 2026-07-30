import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * PREPARACIÓN DE LA ORDEN — herramientas, materiales y reemplazo de equipo.
 *
 * EL PROBLEMA QUE RESUELVE
 * Tú lo dijiste así: "el software debe soportar todo el preparativo para no ir
 * improvisado". Hoy el técnico sale a campo, llega, y descubre que le falta el
 * engrimpador o el conector. Viaje perdido, y en una parada de planta ese viaje
 * no se recupera.
 *
 * TRES PIEZAS, TRES CONCEPTOS DISTINTOS
 *   Herramientas -> NO se consumen. Se llevan y se devuelven. Se verifican al
 *                   abrir la orden y el Jefe ve el resultado.
 *   Materiales   -> Se consumen. Se registra lo PREVISTO y lo USADO.
 *   Reemplazo    -> Un equipo sale y otro entra desde almacén.
 */
@Injectable()
export class PreparacionService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // ==========================================================================
  //  HERRAMIENTAS
  // ==========================================================================

  /**
   * Herramientas sugeridas para el tipo de orden, con lo que el técnico ya
   * declaró si la orden estaba abierta.
   *
   * Se SUGIERE según el tipo y no se lista todo: una orden de mapeo necesita
   * metrajo y etiquetas; una correctiva de red, engrimpador y probador.
   * Mostrar las 30 herramientas en todas las órdenes haría que nadie las lea.
   */
  async herramientasSugeridas(workOrderId: string) {
    const wo = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: { id: true, type: true, code: true },
    });
    if (!wo) throw new NotFoundException('Orden de mantenimiento no encontrada');

    const [catalogo, yaMarcadas] = await Promise.all([
      this.prisma.tool.findMany({
        where: {
          active: true,
          // Vacío en suggestedFor = se sugiere en TODAS las órdenes.
          OR: [{ suggestedFor: { isEmpty: true } }, { suggestedFor: { has: wo.type } }],
        },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.workOrderTool.findMany({
        where: { workOrderId },
        select: { toolId: true, carried: true, note: true },
      }),
    ]);

    const marcadas = new Map(yaMarcadas.map((m) => [m.toolId, m]));
    return {
      workOrder: { id: wo.id, code: wo.code, type: wo.type },
      herramientas: catalogo.map((t) => ({
        id: t.id,
        code: t.code,
        name: t.name,
        category: t.category,
        notes: t.notes,
        carried: marcadas.get(t.id)?.carried ?? null,
        note: marcadas.get(t.id)?.note ?? null,
      })),
    };
  }

  /**
   * Registra la verificación de herramientas al abrir la orden.
   *
   * Se guarda TAMBIÉN el "no la llevo", a propósito: es el dato que explica un
   * viaje perdido y el que permite al Jefe ver que faltan engrimpadores en el
   * taller, no que el técnico trabaje mal.
   */
  async registrarHerramientas(
    workOrderId: string,
    items: { toolId: string; carried: boolean; note?: string }[],
    userId?: string | null,
    ip?: string | null,
  ) {
    const wo = await this.prisma.workOrder.findUnique({ where: { id: workOrderId } });
    if (!wo) throw new NotFoundException('Orden de mantenimiento no encontrada');
    if (wo.status === 'CERRADA' || wo.status === 'CANCELADA') {
      throw new BadRequestException('La orden ya está cerrada.');
    }
    if (!items?.length) throw new BadRequestException('No se envió ninguna herramienta.');

    for (const it of items) {
      await this.prisma.workOrderTool.upsert({
        where: { workOrderId_toolId: { workOrderId, toolId: it.toolId } },
        create: { workOrderId, toolId: it.toolId, carried: !!it.carried, note: it.note?.trim() || null },
        update: { carried: !!it.carried, note: it.note?.trim() || null },
      });
    }

    const faltantes = items.filter((i) => !i.carried).length;
    await this.audit.record({
      userId: userId || null,
      action: 'WO_TOOLS_CHECK',
      entity: 'work_orders',
      entityId: workOrderId,
      ip,
      after: { om: wo.code, revisadas: items.length, faltantes },
    });

    return { ok: true, revisadas: items.length, faltantes };
  }

  // ==========================================================================
  //  MATERIALES
  // ==========================================================================

  /** Materiales previstos y usados de la orden. */
  async materiales(workOrderId: string) {
    const items = await this.prisma.workOrderMaterial.findMany({
      where: { workOrderId },
      orderBy: { createdAt: 'asc' },
      include: {
        sparePart: {
          select: { id: true, sapCode: true, name: true, unit: true, currentStock: true, minStock: true },
        },
      },
    });

    // Se avisa si lo previsto no alcanza con el stock que refleja SAP. No se
    // bloquea nada: el catálogo local es un espejo, y puede estar desactualizado.
    return items.map((m) => {
      const stock = m.sparePart?.currentStock ?? null;
      const previsto = m.plannedQty ?? 0;
      return {
        ...m,
        alerta: stock !== null && previsto > stock
          ? `Se prevén ${previsto} y el catálogo refleja ${stock}. Revisar en SAP antes de salir.`
          : null,
      };
    });
  }

  /**
   * Agrega un material a la orden.
   *
   * El código SAP se COPIA al momento del registro: si el catálogo cambia
   * después, el histórico de la orden no se altera. Es lo que permite mirar
   * atrás y saber qué se usó realmente, con el código que tenía entonces.
   */
  async agregarMaterial(
    workOrderId: string,
    dto: { sparePartId?: string; description?: string; plannedQty?: number; usedQty?: number; unit?: string },
    userId?: string | null,
    ip?: string | null,
  ) {
    const wo = await this.prisma.workOrder.findUnique({ where: { id: workOrderId } });
    if (!wo) throw new NotFoundException('Orden de mantenimiento no encontrada');

    let sapCode: string | null = null;
    let descripcion = dto.description?.trim() || '';
    let unidad = dto.unit?.trim() || null;

    if (dto.sparePartId) {
      const rep = await this.prisma.sparePart.findUnique({ where: { id: dto.sparePartId } });
      if (!rep) throw new NotFoundException('El repuesto no existe en el catálogo.');
      sapCode = rep.sapCode || null;
      if (!descripcion) descripcion = rep.name;
      if (!unidad) unidad = rep.unit || null;
    }

    // La descripción siempre se llena: sin ella, una línea de material no dice
    // nada al que lea la orden meses después.
    if (!descripcion) {
      throw new BadRequestException('Indica el repuesto del catálogo o escribe una descripción.');
    }

    const item = await this.prisma.workOrderMaterial.create({
      data: {
        workOrderId,
        sparePartId: dto.sparePartId || null,
        sapCode,
        description: descripcion,
        unit: unidad,
        plannedQty: dto.plannedQty ?? null,
        usedQty: dto.usedQty ?? null,
      },
    });

    await this.audit.record({
      userId: userId || null,
      action: 'WO_MATERIAL_ADD',
      entity: 'work_orders',
      entityId: workOrderId,
      ip,
      after: { om: wo.code, material: descripcion, sapCode, previsto: dto.plannedQty ?? null },
    });
    return item;
  }

  /** Ajusta cantidades. Al cerrar se registra lo REALMENTE usado. */
  async actualizarMaterial(
    id: string,
    dto: { plannedQty?: number; usedQty?: number; description?: string },
  ) {
    const ya = await this.prisma.workOrderMaterial.findUnique({ where: { id } });
    if (!ya) throw new NotFoundException('Material no encontrado');
    return this.prisma.workOrderMaterial.update({
      where: { id },
      data: {
        plannedQty: dto.plannedQty ?? undefined,
        usedQty: dto.usedQty ?? undefined,
        description: dto.description?.trim() || undefined,
      },
    });
  }

  async quitarMaterial(id: string) {
    const ya = await this.prisma.workOrderMaterial.findUnique({ where: { id } });
    if (!ya) throw new NotFoundException('Material no encontrado');
    await this.prisma.workOrderMaterial.delete({ where: { id } });
    return { ok: true };
  }

  // ==========================================================================
  //  REEMPLAZO DE EQUIPO
  // ==========================================================================

  /** Equipos disponibles en almacén para reemplazo. */
  async disponiblesEnAlmacen(tipo?: string) {
    return this.prisma.asset.findMany({
      where: { deletedAt: null, status: 'STOCK', ...(tipo ? { type: tipo as any } : {}) },
      select: { id: true, assetCode: true, type: true, brand: true, model: true },
      orderBy: { assetCode: 'asc' },
    });
  }

  /**
   * Registra el reemplazo: qué salió y qué entró.
   *
   * Mueve los estados en la misma transacción. Si se hiciera en dos pasos y el
   * segundo fallara, quedaría un equipo instalado que el sistema sigue creyendo
   * en almacén —y nadie sabría dónde está—.
   */
  async registrarReemplazo(
    workOrderId: string,
    dto: { removedAssetId?: string; installedAssetId?: string; note?: string },
    userId?: string | null,
    ip?: string | null,
  ) {
    const wo = await this.prisma.workOrder.findUnique({ where: { id: workOrderId } });
    if (!wo) throw new NotFoundException('Orden de mantenimiento no encontrada');
    if (!dto.removedAssetId && !dto.installedAssetId) {
      throw new BadRequestException('Indica al menos el equipo retirado o el instalado.');
    }
    if (dto.removedAssetId && dto.removedAssetId === dto.installedAssetId) {
      throw new BadRequestException('El equipo retirado y el instalado no pueden ser el mismo.');
    }

    const retirado = dto.removedAssetId
      ? await this.prisma.asset.findUnique({ where: { id: dto.removedAssetId } })
      : null;
    const instalado = dto.installedAssetId
      ? await this.prisma.asset.findUnique({ where: { id: dto.installedAssetId } })
      : null;

    if (dto.removedAssetId && !retirado) throw new NotFoundException('El equipo retirado no existe.');
    if (dto.installedAssetId && !instalado) throw new NotFoundException('El equipo instalado no existe.');

    const operaciones: any[] = [
      this.prisma.workOrderSwap.create({
        data: {
          workOrderId,
          removedAssetId: dto.removedAssetId || null,
          installedAssetId: dto.installedAssetId || null,
          note: dto.note?.trim() || null,
        },
      }),
    ];

    // El equipo que sale va a STOCK y no a BAJA: puede estar solo con una falla
    // reparable. Darlo de baja automáticamente descartaría equipo recuperable.
    if (retirado) {
      operaciones.push(this.prisma.asset.update({
        where: { id: retirado.id },
        data: { status: 'STOCK' },
      }));
    }
    // El que entra hereda la ubicación y el gabinete del que salió: es donde
    // físicamente quedó montado.
    if (instalado) {
      operaciones.push(this.prisma.asset.update({
        where: { id: instalado.id },
        data: {
          status: 'OPERATIVO',
          locationId: retirado?.locationId ?? instalado.locationId,
          cabinetId: retirado?.cabinetId ?? instalado.cabinetId,
        },
      }));
    }

    const [swap] = await this.prisma.$transaction(operaciones);

    await this.audit.record({
      userId: userId || null,
      action: 'WO_ASSET_SWAP',
      entity: 'work_orders',
      entityId: workOrderId,
      ip,
      after: {
        om: wo.code,
        retirado: retirado?.assetCode || null,
        instalado: instalado?.assetCode || null,
        ubicacionHeredada: retirado?.locationId ? true : false,
      },
    });
    return swap;
  }

  async reemplazos(workOrderId: string) {
    return this.prisma.workOrderSwap.findMany({
      where: { workOrderId },
      orderBy: { createdAt: 'desc' },
      include: {
        removedAsset: { select: { id: true, assetCode: true, type: true, status: true } },
        installedAsset: { select: { id: true, assetCode: true, type: true, status: true } },
      },
    });
  }
}
