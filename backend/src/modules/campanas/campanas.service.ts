import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TOPE_LISTA_PANTALLA, cabecerasDeRecorte } from '../../common/tope-de-filas';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { defectosDeConjunto, revisarFicha, tieneBloqueantes, ActivoParaRevisar, Defecto } from './calidad-ficha';
import { aTrenDePlanta } from '../../common/tren-de-planta';
import { avanceDeMeta, esMapeo, estadoDelPlan, fechasMal, tipoCanonico } from './plan-de-campana';
import { diaDePlanta } from '../../common/dia-de-planta';

/* Un día del calendario (aaaa-mm-dd) se guarda a MEDIODÍA de la planta. A
   medianoche UTC sería el día ANTERIOR en Perú (UTC-5), y la zona saldría con
   un día menos en la pantalla y «atrasada» un día antes de tiempo. */
const aFecha = (v: unknown): Date | null => (v ? diaDePlanta(String(v)) : null);
const ESTADOS_CAMPANA = ['PLANIFICADA', 'EN_CURSO', 'EN_REVISION', 'CERRADA', 'CANCELADA'];

/**
 * CAMPAÑAS DE MAPEO (12.5) — el control de calidad del levantamiento
 *
 * ===========================================================================
 *  POR QUÉ ESTO ES LO ÚLTIMO QUE FALTABA ANTES DE MAPEAR
 * ===========================================================================
 *  Contra un dato mal cargado **ningún respaldo sirve**: el respaldo devuelve
 *  fielmente el dato equivocado. Y un mapeo de 300 cámaras hecho con el
 *  teléfono, en una nave a 40 grados, con guantes, va a traer códigos
 *  repetidos, fichas a medias y equipos sin ubicación. No por descuido: por
 *  las condiciones.
 *
 *  La única defensa real es que **alguien distinto** mire antes de dar la
 *  zona por buena.
 *
 * ===========================================================================
 *  LAS DOS REGLAS QUE LO CONVIERTEN EN CONTROL DE CALIDAD
 * ===========================================================================
 *
 *  1. **QUIEN REVISA NO PUEDE SER QUIEN CARGÓ.**
 *     Sin esto es una casilla que se marca sola. El técnico que acaba de
 *     cargar 40 fichas a las once de la noche no es la persona capaz de ver
 *     que a doce les falta la foto: acaba de mirarlas todas y su cabeza ya
 *     las da por buenas.
 *
 *  2. **UNA ZONA CON DEFECTOS BLOQUEANTES NO SE APRUEBA.**
 *     No es un aviso que se salte pulsando dos veces. Si hay un código
 *     repetido o un activo sin ubicación, la zona se devuelve.
 *
 *  Y una tercera que es de trato, no de código: la zona se DEVUELVE con la
 *  lista concreta de qué arreglar, activo por activo. Devolver un trabajo
 *  diciendo "está mal" sin decir qué es la forma más rápida de que la
 *  siguiente zona venga peor.
 *
 * ===========================================================================
 *  BLOQUE 175 · CAMPAÑAS DE CUALQUIER TIPO
 * ===========================================================================
 *  El tipo es libre (Mapeo, Instalación, Rotulado…). Lo común a todas es el
 *  PLAN: cada zona con quién, desde, hasta y cuánto. Las dos reglas de arriba
 *  siguen valiendo para todas; la revisión ficha por ficha, sólo para MAPEO
 *  (ver plan-de-campana.ts).
 */
