import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSpareDto } from './dto/create-spare.dto';
import { UpdateSpareDto } from './dto/update-spare.dto';
import { QuerySpareDto } from './dto/query-spare.dto';
import { MovementDto } from './dto/movement.dto';
import { CheckDto } from './dto/check.dto';
import { LinkAssetDto } from './dto/link-asset.dto';
import { leerCatalogo, ResultadoLectura, leerGrilla } from './catalogo-csv.util';

const STALE_DAYS = 2; // repuesto "sin comprobar" si pasan más de N días

function flags(r: any) {
  return { ...r, lowStock: r.currentStock < r.minStock, outOfStock: r.currentStock <= 0 };
}

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateSpareDto) {
    return this.prisma.sparePart.create({
      data: {
        sapCode: dto.sapCode, name: dto.name, description: dto.description,
        category: dto.category, brand: dto.brand, model: dto.model,
        unit: dto.unit, warehouse: dto.warehouse,
        currentStock: dto.currentStock ?? 0, minStock: dto.minStock ?? 0,
      },
    });
  }

  async findAll(q: QuerySpareDto) {
    const where: any = {};
    if (q.q && q.q.trim()) {
      const t = q.q.trim();
      where.OR = [
        { name: { contains: t, mode: 'insensitive' } },
        { sapCode: { contains: t, mode: 'insensitive' } },
        { model: { contains: t, mode: 'insensitive' } },
        { category: { contains: t, mode: 'insensitive' } },
      ];
    }
    if (q.category) where.category = q.category;

    // BAJO MÍNIMO: se filtra en la BASE, no después de traer las filas.
    //
    // Antes se traía todo y se filtraba en memoria con .filter(). Al paginar,
    // eso se convierte en un fallo silencioso: se filtraría sólo la página
    // actual, así que "50 repuestos bajo mínimo" podría enseñar 3 porque los
    // otros 47 estaban en la página siguiente. Un contador que miente sobre
    // repuestos es cómo se llega al día de la parada sin la pieza.
    //
    // Prisma no compara dos columnas entre sí, así que los identificadores
    // salen de una consulta cruda y se usan como filtro normal.
    if (q.lowStock === 'true') {
      const bajos = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM spare_parts WHERE "currentStock" <= "minStock"
      `;
      where.id = { in: bajos.map((b) => b.id) };
    }

    // PAGINACIÓN. El almacén de SAP puede traer miles de referencias tras la
    // importación del Excel: traerlas todas en cada consulta es lento y, en
    // el celular del técnico, directamente insostenible.
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(q.pageSize) || 50));

    const [total, rows] = await Promise.all([
      this.prisma.sparePart.count({ where }),
      this.prisma.sparePart.findMany({
        where, orderBy: { name: 'asc' },
        include: { _count: { select: { assets: true } } },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map(flags),
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async findOne(id: string) {
    const sp = await this.prisma.sparePart.findUnique({
      where: { id },
      include: {
        assets: { include: { asset: { select: { id: true, assetCode: true, type: true, model: true, status: true } } } },
        movements: { orderBy: { createdAt: 'desc' }, take: 20, include: { user: { select: { fullName: true } } } },
        checks: { orderBy: { checkedAt: 'desc' }, take: 20, include: { user: { select: { fullName: true } } } },
      },
    });
    if (!sp) throw new NotFoundException('Repuesto no encontrado');
    return flags(sp);
  }

  async update(id: string, dto: UpdateSpareDto) {
    await this.ensure(id);
    return this.prisma.sparePart.update({ where: { id }, data: dto as any });
  }

  async remove(id: string) {
    await this.ensure(id);
    await this.prisma.sparePart.delete({ where: { id } });
    return { ok: true };
  }

  // ---------- compatibilidad repuesto <-> activo ----------
  async linkAsset(id: string, dto: LinkAssetDto) {
    await this.ensure(id);
    return this.prisma.sparePartAsset.upsert({
      where: { sparePartId_assetId: { sparePartId: id, assetId: dto.assetId } },
      update: {},
      create: { sparePartId: id, assetId: dto.assetId },
    });
  }
  async unlinkAsset(id: string, assetId: string) {
    await this.prisma.sparePartAsset.deleteMany({ where: { sparePartId: id, assetId } });
    return { ok: true };
  }

  // Repuestos compatibles con un activo: por vínculo directo O por mismo modelo.
  async sparesForAsset(assetId: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw new NotFoundException('Activo no encontrado');
    const or: any[] = [{ assets: { some: { assetId } } }];
    if (asset.model) or.push({ model: { equals: asset.model, mode: 'insensitive' } });
    const rows = await this.prisma.sparePart.findMany({ where: { OR: or }, orderBy: { name: 'asc' } });
    return rows.map(flags);
  }

  /* ==========================================================================
     MOVIMIENTOS DE STOCK — bloque 37
     --------------------------------------------------------------------------
     DOS FALLOS QUE TENÍA ESTA FUNCIÓN, Y LOS DOS SOLO SE VEN CON GENTE A LA VEZ

     1) EL LIBRO Y EL SALDO PODÍAN DEJAR DE CUADRAR.
        Eran dos escrituras sueltas: primero el movimiento, después el stock.
        Si la segunda fallaba —se cae la conexión, se reinicia el contenedor—
        quedaba un RETIRO registrado que nunca descontó nada. El libro decía
        que salieron 3 y el saldo seguía igual. Nadie lo nota hasta el
        inventario físico, y para entonces hay meses de movimientos encima y
        es imposible saber cuál fue.
        Ahora las dos van en una transacción: o las dos, o ninguna.

     2) EL STOCK SE CALCULABA EN JAVASCRIPT.
        `sp.currentStock + delta` se leía, se sumaba aquí, y se escribía. Dos
        técnicos retirando 3 de un stock de 5 leían los dos «5», calculaban
        los dos «2», y guardaban «2». Se llevaron 6 piezas de 5 y el sistema
        dice que quedan 2. Y la comprobación de negativo no lo ve, porque cada
        uno mira su propia lectura.
        Ahora se usa `{ increment: delta }`, que PostgreSQL traduce a
        `SET "currentStock" = "currentStock" + n` — se resuelve dentro de la
        base, en una sola operación, sin hueco donde colarse.

     EL NEGATIVO SE COMPRUEBA DOS VECES, Y NO SOBRA
     Antes de escribir, para poder dar un mensaje que se entienda. Y DESPUÉS,
     dentro de la transacción, porque la primera comprobación se hizo sobre
     una lectura que ya puede estar vieja. La segunda es la que de verdad
     protege; la primera es la que se lee bien.
     ========================================================================== */
  async registerMovement(id: string, dto: MovementDto, userId?: string) {
    const sp = await this.ensure(id);
    let delta = 0;
    if (dto.type === 'INGRESO') delta = Math.abs(dto.quantity);
    else if (dto.type === 'RETIRO') delta = -Math.abs(dto.quantity);
    else delta = dto.quantity; // AJUSTE: +/-

    if (sp.currentStock + delta < 0) {
      throw new BadRequestException(
        `Quedan ${sp.currentStock} y el movimiento retira ${Math.abs(delta)}: dejaría el stock en negativo.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.stockMovement.create({
        data: {
          sparePartId: id, type: dto.type as any, quantity: Math.abs(dto.quantity),
          sapCode: dto.sapCode, reason: dto.reason, userId: userId || null,
        },
      });

      const actualizado = await tx.sparePart.update({
        where: { id },
        data: { currentStock: { increment: delta } },
      });

      /* La suma la hizo PostgreSQL, así que este número es el real, no el que
         yo había calculado. Si otro se adelantó y el resultado quedó negativo,
         la excepción deshace la transacción ENTERA: no queda ni el movimiento
         ni el descuento. */
      if (actualizado.currentStock < 0) {
        throw new BadRequestException(
          'Otra persona retiró este repuesto mientras registrabas el movimiento y ya no hay suficiente. ' +
          'Actualiza la pantalla y vuelve a mirar el stock.',
        );
      }
      return actualizado;
    });
  }

  /* ==========================================================================
     COMPROBACIÓN FÍSICA (control diario)
     --------------------------------------------------------------------------
     Aquí NO se usa `increment`: el conteo físico no es un delta, es la verdad.
     Alguien contó y hay 7. Se escribe 7, se pisa lo que hubiera, y eso es lo
     correcto — es justo para lo que sirve un inventario físico.

     Lo que sí hacía falta es la transacción. El registro guarda `previousQty`
     para poder ver el ajuste después; si el conteo se escribe y el registro
     no, se pierde la única prueba de cuánto se corrigió y por qué.
     ========================================================================== */
  async registerCheck(id: string, dto: CheckDto, userId?: string) {
    const sp = await this.ensure(id);
    return this.prisma.$transaction(async (tx) => {
      await tx.stockCheck.create({
        data: {
          sparePartId: id, countedQty: dto.countedQty, previousQty: sp.currentStock,
          note: dto.note, userId: userId || null,
        },
      });
      return tx.sparePart.update({
        where: { id },
        data: { currentStock: dto.countedQty, lastCheckedAt: new Date() },
      });
    });
  }

  // ---------- dashboard de inventario ----------
  async summary() {
    const parts = await this.prisma.sparePart.findMany({
      include: { assets: { include: { asset: { select: { status: true } } } } },
    });
    const now = Date.now();
    let totalUnits = 0, shortage = 0, outOfStock = 0, stale = 0;
    const criticalList: any[] = [];
    const byCategory: Record<string, { category: string; stock: number; field: number }> = {};

    for (const p of parts) {
      totalUnits += p.currentStock;
      const low = p.currentStock < p.minStock;
      const out = p.currentStock <= 0;
      if (low) shortage++;
      if (out) outOfStock++;
      const daysSince = p.lastCheckedAt ? (now - new Date(p.lastCheckedAt).getTime()) / 86400000 : 999;
      if (daysSince > STALE_DAYS) stale++;
      const fieldCount = p.assets.filter((a: any) => a.asset.status !== 'BAJA').length;
      if (low || out) {
        criticalList.push({ id: p.id, name: p.name, sapCode: p.sapCode, currentStock: p.currentStock, minStock: p.minStock, fieldCount });
      }
      const c = p.category || 'Sin categoría';
      if (!byCategory[c]) byCategory[c] = { category: c, stock: 0, field: 0 };
      byCategory[c].stock += p.currentStock;
      byCategory[c].field += fieldCount;
    }

    return {
      totalItems: parts.length,
      totalUnits,
      shortage,
      outOfStock,
      stale,
      criticalList: criticalList.sort((a, b) => a.currentStock - b.currentStock).slice(0, 10),
      byCategory: Object.values(byCategory),
    };
  }

  private async ensure(id: string) {
    const sp = await this.prisma.sparePart.findUnique({ where: { id } });
    if (!sp) throw new NotFoundException('Repuesto no encontrado');
    return sp;
  }

  // ==========================================================================
  //  IMPORTACIÓN DEL CATÁLOGO DESDE SAP
  //
  //  El almacén de verdad está en SAP. Este catálogo es un ESPEJO para poder
  //  comparar ("pediste 50 m, en SAP hay 20"), no una segunda contabilidad.
  //  Por eso la importación ACTUALIZA el stock local con lo que dice SAP en vez
  //  de sumar o restar: SAP manda.
  // ==========================================================================

  /**
   * Lee el archivo y devuelve QUÉ HARÍA, sin escribir nada.
   *
   * Existe este paso a propósito: subir un archivo mal exportado y descubrirlo
   * después de haber sobrescrito 300 repuestos sería un desastre difícil de
   * revertir. Primero se ve, después se aplica.
   */
  /**
   * Vía EXCEL (3G): el navegador ya leyó el .xlsx y manda la rejilla con los
   * valores tipados. No hay texto que interpretar, así que no hay nada que
   * adivinar: 0,125 es 0,125 y no 125.
   */
  async previsualizarGrilla(encabezados: any[], filas: any[][]) {
    return this.previsualizarLectura(leerGrilla(encabezados, filas));
  }

  async importarGrilla(encabezados: any[], filas: any[][], userId?: string | null) {
    return this.aplicarLectura(leerGrilla(encabezados, filas), userId);
  }

  async previsualizarCatalogo(contenido: string) {
    return this.previsualizarLectura(leerCatalogo(contenido));
  }

  /** Cuerpo común de la previsualización, venga de CSV o de Excel. */
  private async previsualizarLectura(lectura: ResultadoLectura) {
    if (!lectura.filas.length) {
      return { ...lectura, nuevos: 0, actualizados: 0, cambios: [] as any[] };
    }

    const codigos = lectura.filas.map((f) => f.sapCode);
    const existentes = await this.prisma.sparePart.findMany({
      where: { sapCode: { in: codigos } },
      select: { id: true, sapCode: true, name: true, currentStock: true, minStock: true },
    });
    const porCodigo = new Map(existentes.map((e) => [e.sapCode as string, e]));

    const cambios = lectura.filas.map((f) => {
      const ya = porCodigo.get(f.sapCode);
      return {
        sapCode: f.sapCode,
        name: f.name,
        accion: ya ? 'actualizar' : 'crear',
        stockAntes: ya?.currentStock ?? null,
        stockDespues: f.currentStock ?? ya?.currentStock ?? 0,
        // Se destaca la diferencia: es lo que el Jefe necesita revisar antes
        // de aceptar, sobre todo si el archivo llegó desactualizado.
        diferencia: ya != null && f.currentStock != null ? f.currentStock - ya.currentStock : null,
      };
    });

    return {
      ...lectura,
      nuevos: cambios.filter((c) => c.accion === 'crear').length,
      actualizados: cambios.filter((c) => c.accion === 'actualizar').length,
      cambios,
    };
  }

  /**
   * Aplica la importación. El código SAP es la identidad del repuesto.
   *
   * Se usa upsert por sapCode y NO se borra nada que no venga en el archivo:
   * una exportación parcial de SAP —solo un almacén, solo una familia— no debe
   * hacer desaparecer el resto del catálogo.
   */
  async importarCatalogo(contenido: string, userId?: string | null) {
    return this.aplicarLectura(leerCatalogo(contenido), userId);
  }

  /** Cuerpo común de la importación, venga de CSV o de Excel. */
  private async aplicarLectura(lectura: ResultadoLectura, userId?: string | null) {
    if (!lectura.filas.length) {
      throw new BadRequestException(
        lectura.rechazadas[0]?.motivo || 'El archivo no contiene filas válidas.',
      );
    }

    let creados = 0;
    let actualizados = 0;
    const fallidos: { sapCode: string; motivo: string }[] = [];

    // ------------------------------------------------------------------
    //  POR QUÉ ESTO NO VA FILA A FILA
    //
    //  Antes, por cada fila del Excel se hacía una consulta para ver si el
    //  repuesto existía y otra para guardarlo. Con un maestro de SAP de
    //  3.000 referencias son 6.000 idas y vueltas a la base: varios minutos
    //  con la pantalla en "cargando", y el ingeniero pensando que se colgó.
    //
    //  Ahora: UNA consulta para saber cuáles existen, y las escrituras en
    //  tandas dentro de una transacción.
    // ------------------------------------------------------------------
    const codigos = lectura.filas.map((f) => f.sapCode);
    const existentes = new Map(
      (await this.prisma.sparePart.findMany({
        where: { sapCode: { in: codigos } },
        select: { id: true, sapCode: true },
      })).map((r) => [r.sapCode, r.id]),
    );

    const datosDe = (f: any) => ({
      name: f.name,
      category: f.category ?? undefined,
      brand: f.brand ?? undefined,
      model: f.model ?? undefined,
      unit: f.unit ?? undefined,
      warehouse: f.warehouse ?? undefined,
      ...(f.currentStock !== undefined ? { currentStock: f.currentStock } : {}),
      ...(f.minStock !== undefined ? { minStock: f.minStock } : {}),
    });

    const escrituraDe = (f: any) => {
      const id = existentes.get(f.sapCode);
      return id
        ? this.prisma.sparePart.update({ where: { id }, data: datosDe(f) })
        : this.prisma.sparePart.create({ data: { sapCode: f.sapCode, ...datosDe(f) } });
    };

    const TANDA = 200;
    for (let i = 0; i < lectura.filas.length; i += TANDA) {
      const tanda = lectura.filas.slice(i, i + TANDA);
      try {
        await this.prisma.$transaction(tanda.map(escrituraDe));
        for (const f of tanda) existentes.has(f.sapCode) ? actualizados++ : creados++;
      } catch {
        // SI LA TANDA FALLA, SE REPITE FILA A FILA.
        //
        // Agrupar es rápido pero pierde el detalle: si una sola fila trae un
        // dato imposible, la transacción entera se cae y no se sabría cuál.
        // Y ese detalle es justo lo que el ingeniero necesita para arreglar
        // su Excel. Así que en el caso raro —que algo falle— se paga la
        // lentitud a cambio de poder decir QUÉ fila y POR QUÉ.
        for (const f of tanda) {
          try {
            await escrituraDe(f);
            existentes.has(f.sapCode) ? actualizados++ : creados++;
          } catch (e: any) {
            fallidos.push({ sapCode: f.sapCode, motivo: e?.message || 'Error al guardar.' });
          }
        }
      }
    }

    return {
      creados,
      actualizados,
      fallidos,
      rechazadas: lectura.rechazadas,
      columnasDetectadas: lectura.columnasDetectadas,
      total: lectura.filas.length,
      // Se devuelve quién la aplicó. El registro de auditoría lo escribe el
      // interceptor global; este dato es para que la pantalla pueda decir
      // "aplicada por ti" sin una consulta más. El parámetro estaba muerto y
      // eso hacía creer que la auditoría se hacía aquí.
      aplicadaPor: userId || null,
    };
  }

  /**
   * COBERTURA DE UNA CAMPAÑA.
   *
   * Antes de arrancar el barrido de antenas hay que saber si el almacén
   * alcanza. Sin esto, la campaña se planifica de memoria y se detiene a mitad
   * de camino por falta de material.
   */
  async coberturaCampana(items: { sapCode: string; cantidad: number }[]) {
    const codigos = items.map((i) => i.sapCode);
    const repuestos = await this.prisma.sparePart.findMany({
      where: { sapCode: { in: codigos } },
      select: { sapCode: true, name: true, currentStock: true, unit: true },
    });
    const porCodigo = new Map(repuestos.map((r) => [r.sapCode as string, r]));

    const detalle = items.map((i) => {
      const r = porCodigo.get(i.sapCode);
      const hay = r?.currentStock ?? null;
      return {
        sapCode: i.sapCode,
        name: r?.name || null,
        unit: r?.unit || null,
        necesario: i.cantidad,
        disponible: hay,
        // null = el repuesto no está en el catálogo. Es distinto de "hay cero":
        // significa que ni siquiera se sabe si existe.
        falta: hay === null ? null : Math.max(0, i.cantidad - hay),
        cubierto: hay !== null && hay >= i.cantidad,
      };
    });

    return {
      cubierta: detalle.every((d) => d.cubierto),
      sinCatalogar: detalle.filter((d) => d.disponible === null).length,
      insuficientes: detalle.filter((d) => d.falta !== null && d.falta > 0).length,
      detalle,
    };
  }

  // ==========================================================================
  //  CATÁLOGO DE HERRAMIENTAS
  //
  //  Viven aquí, junto a los repuestos, porque las dos cosas son catálogos de
  //  almacén. Pero NO se mezclan en la misma tabla: una herramienta no se
  //  consume y su stock nunca bajaría, así que tratarla como repuesto daría un
  //  dato permanentemente falso.
  //
  //  El catálogo arranca VACÍO a propósito. Los nombres de las herramientas los
  //  pone el personal de planta, no yo: ya cometí ese error con las etapas del
  //  proceso y hubo que borrarlas de producción.
  // ==========================================================================

  async herramientas(soloActivas = true) {
    const rows = await this.prisma.tool.findMany({
      where: soloActivas ? { active: true } : {},
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { checks: true } } },
    });
    return rows.map((t: any) => ({ ...t, vecesRevisada: t._count?.checks ?? 0 }));
  }

  async crearHerramienta(dto: any) {
    const name = (dto?.name || '').trim();
    if (!name) throw new BadRequestException('El nombre de la herramienta es obligatorio.');

    const code = (dto?.code || '').trim().toUpperCase() || null;
    if (code) {
      const ya = await this.prisma.tool.findUnique({ where: { code } });
      if (ya) throw new BadRequestException(`Ya existe una herramienta con el código ${code}.`);
    }

    return this.prisma.tool.create({
      data: {
        code,
        name,
        category: dto?.category?.trim() || null,
        notes: dto?.notes?.trim() || null,
        // Vacío = se sugiere en TODAS las órdenes. Es el valor por defecto
        // correcto: es mejor sugerir de más que ocultar una herramienta
        // necesaria porque nadie configuró en qué tipos aplica.
        suggestedFor: Array.isArray(dto?.suggestedFor) ? dto.suggestedFor : [],
      },
    });
  }

  async actualizarHerramienta(id: string, dto: any) {
    const ya = await this.prisma.tool.findUnique({ where: { id } });
    if (!ya) throw new NotFoundException('Herramienta no encontrada');
    return this.prisma.tool.update({
      where: { id },
      data: {
        name: dto?.name?.trim() || undefined,
        category: dto?.category !== undefined ? (dto.category?.trim() || null) : undefined,
        notes: dto?.notes !== undefined ? (dto.notes?.trim() || null) : undefined,
        suggestedFor: Array.isArray(dto?.suggestedFor) ? dto.suggestedFor : undefined,
        active: dto?.active !== undefined ? !!dto.active : undefined,
      },
    });
  }

  /**
   * Desactiva la herramienta. No se borra: las verificaciones pasadas de las
   * órdenes la referencian, y borrarla dejaría sin sentido esos registros.
   */
  async desactivarHerramienta(id: string) {
    const ya = await this.prisma.tool.findUnique({ where: { id } });
    if (!ya) throw new NotFoundException('Herramienta no encontrada');
    return this.prisma.tool.update({ where: { id }, data: { active: false } });
  }

  /**
   * Herramientas que MÁS FALTAN, según lo declarado por los técnicos.
   *
   * Es el dato que convierte la encuesta en una decisión de compra: si el
   * engrimpador falta en 8 de 10 salidas, el problema no es el técnico —hay que
   * comprar engrimpadores—.
   */
  async herramientasQueFaltan() {
    const faltas = await this.prisma.workOrderTool.groupBy({
      by: ['toolId'],
      where: { carried: false },
      _count: { _all: true },
    });
    if (!faltas.length) return [];

    const tools = await this.prisma.tool.findMany({
      where: { id: { in: faltas.map((f) => f.toolId) } },
      select: { id: true, name: true, category: true },
    });
    const nombres = new Map(tools.map((t) => [t.id, t]));

    const totales = await this.prisma.workOrderTool.groupBy({
      by: ['toolId'],
      where: { toolId: { in: faltas.map((f) => f.toolId) } },
      _count: { _all: true },
    });
    const total = new Map(totales.map((t) => [t.toolId, t._count._all]));

    return faltas
      .map((f) => ({
        toolId: f.toolId,
        name: nombres.get(f.toolId)?.name || '—',
        category: nombres.get(f.toolId)?.category || null,
        vecesFaltó: f._count._all,
        vecesRevisada: total.get(f.toolId) || f._count._all,
        porcentaje: Math.round((f._count._all / (total.get(f.toolId) || 1)) * 100),
      }))
      .sort((a, b) => b.vecesFaltó - a.vecesFaltó);
  }
}
