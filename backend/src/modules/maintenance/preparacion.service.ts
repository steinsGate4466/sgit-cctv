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
    const filas = items.map((m) => {
      const stock = m.sparePart?.currentStock ?? null;
      const previsto = m.plannedQty ?? 0;
      const retirado = m.withdrawnQty ?? 0;
      const usado = m.usedQty ?? 0;
      return {
        ...m,
        alerta: m.status === 'SOLICITADO' && stock !== null && previsto > stock
          ? `Se prevén ${previsto} y el catálogo refleja ${stock}. Revisar en SAP antes de salir.`
          : null,
        // Lo que sobró y todavía no ha vuelto al almacén. Mientras esto sea
        // mayor que cero, el stock del sistema está por debajo del real.
        porDevolver: m.status === 'RETIRADO' ? Math.max(0, retirado - usado) : 0,
      };
    });

    const pendientes = filas.filter((f) => f.status === 'SOLICITADO');
    return {
      items: filas,
      resumen: {
        solicitados: pendientes.length,
        retirados: filas.filter((f) => f.status === 'RETIRADO').length,
        devueltos: filas.filter((f) => f.status === 'DEVUELTO').length,
        rechazados: filas.filter((f) => f.status === 'RECHAZADO').length,
        // Lo que el ingeniero necesita saber de un vistazo: ¿hay algo que
        // firmar, y hay algo que no alcanza?
        hayQueRetirar: pendientes.length > 0,
        sinStock: pendientes.filter((f) => f.alerta).length,
        porDevolver: filas.reduce((t, f) => t + f.porDevolver, 0),
      },
    };
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

  // ==========================================================================
  //  RETIRO DE ALMACÉN  (bloque 3D)
  //
  //  El flujo que describió el ingeniero: el técnico lista lo que necesita con
  //  su código SAP, y el ingeniero genera la salida de inventario de una vez.
  //  Un clic y una firma, no una línea por una.
  // ==========================================================================

  /**
   * Firma el retiro de TODAS las líneas solicitadas de la orden.
   *
   * POR QUÉ TODO O NADA
   * Va en una sola transacción: o salen todas las líneas con sus movimientos y
   * su descuento de stock, o no sale ninguna. Un retiro a medias dejaría el
   * almacén descontado para material que nadie sacó del estante.
   *
   * POR QUÉ NO SE BLOQUEA POR FALTA DE STOCK
   * El catálogo local es un ESPEJO de SAP y puede estar desactualizado. Si el
   * ingeniero tiene el repuesto en la mano, el sistema no es quién para decirle
   * que no existe. Se avisa, se registra el desvío, y se deja pasar.
   */
  async generarRetiro(
    workOrderId: string,
    dto: { itemIds?: string[]; nota?: string },
    userId: string,
    ip?: string | null,
  ) {
    const wo = await this.prisma.workOrder.findUnique({ where: { id: workOrderId } });
    if (!wo) throw new NotFoundException('Orden de mantenimiento no encontrada');

    const donde: any = { workOrderId, status: 'SOLICITADO' };
    // Si vienen ids, solo esas líneas: el ingeniero puede autorizar una parte.
    if (dto.itemIds?.length) donde.id = { in: dto.itemIds };

    const lineas = await this.prisma.workOrderMaterial.findMany({
      where: donde,
      include: { sparePart: { select: { id: true, name: true, currentStock: true } } },
    });

    if (!lineas.length) {
      throw new BadRequestException('No hay materiales pendientes de retirar en esta orden.');
    }

    const avisos: string[] = [];

    const resultado = await this.prisma.$transaction(async (tx) => {
      const hechas: any[] = [];

      for (const l of lineas) {
        // Lo que sale es lo previsto. Si no se previó cantidad, no se puede
        // retirar: sin número no hay movimiento de almacén posible.
        const cantidad = l.plannedQty ?? 0;
        if (cantidad <= 0) {
          throw new BadRequestException(
            `"${l.description}" no tiene cantidad prevista. Ponla antes de generar el retiro.`,
          );
        }

        let movimientoId: string | null = null;

        // Solo hay movimiento de stock si la línea está ligada al catálogo.
        // Un material escrito a mano (no catalogado) se registra igual en la
        // orden, pero no puede descontar de un repuesto que no existe.
        if (l.sparePartId && l.sparePart) {
          if (l.sparePart.currentStock < cantidad) {
            avisos.push(
              `${l.description}: se retiran ${cantidad} y el catálogo reflejaba ${l.sparePart.currentStock}. Regularizar en SAP.`,
            );
          }

          const mov = await tx.stockMovement.create({
            data: {
              sparePartId: l.sparePartId,
              type: 'RETIRO',
              // Positivo; el signo lo da el tipo. SIN redondear: el cable UTP
              // se mide en metros y 12,5 m son 12,5, no 13.
              quantity: cantidad,
              sapCode: l.sapCode,
              reason: `OM ${wo.code}${dto.nota ? ' · ' + dto.nota.trim() : ''}`,
              userId,
            },
          });
          movimientoId = mov.id;

          await tx.sparePart.update({
            where: { id: l.sparePartId },
            data: { currentStock: { decrement: cantidad } },
          });
        }

        const act = await tx.workOrderMaterial.update({
          where: { id: l.id },
          data: {
            status: 'RETIRADO',
            withdrawnQty: cantidad,
            movementId: movimientoId,
            withdrawnById: userId,
            withdrawnAt: new Date(),
          },
        });
        hechas.push(act);
      }

      return hechas;
    });

    await this.audit.record({
      userId,
      action: 'WO_MATERIAL_RETIRO',
      entity: 'work_orders',
      entityId: workOrderId,
      ip,
      after: {
        om: wo.code,
        lineas: resultado.length,
        materiales: resultado.map((r: any) => `${r.description} x${r.withdrawnQty}`),
        avisos,
      },
    });

    return { retirados: resultado.length, avisos };
  }

  /** El ingeniero no autoriza una línea. El motivo es obligatorio. */
  async rechazarMaterial(id: string, motivo: string, userId: string, ip?: string | null) {
    const l = await this.prisma.workOrderMaterial.findUnique({
      where: { id },
      include: { workOrder: { select: { code: true, id: true } } },
    });
    if (!l) throw new NotFoundException('Material no encontrado');
    if (l.status !== 'SOLICITADO') {
      throw new BadRequestException('Solo se puede rechazar un material que todavía no se retiró.');
    }
    // Un "no" sin explicación hace que el técnico vuelva a pedir lo mismo la
    // semana siguiente, y nadie aprende nada.
    if (!motivo?.trim()) {
      throw new BadRequestException('Explica por qué no se autoriza. Es obligatorio.');
    }

    const act = await this.prisma.workOrderMaterial.update({
      where: { id },
      data: { status: 'RECHAZADO', rejectedReason: motivo.trim() },
    });

    await this.audit.record({
      userId,
      action: 'WO_MATERIAL_RECHAZO',
      entity: 'work_orders',
      entityId: l.workOrder.id,
      ip,
      after: { om: l.workOrder.code, material: l.description, motivo: motivo.trim() },
    });
    return act;
  }

  /**
   * Devuelve al almacén lo que se retiró y no se usó.
   *
   * POR QUÉ ESTO NO ES OPCIONAL
   * Sin devolución, el sistema descuenta lo que salió y nunca acredita lo que
   * volvió. En tres meses el stock del sistema no se parece al del estante, la
   * alerta de mínimos deja de avisar cuando toca, y el almacén se vuelve un
   * número en el que nadie confía.
   *
   * Se llama al cerrar la orden, cuando ya se sabe lo REALMENTE usado.
   */
  async devolverSobrante(workOrderId: string, userId: string, ip?: string | null) {
    const wo = await this.prisma.workOrder.findUnique({ where: { id: workOrderId } });
    if (!wo) throw new NotFoundException('Orden de mantenimiento no encontrada');

    const lineas = await this.prisma.workOrderMaterial.findMany({
      where: { workOrderId, status: 'RETIRADO' },
    });

    const conSobrante = lineas.filter(
      (l) => (l.withdrawnQty ?? 0) - (l.usedQty ?? 0) > 0 && !!l.sparePartId,
    );

    // Las líneas retiradas y consumidas por completo también cierran su ciclo:
    // pasan a DEVUELTO con cero, para que ninguna quede eternamente "retirada".
    const sinSobrante = lineas.filter(
      (l) => (l.withdrawnQty ?? 0) - (l.usedQty ?? 0) <= 0 || !l.sparePartId,
    );

    if (!lineas.length) return { devueltos: 0, unidades: 0 };

    const total = await this.prisma.$transaction(async (tx) => {
      let unidades = 0;

      for (const l of conSobrante) {
        const sobra = (l.withdrawnQty ?? 0) - (l.usedQty ?? 0);
        const mov = await tx.stockMovement.create({
          data: {
            sparePartId: l.sparePartId!,
            type: 'INGRESO',
            quantity: sobra,
            sapCode: l.sapCode,
            reason: `Devolución de OM ${wo.code}`,
            userId,
          },
        });
        await tx.sparePart.update({
          where: { id: l.sparePartId! },
          data: { currentStock: { increment: sobra } },
        });
        await tx.workOrderMaterial.update({
          where: { id: l.id },
          data: { status: 'DEVUELTO', returnedQty: sobra, returnMovementId: mov.id },
        });
        unidades += sobra;
      }

      for (const l of sinSobrante) {
        await tx.workOrderMaterial.update({
          where: { id: l.id },
          data: { status: 'DEVUELTO', returnedQty: 0 },
        });
      }

      return unidades;
    });

    await this.audit.record({
      userId,
      action: 'WO_MATERIAL_DEVOLUCION',
      entity: 'work_orders',
      entityId: workOrderId,
      ip,
      after: { om: wo.code, lineas: conSobrante.length, unidades: total },
    });

    return { devueltos: conSobrante.length, unidades: total };
  }


  // ==========================================================================
  //  PERMISO DE ACCESO ANTES DE SUBIR  (bloque 3C)
  //
  //  El permiso de altura y la orden de trabajo vivían separados: se pedía el
  //  manlift por un lado y se abría la orden por otro. Si el permiso no estaba
  //  aprobado, el técnico se enteraba ARRIBA DEL TREN, con el equipo en la
  //  mano y la parada corriendo.
  //
  //  Esto no BLOQUEA la apertura: hay trabajos del mismo activo que no exigen
  //  altura, y el sistema no puede saberlo por él. Pero lo pone delante, en el
  //  único momento en que sirve de algo: antes de salir.
  // ==========================================================================

  async accesoDelActivo(workOrderId: string) {
    const wo = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: { id: true, assetId: true, asset: { select: { assetCode: true } } },
    });
    if (!wo) throw new NotFoundException('Orden de mantenimiento no encontrada');
    if (!wo.assetId) return { aplica: false, motivo: 'La orden no cuelga de un activo concreto.' };

    // La MÁS RECIENTE. Un permiso rechazado hace tres meses no descalifica uno
    // aprobado ayer, y al revés tampoco.
    const solicitud = await this.prisma.accessRequest.findFirst({
      where: { assetId: wo.assetId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, code: true, status: true, means: true, heightMeters: true,
        requiresPetar: true, hasIperc: true, hasAts: true, personnelCount: true,
        reviewedAt: true, decisionNotes: true,
      },
    });

    if (!solicitud) {
      return {
        aplica: false,
        assetCode: wo.asset?.assetCode || null,
        motivo: 'Este equipo no tiene ninguna solicitud de acceso registrada.',
      };
    }

    const aprobado = solicitud.status === 'APROBADO';

    // Aprobado el permiso, faltan los papeles del día: el IPERC se hace una
    // vez, pero el ATS es del DÍA de trabajo. Un permiso aprobado sin ATS no
    // habilita a nadie a subir.
    const faltan: string[] = [];
    if (aprobado) {
      if (solicitud.requiresPetar && !solicitud.hasIperc) faltan.push('IPERC');
      if (solicitud.requiresPetar && !solicitud.hasAts) faltan.push('ATS del día');
      if ((solicitud.personnelCount ?? 0) < 2) faltan.push('segunda persona (mínimo 2 en altura)');
    }

    return {
      aplica: true,
      assetCode: wo.asset?.assetCode || null,
      solicitud,
      aprobado,
      faltan,
      // Lo que el técnico tiene que leer, en una frase.
      resumen: !aprobado
        ? `El permiso de acceso ${solicitud.code} está ${solicitud.status.toLowerCase()}. NO subas hasta que esté aprobado.`
        : faltan.length
        ? `Permiso aprobado, pero falta: ${faltan.join(', ')}.`
        : `Permiso ${solicitud.code} aprobado y con la documentación completa.`,
    };
  }

}