@Injectable()
export class CampanasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async siguienteCodigo(): Promise<string> {
    const anio = new Date().getFullYear();
    const ultima = await this.prisma.campanaMapeo.findFirst({
      where: { codigo: { startsWith: `CAM-${anio}-` } },
      orderBy: { codigo: 'desc' }, select: { codigo: true },
    });
    const n = ultima ? Number(ultima.codigo.split('-')[2]) + 1 : 1;
    return `CAM-${anio}-${String(n).padStart(2, '0')}`;
  }

  /** Bloque 174 · con techo; el total viaja en X-Total para que la pantalla lo diga. */
  async listar(estado?: string, tipo?: string, res?: { setHeader: (k: string, v: string) => unknown }) {
    const where: any = {};
    if (estado) where.estado = estado;
    if (tipo) {
      // «Mapeo» incluye las campañas viejas, que no tienen tipo.
      where.OR = esMapeo(tipo)
        ? [{ tipo: null }, { tipo: { equals: tipo, mode: 'insensitive' } }]
        : [{ tipo: { equals: tipo, mode: 'insensitive' } }];
    }
    const [filas, total] = await Promise.all([
      this.prisma.campanaMapeo.findMany({
        where,
        orderBy: { creadoEn: 'desc' },
        include: {
          _count: { select: { zonas: true, activos: true } },
          zonas: { select: { estado: true, inicioPrevisto: true, finPrevisto: true } },
        },
        take: TOPE_LISTA_PANTALLA,
      }),
      this.prisma.campanaMapeo.count({ where }),
    ]);
    cabecerasDeRecorte(res, filas.length, total);
    const ahora = new Date();
    return filas.map(({ zonas, ...c }) => {
      const aprobadas = zonas.filter((z) => z.estado === 'APROBADA').length;
      return {
        ...c,
        tipo: c.tipo ?? 'Mapeo',
        atrasadas: zonas.filter((z) => estadoDelPlan(z, ahora) === 'ATRASADA').length,
        aprobadas,
        pctAprobado: zonas.length ? Math.round((aprobadas / zonas.length) * 100) : 0,
      };
    });
  }

  /**
   * Los tipos que ya se usaron, para ofrecerlos con un clic. `groupBy` y no
   * `findMany`: devuelve una fila por tipo, no una por campaña.
   */
  async tipos() {
    const g = await this.prisma.campanaMapeo.groupBy({ by: ['tipo'], _count: { _all: true } });
    const porClave = new Map<string, { tipo: string; n: number }>();
    for (const x of g) {
      const tipo = x.tipo ?? 'Mapeo';
      const k = tipo.toLowerCase();
      const prev = porClave.get(k);
      porClave.set(k, { tipo: prev?.tipo ?? tipo, n: (prev?.n ?? 0) + x._count._all });
    }
    return [...porClave.values()].sort((a, b) => b.n - a.n);
  }

  private async exigirResponsable(id?: string | null) {
    if (!id) return null;
    const u = await this.prisma.user.findFirst({ where: { id, active: true }, select: { id: true } });
    if (!u) throw new BadRequestException('Esa persona no existe o está desactivada.');
    return id;
  }

  private async tiposExistentes(): Promise<string[]> {
    return (await this.tipos()).map((t) => t.tipo);
  }

  async crear(dto: any, userId?: string | null, ip?: string | null) {
    const nombre = String(dto.nombre || '').trim();
    if (nombre.length < 3) throw new BadRequestException('Ponle un nombre a la campaña, de 3 letras o más.');
    if (String(dto.tipo || '').trim().length < 3) {
      throw new BadRequestException('Di de qué es la campaña (Mapeo, Instalación, Rotulado…): sin tipo no se puede filtrar ni comparar.');
    }
    const tipo = tipoCanonico(dto.tipo, await this.tiposExistentes());
    const inicio = aFecha(dto.inicioPrevisto), fin = aFecha(dto.finPrevisto);
    const mal = fechasMal(inicio, fin);
    if (mal) throw new BadRequestException(mal);
    const codigo = await this.siguienteCodigo();
    const c = await this.prisma.campanaMapeo.create({
      data: {
        codigo,
        nombre,
        tipo,
        // En mapeo lo que se cuenta son equipos; en lo demás, lo que diga quien planifica.
        unidad: String(dto.unidad || '').trim().slice(0, 40) || (esMapeo(tipo) ? 'equipos' : null),
        tren: (aTrenDePlanta(dto.tren) as any) ?? null,
        descripcion: dto.descripcion?.trim() || null,
        responsableId: await this.exigirResponsable(dto.responsableId),
        inicioPrevisto: inicio,
        finPrevisto: fin,
        creadoPorId: userId || null,
      },
      include: { _count: { select: { zonas: true, activos: true } } },
    });
    await this.audit.record({ userId, action: 'CREATE', entity: 'campanas', entityId: c.id, ip, after: { codigo, tipo } });
    return c;
  }

  /**
   * Cambiar el plan o el estado de la campaña.
   * · CERRADA sólo con todas sus zonas aprobadas: cerrar con trabajo sin revisar
   *   diría «hecho» de algo que nadie confirmó. Si no se va a terminar, se CANCELA,
   *   y cancelar exige decir por qué.
   * · Cerrada o cancelada, sólo se puede reabrir (volver a EN_CURSO).
   */
  async editar(id: string, dto: any, userId?: string | null, ip?: string | null) {
    const c = await this.prisma.campanaMapeo.findUnique({
      where: { id }, include: { zonas: { select: { estado: true } } },
    });
    if (!c) throw new NotFoundException('Esa campaña no existe.');
    const data: any = {};
    const terminada = c.estado === 'CERRADA' || c.estado === 'CANCELADA';

    if (dto.estado && dto.estado !== c.estado) {
      if (!ESTADOS_CAMPANA.includes(dto.estado)) throw new BadRequestException('Ese estado no existe.');
      if (dto.estado === 'CERRADA') {
        const sinAprobar = c.zonas.filter((z) => z.estado !== 'APROBADA').length;
        if (!c.zonas.length) throw new BadRequestException('No se cierra una campaña sin zonas: no hay nada que dar por hecho. Si no va, cancélala.');
        if (sinAprobar) {
          throw new BadRequestException(`Quedan ${sinAprobar} zona(s) sin aprobar. Apruébalas o, si no se van a hacer, cancela la campaña.`);
        }
        data.cerradaEn = new Date();
      }
      if (dto.estado === 'CANCELADA' && String(dto.motivo || '').trim().length < 5) {
        throw new BadRequestException('Di por qué se cancela. Dentro de tres meses nadie lo recordará.');
      }
      if (dto.estado !== 'CERRADA') data.cerradaEn = null;
      data.estado = dto.estado;
    }

    const tocaPlan = ['nombre', 'tipo', 'unidad', 'descripcion', 'responsableId', 'inicioPrevisto', 'finPrevisto', 'tren']
      .some((k) => dto[k] !== undefined);
    if (tocaPlan) {
      if (terminada && !data.estado) {
        throw new BadRequestException('La campaña está cerrada o cancelada. Reábrela antes de cambiar el plan.');
      }
      if (dto.nombre !== undefined) {
        const n = String(dto.nombre || '').trim();
        if (n.length < 3) throw new BadRequestException('El nombre necesita 3 letras o más.');
        data.nombre = n;
      }
      if (dto.tipo !== undefined) {
        if (String(dto.tipo || '').trim().length < 3) throw new BadRequestException('El tipo necesita 3 letras o más.');
        data.tipo = tipoCanonico(dto.tipo, await this.tiposExistentes());
      }
      if (dto.unidad !== undefined) data.unidad = String(dto.unidad || '').trim().slice(0, 40) || null;
      if (dto.descripcion !== undefined) data.descripcion = String(dto.descripcion || '').trim() || null;
      if (dto.responsableId !== undefined) data.responsableId = await this.exigirResponsable(dto.responsableId);
      if (dto.tren !== undefined) data.tren = (aTrenDePlanta(dto.tren) as any) ?? null;
      const inicio = dto.inicioPrevisto !== undefined ? aFecha(dto.inicioPrevisto) : c.inicioPrevisto;
      const fin = dto.finPrevisto !== undefined ? aFecha(dto.finPrevisto) : c.finPrevisto;
      const mal = fechasMal(inicio, fin);
      if (mal) throw new BadRequestException(mal);
      if (dto.inicioPrevisto !== undefined) data.inicioPrevisto = inicio;
      if (dto.finPrevisto !== undefined) data.finPrevisto = fin;
    }
    if (!Object.keys(data).length) return c;

    const r = await this.prisma.campanaMapeo.update({ where: { id }, data });
    await this.audit.record({
      userId, action: 'UPDATE', entity: 'campanas', entityId: id, ip,
      before: { estado: c.estado }, after: { ...data, motivo: dto.motivo?.trim() || undefined },
    });
    return r;
  }

  /** Repartir zonas. Una zona = una ubicación asignada a una persona, con su plan. */
  async repartir(
    campanaId: string,
    zonas: Array<{ locationId: string; asignadoAId?: string; esperados?: number | string; notas?: string; inicioPrevisto?: string; finPrevisto?: string }>,
  ) {
    const c = await this.prisma.campanaMapeo.findUnique({
      where: { id: campanaId }, select: { id: true, estado: true, inicioPrevisto: true, finPrevisto: true },
    });
    if (!c) throw new NotFoundException('Esa campaña no existe.');
    if (c.estado === 'CERRADA' || c.estado === 'CANCELADA') throw new BadRequestException('La campaña está cerrada.');

    // Se comprueban TODAS antes de escribir ninguna: un reparto a medias es peor
    // que uno rechazado, porque nadie sabe qué zonas entraron.
    const filas = zonas.filter((z) => z?.locationId);
    for (const z of filas) {
      const inicio = z.inicioPrevisto ? aFecha(z.inicioPrevisto) : c.inicioPrevisto;
      const fin = z.finPrevisto ? aFecha(z.finPrevisto) : c.finPrevisto;
      const mal = fechasMal(inicio, fin);
      if (mal) throw new BadRequestException(mal);
      if (z.esperados !== undefined && z.esperados !== '' && z.esperados !== null
        && (!Number.isInteger(Number(z.esperados)) || Number(z.esperados) < 0)) {
        throw new BadRequestException('La meta de una zona es un número entero, 0 o más.');
      }
    }

    /* CON TIPO, no `const creadas = []`.
       Un array literal vacío sin anotar lo infiere TypeScript como `never[]`,
       y entonces `push` de cualquier cosa falla con un mensaje que habla de
       `never` y no menciona el array por ningún lado. Cuesta más leer el
       error que arreglarlo. */
    const creadas: any[] = [];
    let yaEstaban = 0;
    for (const z of filas) {
      try {
        creadas.push(await this.prisma.zonaCampana.create({
          data: {
            campanaId,
            locationId: z.locationId,
            asignadoAId: z.asignadoAId || null,
            // NO se inventa un número de equipos esperados. Si el ingeniero
            // no lo sabe, se deja vacío: un número inventado se daría por
            // bueno y "faltan 3" sería una alarma falsa para siempre.
            esperados: z.esperados === undefined || z.esperados === '' || z.esperados === null ? null : Number(z.esperados),
            notas: z.notas?.trim() || null,
            // Sin fechas propias, la zona hereda las de la campaña.
            inicioPrevisto: z.inicioPrevisto ? aFecha(z.inicioPrevisto) : c.inicioPrevisto,
            finPrevisto: z.finPrevisto ? aFecha(z.finPrevisto) : c.finPrevisto,
          },
        }));
      } catch {
        // Ya estaba repartida (índice único campaña+ubicación). No es un error,
        // pero se DICE: si no, el usuario cree que entró dos veces.
        yaEstaban += 1;
      }
    }
    if (c.estado === 'PLANIFICADA' && creadas.length) {
      await this.prisma.campanaMapeo.update({ where: { id: campanaId }, data: { estado: 'EN_CURSO' } });
    }
    return { ok: true, creadas: creadas.length, yaEstaban };
  }

  private async zonaConCampana(zonaId: string) {
    const z = await this.prisma.zonaCampana.findUnique({
      where: { id: zonaId },
      include: { campana: { select: { id: true, tipo: true, estado: true } } },
    });
    if (!z) throw new NotFoundException('Esa zona no existe.');
    return z;
  }

  /** Cambiar el plan de UNA zona: quién, cuándo y cuánto. */
  async editarZona(zonaId: string, dto: any, userId?: string | null, ip?: string | null) {
    const z = await this.zonaConCampana(zonaId);
    if (z.campana.estado === 'CERRADA' || z.campana.estado === 'CANCELADA') {
      throw new BadRequestException('La campaña está cerrada.');
    }
    if (z.estado === 'APROBADA') throw new BadRequestException('Esta zona ya está aprobada: su plan ya se cumplió.');
    const data: any = {};
    if (dto.asignadoAId !== undefined) data.asignadoAId = await this.exigirResponsable(dto.asignadoAId);
    if (dto.esperados !== undefined) {
      if (dto.esperados === '' || dto.esperados === null) data.esperados = null;
      else {
        const n = Number(dto.esperados);
        if (!Number.isInteger(n) || n < 0) throw new BadRequestException('La meta es un número entero, 0 o más.');
        data.esperados = n;
      }
    }
    if (dto.notas !== undefined) data.notas = String(dto.notas || '').trim() || null;
    const inicio = dto.inicioPrevisto !== undefined ? aFecha(dto.inicioPrevisto) : z.inicioPrevisto;
    const fin = dto.finPrevisto !== undefined ? aFecha(dto.finPrevisto) : z.finPrevisto;
    const mal = fechasMal(inicio, fin);
    if (mal) throw new BadRequestException(mal);
    if (dto.inicioPrevisto !== undefined) data.inicioPrevisto = inicio;
    if (dto.finPrevisto !== undefined) data.finPrevisto = fin;
    if (!Object.keys(data).length) return z;
    const r = await this.prisma.zonaCampana.update({ where: { id: zonaId }, data });
    // Mover un plazo se audita con el de antes: sin eso, una zona atrasada
    // se «pone al día» moviendo la fecha y no queda rastro (bloque 16).
    await this.audit.record({
      userId, action: 'UPDATE', entity: 'campanas', entityId: zonaId, ip,
      before: { inicioPrevisto: z.inicioPrevisto, finPrevisto: z.finPrevisto, esperados: z.esperados, asignadoAId: z.asignadoAId },
      after: data,
    });
    return r;
  }

  /**
   * Anotar cuánto se lleva hecho. Sólo en campañas que NO son de mapeo: en
   * mapeo lo hecho son los equipos cargados y se cuenta solo — dejar escribirlo
   * a mano sería tener dos números para lo mismo.
   */
  async anotarAvance(zonaId: string, hechosIn: unknown, notas: string | undefined, userId?: string | null, ip?: string | null) {
    const z = await this.zonaConCampana(zonaId);
    if (esMapeo(z.campana.tipo)) {
      throw new BadRequestException('En una campaña de mapeo el avance se cuenta solo: son los equipos cargados en la zona.');
    }
    if (z.campana.estado === 'CERRADA' || z.campana.estado === 'CANCELADA') throw new BadRequestException('La campaña está cerrada.');
    if (z.estado === 'APROBADA') throw new BadRequestException('Esta zona ya está aprobada.');
    const hechos = Number(hechosIn);
    if (!Number.isInteger(hechos) || hechos < 0) throw new BadRequestException('Lo hecho es un número entero, 0 o más.');
    const r = await this.prisma.zonaCampana.update({
      where: { id: zonaId },
      data: {
        hechos,
        ...(notas !== undefined ? { notas: String(notas || '').trim() || null } : {}),
        // Quien anota avance ya está en campo. Una zona devuelta vuelve al trabajo.
        ...(hechos > 0 && ['PENDIENTE', 'DEVUELTA'].includes(z.estado) ? { estado: 'EN_CAMPO' as any } : {}),
      },
    });
    await this.audit.record({ userId, action: 'UPDATE', entity: 'campanas', entityId: zonaId, ip, before: { hechos: z.hechos }, after: { hechos } });
    return r;
  }

  /**
   * LA REVISIÓN. Coge todos los activos de la zona y les pasa las mismas
   * reglas, una a una y luego en conjunto.
   */
  async revisarZona(zonaId: string) {
    const z = await this.prisma.zonaCampana.findUnique({
      where: { id: zonaId },
      include: {
        location: { select: { id: true, code: true, name: true, path: true } },
        campana: { select: { tipo: true, unidad: true } },
      },
    });
    if (!z) throw new NotFoundException('Esa zona no existe.');

    const zona = {
      id: z.id, estado: z.estado, esperados: z.esperados, hechos: z.hechos,
      cargadaPorId: z.cargadaPorId, revisadaPorId: z.revisadaPorId,
      observaciones: z.observaciones, notas: z.notas,
      ubicacion: z.location,
    };

    /* Bloque 175 · lo que NO es mapeo no entrega fichas: entrega trabajo hecho.
       Se aprueba cuando quien lo hizo dijo «terminé», y lo aprueba otra persona
       (esa regla la pone `decidirZona`, para todas). */
    if (!esMapeo(z.campana.tipo)) {
      const hechos = z.hechos ?? 0;
      const dijoTermine = z.estado === 'CARGADA';
      return {
        esMapeo: false, tipo: z.campana.tipo, unidad: z.campana.unidad,
        zona,
        total: hechos,
        faltan: z.esperados != null ? Math.max(0, z.esperados - hechos) : null,
        limpios: null, conBloqueantes: 0, conAvisos: 0,
        sePuedeAprobar: dijoTermine,
        motivoSiNo: dijoTermine ? null : 'Quien la trabaja todavía no ha dicho «terminé» en esta zona.',
        activos: [],
      };
    }

    // Todo lo que cuelga de esa ubicación, con lo justo para juzgarlo.
    const activos = await this.prisma.asset.findMany({
      where: { locationId: z.locationId, deletedAt: null },
      select: {
        id: true, assetCode: true, type: true, brand: true, model: true,
        serialNumber: true, locationId: true, cabinetId: true, tableroId: true,
        referencePlace: true, isDraft: true, ipAddress: true,
        _count: { select: { photos: true } },
      },
      orderBy: { assetCode: 'asc' },
    });

    const paraRevisar: ActivoParaRevisar[] = activos.map((a) => ({
      id: a.id, assetCode: a.assetCode, type: a.type as string,
      brand: a.brand, model: a.model, serialNumber: a.serialNumber,
      locationId: a.locationId, cabinetId: a.cabinetId, tableroId: a.tableroId,
      referencePlace: a.referencePlace, isDraft: a.isDraft,
      ipAddress: a.ipAddress, fotos: a._count.photos,
    }));

    const deConjunto = defectosDeConjunto(paraRevisar);
    const revisados = paraRevisar.map((a) => {
      const defectos: Defecto[] = [...revisarFicha(a), ...(deConjunto.get(a.id) ?? [])];
      return {
        id: a.id, assetCode: a.assetCode, tipo: a.type,
        defectos,
        bloqueantes: defectos.filter((d) => d.gravedad === 'BLOQUEANTE').length,
        avisos: defectos.filter((d) => d.gravedad === 'AVISO').length,
        ok: defectos.length === 0,
      };
    });

    const conBloqueantes = revisados.filter((r) => r.bloqueantes > 0);
    const conAvisos = revisados.filter((r) => r.bloqueantes === 0 && r.avisos > 0);

    return {
      esMapeo: true, tipo: z.campana.tipo ?? 'Mapeo', unidad: z.campana.unidad ?? 'equipos',
      zona,
      total: revisados.length,
      // Sólo se avisa si el ingeniero DIJO cuántos esperaba. Sin ese dato no
      // se inventa una diferencia.
      faltan: z.esperados != null ? Math.max(0, z.esperados - revisados.length) : null,
      limpios: revisados.filter((r) => r.ok).length,
      conBloqueantes: conBloqueantes.length,
      conAvisos: conAvisos.length,
      sePuedeAprobar: conBloqueantes.length === 0 && revisados.length > 0,
      motivoSiNo: revisados.length === 0
        ? 'No hay ningún activo cargado en esta zona todavía.'
        : conBloqueantes.length > 0
          ? `Hay ${conBloqueantes.length} activo(s) con defectos que impiden usarlos. Devuelve la zona con la lista.`
          : null,
      activos: revisados,
    };
  }

  /** El técnico dice "terminé". */
  async marcarCargada(zonaId: string, userId?: string | null, ip?: string | null) {
    const z = await this.zonaConCampana(zonaId);
    if (z.estado === 'APROBADA') throw new BadRequestException('Esta zona ya está aprobada.');
    if (z.campana.estado === 'CERRADA' || z.campana.estado === 'CANCELADA') throw new BadRequestException('La campaña está cerrada.');
    // Bloque 175 · fuera del mapeo, «terminé» sin decir cuánto no se puede revisar.
    if (!esMapeo(z.campana.tipo) && z.hechos == null) {
      throw new BadRequestException('Anota cuánto se hizo antes de decir «terminé»: quien revisa necesita ese número.');
    }

    const r = await this.prisma.zonaCampana.update({
      where: { id: zonaId },
      data: { estado: 'CARGADA', cargadaPorId: userId || null, cargadaEn: new Date() },
    });
    await this.audit.record({ userId, action: 'UPDATE', entity: 'campanas', entityId: zonaId, ip, after: { estado: 'CARGADA' } });
    return r;
  }

  /**
   * APROBAR O DEVOLVER.
   *
   * Aquí viven las dos reglas. La del revisor distinto se comprueba ANTES
   * que nada: si es la misma persona, ni se mira la calidad, porque el
   * resultado no valdría de todos modos.
   */
  async decidirZona(
    zonaId: string,
    aprobar: boolean,
    observaciones: string | undefined,
    userId?: string | null,
    ip?: string | null,
  ) {
    const z = await this.prisma.zonaCampana.findUnique({ where: { id: zonaId } });
    if (!z) throw new NotFoundException('Esa zona no existe.');

    if (!userId) throw new ForbiddenException('Sesión no válida.');
    if (z.cargadaPorId && z.cargadaPorId === userId) {
      throw new ForbiddenException(
        'No puedes revisar una zona que cargaste tú. Tiene que mirarla otra persona: ' +
        'quien acaba de cargar 40 fichas ya las da por buenas en su cabeza, y ese es ' +
        'justo el motivo por el que existe la revisión.',
      );
    }

    if (aprobar) {
      const revision = await this.revisarZona(zonaId);
      if (!revision.sePuedeAprobar) {
        throw new BadRequestException(revision.motivoSiNo!);
      }
    } else if (!observaciones?.trim()) {
      throw new BadRequestException(
        'Di qué hay que arreglar. Devolver un trabajo sin decir qué está mal es la ' +
        'forma más rápida de que la siguiente zona venga peor.',
      );
    }

    const r = await this.prisma.zonaCampana.update({
      where: { id: zonaId },
      data: {
        estado: aprobar ? 'APROBADA' : 'DEVUELTA',
        revisadaPorId: userId,
        revisadaEn: new Date(),
        observaciones: observaciones?.trim() || null,
      },
    });
    await this.audit.record({
      userId, action: 'UPDATE', entity: 'campanas', entityId: zonaId, ip,
      after: { estado: r.estado, observaciones: observaciones?.trim() },
    });
    return r;
  }

  /** El avance de la campaña, con su plan y la calidad incluida, no sólo el conteo. */
  async avance(campanaId: string) {
    const c = await this.prisma.campanaMapeo.findUnique({
      where: { id: campanaId },
      include: {
        zonas: {
          include: { location: { select: { id: true, code: true, name: true, path: true } } },
          orderBy: { creadoEn: 'asc' },
        },
      },
    });
    if (!c) throw new NotFoundException('Esa campaña no existe.');
    const mapeo = esMapeo(c.tipo);

    /* En MAPEO lo hecho son los equipos cargados en cada zona: se cuenta, no
       se escribe. Una sola consulta agrupada, no una por zona. */
    const cargados = new Map<string, number>();
    if (mapeo && c.zonas.length) {
      const g = await this.prisma.asset.groupBy({
        by: ['locationId'],
        where: { locationId: { in: c.zonas.map((z) => z.locationId) }, deletedAt: null },
        _count: { _all: true },
      });
      for (const x of g) if (x.locationId) cargados.set(x.locationId, x._count._all);
    }

    // Los nombres de quien levanta cada zona y del responsable, de una vez.
    const ids = [...new Set([c.responsableId, ...c.zonas.map((z) => z.asignadoAId)].filter(Boolean) as string[])];
    const gente = ids.length
      ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } })
      : [];
    const nombre = new Map(gente.map((u) => [u.id, u.fullName]));

    const ahora = new Date();
    const zonas = c.zonas.map((z) => {
      const hechos = mapeo ? (cargados.get(z.locationId) ?? 0) : z.hechos;
      return {
        id: z.id, estado: z.estado, esperados: z.esperados, hechos,
        asignadoAId: z.asignadoAId, asignado: z.asignadoAId ? nombre.get(z.asignadoAId) ?? null : null,
        ubicacion: z.location, notas: z.notas,
        inicioPrevisto: z.inicioPrevisto, finPrevisto: z.finPrevisto,
        plan: estadoDelPlan(z, ahora),
        cargadaEn: z.cargadaEn, revisadaEn: z.revisadaEn, observaciones: z.observaciones,
      };
    });

    const porEstado: Record<string, number> = {};
    for (const z of c.zonas) porEstado[z.estado as string] = (porEstado[z.estado as string] ?? 0) + 1;
    const total = c.zonas.length;
    const aprobadas = porEstado.APROBADA ?? 0;

    // El tramo de tiempo que cubre el plan, para dibujar las barras.
    const fechas = [c.inicioPrevisto, c.finPrevisto, ...c.zonas.flatMap((z) => [z.inicioPrevisto, z.finPrevisto])]
      .filter(Boolean).map((d) => new Date(d as Date).getTime());

    return {
      campana: {
        id: c.id, codigo: c.codigo, nombre: c.nombre, estado: c.estado, tren: c.tren,
        tipo: c.tipo ?? 'Mapeo', unidad: c.unidad ?? (mapeo ? 'equipos' : null), esMapeo: mapeo,
        descripcion: c.descripcion,
        responsableId: c.responsableId, responsable: c.responsableId ? nombre.get(c.responsableId) ?? null : null,
        inicioPrevisto: c.inicioPrevisto, finPrevisto: c.finPrevisto, cerradaEn: c.cerradaEn,
      },
      zonas,
      total,
      porEstado,
      /* El porcentaje cuenta SÓLO las zonas APROBADAS. Contar las "cargadas"
         sería exactamente la barra de progreso que este módulo existe para
         no ser: diría 90 % con la mitad de las fichas mal. */
      pctAprobado: total ? Math.round((aprobadas / total) * 100) : 0,
      atrasadas: zonas.filter((z) => z.plan === 'ATRASADA').length,
      sinPlan: zonas.filter((z) => z.plan === 'SIN_PLAN').length,
      meta: avanceDeMeta(zonas),
      rango: fechas.length ? { desde: new Date(Math.min(...fechas)), hasta: new Date(Math.max(...fechas)) } : null,
    };
  }
}
