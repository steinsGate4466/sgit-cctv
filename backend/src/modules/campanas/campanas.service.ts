import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { defectosDeConjunto, revisarFicha, tieneBloqueantes, ActivoParaRevisar, Defecto } from './calidad-ficha';

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

  listar(estado?: string) {
    return this.prisma.campanaMapeo.findMany({
      where: estado ? { estado: estado as any } : undefined,
      orderBy: { creadoEn: 'desc' },
      include: { _count: { select: { zonas: true, activos: true } } },
    });
  }

  async crear(dto: any, userId?: string | null, ip?: string | null) {
    const codigo = await this.siguienteCodigo();
    const c = await this.prisma.campanaMapeo.create({
      data: {
        codigo,
        nombre: String(dto.nombre || '').trim(),
        tren: dto.tren || null,
        descripcion: dto.descripcion?.trim() || null,
        responsableId: dto.responsableId || null,
        inicioPrevisto: dto.inicioPrevisto ? new Date(dto.inicioPrevisto) : null,
        finPrevisto: dto.finPrevisto ? new Date(dto.finPrevisto) : null,
        creadoPorId: userId || null,
      },
      include: { _count: { select: { zonas: true, activos: true } } },
    });
    await this.audit.record({ userId, action: 'CREATE', entity: 'campanas', entityId: c.id, ip, after: { codigo } });
    return c;
  }

  /** Repartir zonas. Una zona = una ubicación asignada a una persona. */
  async repartir(campanaId: string, zonas: Array<{ locationId: string; asignadoAId?: string; esperados?: number; notas?: string }>) {
    const c = await this.prisma.campanaMapeo.findUnique({ where: { id: campanaId }, select: { id: true, estado: true } });
    if (!c) throw new NotFoundException('Esa campaña no existe.');
    if (c.estado === 'CERRADA') throw new BadRequestException('La campaña está cerrada.');

    /* CON TIPO, no `const creadas = []`.
       Un array literal vacío sin anotar lo infiere TypeScript como `never[]`,
       y entonces `push` de cualquier cosa falla con un mensaje que habla de
       `never` y no menciona el array por ningún lado. Cuesta más leer el
       error que arreglarlo. */
    const creadas: any[] = [];
    for (const z of zonas) {
      try {
        creadas.push(await this.prisma.zonaCampana.create({
          data: {
            campanaId,
            locationId: z.locationId,
            asignadoAId: z.asignadoAId || null,
            // NO se inventa un número de equipos esperados. Si el ingeniero
            // no lo sabe, se deja vacío: un número inventado se daría por
            // bueno y "faltan 3" sería una alarma falsa para siempre.
            esperados: z.esperados ?? null,
            notas: z.notas?.trim() || null,
          },
        }));
      } catch {
        // Ya estaba repartida (índice único campaña+ubicación). No es un error.
      }
    }
    if (c.estado === 'PLANIFICADA' && creadas.length) {
      await this.prisma.campanaMapeo.update({ where: { id: campanaId }, data: { estado: 'EN_CURSO' } });
    }
    return { ok: true, creadas: creadas.length };
  }

  /**
   * LA REVISIÓN. Coge todos los activos de la zona y les pasa las mismas
   * reglas, una a una y luego en conjunto.
   */
  async revisarZona(zonaId: string) {
    const z = await this.prisma.zonaCampana.findUnique({
      where: { id: zonaId },
      include: { location: { select: { id: true, code: true, name: true, path: true } } },
    });
    if (!z) throw new NotFoundException('Esa zona no existe.');

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
      zona: {
        id: z.id, estado: z.estado, esperados: z.esperados,
        cargadaPorId: z.cargadaPorId, revisadaPorId: z.revisadaPorId,
        observaciones: z.observaciones,
        ubicacion: z.location,
      },
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
    const z = await this.prisma.zonaCampana.findUnique({ where: { id: zonaId } });
    if (!z) throw new NotFoundException('Esa zona no existe.');
    if (z.estado === 'APROBADA') throw new BadRequestException('Esta zona ya está aprobada.');

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

  /** El avance de la campaña, con la calidad incluida y no sólo el conteo. */
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

    const porEstado: Record<string, number> = {};
    for (const z of c.zonas) porEstado[z.estado as string] = (porEstado[z.estado as string] ?? 0) + 1;

    const total = c.zonas.length;
    const aprobadas = porEstado.APROBADA ?? 0;

    return {
      campana: { id: c.id, codigo: c.codigo, nombre: c.nombre, estado: c.estado, tren: c.tren },
      zonas: c.zonas.map((z) => ({
        id: z.id, estado: z.estado, esperados: z.esperados,
        asignadoAId: z.asignadoAId, ubicacion: z.location,
        cargadaEn: z.cargadaEn, revisadaEn: z.revisadaEn, observaciones: z.observaciones,
      })),
      total,
      porEstado,
      /* El porcentaje cuenta SÓLO las zonas APROBADAS. Contar las "cargadas"
         sería exactamente la barra de progreso que este módulo existe para
         no ser: diría 90 % con la mitad de las fichas mal. */
      pctAprobado: total ? Math.round((aprobadas / total) * 100) : 0,
    };
  }
}
