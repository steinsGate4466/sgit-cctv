import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { resolverContextoDePlanta } from '../../common/plant-context';
import { alcanza, ambitoDelUsuario, noVeNada } from '../../common/ambito-usuario';
import { CrearInspeccionGruaDto } from './dto/inspeccion-grua.dto';

/**
 * INSPECCIÓN DE CÁMARAS DE GRÚA (bloque 14).
 *
 * Una cámara de grúa falla por tres cosas que ninguna otra cámara tiene: el
 * cable se fatiga en la cadena portacables, la antena se desalinea con el
 * movimiento, y no se llega sin manlift. Ver el comentario largo del modelo
 * en schema.prisma.
 *
 * La consecuencia práctica: **subir cuesta caro, así que se sube UNA vez y
 * se revisa TODO**. Por eso el formulario es largo, y por eso este servicio
 * no deja cerrar una inspección a medias sin decirlo.
 */
@Injectable()
export class GruaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Código correlativo por año: GRU-2026-0001. */
  private async siguienteCodigo(): Promise<string> {
    const anio = new Date().getFullYear();
    const ultima = await this.prisma.inspeccionGrua.findFirst({
      where: { code: { startsWith: `GRU-${anio}-` } },
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const n = ultima ? Number(ultima.code.split('-')[2] || 0) + 1 : 1;
    return `GRU-${anio}-${String(n).padStart(4, '0')}`;
  }

  async lista(userId?: string | null, tren?: string | null, grua?: string) {
    const filas = await this.prisma.inspeccionGrua.findMany({
      where: grua?.trim() ? { grua: { contains: grua.trim(), mode: 'insensitive' } } : {},
      select: {
        id: true, code: true, grua: true, posicionEnGrua: true, fecha: true,
        resultado: true, requiereManlift: true, requiereSeguimiento: true,
        senalDbm: true, senalDbmAnterior: true, assetId: true,
        camaraEstado: true, antenaEstado: true, cableEstado: true,
        asset: { select: { assetCode: true, status: true, locationId: true } },
        inspeccionadoPor: { select: { fullName: true } },
      },
      orderBy: { fecha: 'desc' },
      take: 200,
    });
    if (filas.length === 0) return [];

    const activos = filas.map((f) => ({ id: f.assetId, locationId: f.asset?.locationId ?? null }));
    const ctx = await resolverContextoDePlanta(this.prisma, activos as any);
    const ambito = await ambitoDelUsuario(this.prisma, userId);
    // Bloque 42: rol sectorizado sin tren asignado -> ni una fila.
    if (noVeNada(ambito)) return [];

    return filas
      .filter((f) => {
        const t = ctx[f.assetId]?.trenCode ?? null;
        if (!alcanza(ambito, t)) return false;
        if (tren && t !== tren.toUpperCase()) return false;
        return true;
      })
      .map((f) => ({
        id: f.id,
        code: f.code,
        grua: f.grua,
        posicion: f.posicionEnGrua,
        equipo: f.asset?.assetCode ?? null,
        estadoEquipo: f.asset?.status ?? null,
        tren: ctx[f.assetId]?.trenCode ?? null,
        fecha: f.fecha,
        resultado: f.resultado as string,
        requiereManlift: f.requiereManlift,
        requiereSeguimiento: f.requiereSeguimiento,
        senalDbm: f.senalDbm,
        // La DERIVA es el dato que importa, no la señal suelta. -70 puede ser
        // normal en un enlace largo; -70 cuando el mes pasado era -50 es una
        // antena que se está moviendo, y eso se ve venir.
        deriva: f.senalDbm != null && f.senalDbmAnterior != null
          ? f.senalDbm - f.senalDbmAnterior
          : null,
        // Se resume en un solo número lo que hay que volver a mirar.
        pendientes: [f.camaraEstado, f.antenaEstado, f.cableEstado]
          .filter((e) => e === 'OBSERVADO' || e === 'NO_CONFORME').length,
        inspector: f.inspeccionadoPor?.fullName ?? null,
      }));
  }

  async detalle(id: string) {
    const f = await this.prisma.inspeccionGrua.findUnique({
      where: { id },
      include: {
        asset: { select: { assetCode: true, status: true, referencePlace: true } },
        inspeccionadoPor: { select: { fullName: true } },
        workOrder: { select: { code: true } },
      },
    });
    if (!f) throw new NotFoundException('Esa inspección no existe.');
    return f;
  }

  /** Historial de una cámara concreta: es donde se ve la fatiga del cable. */
  async historial(assetId: string) {
    return this.prisma.inspeccionGrua.findMany({
      where: { assetId },
      select: {
        id: true, code: true, fecha: true, resultado: true, senalDbm: true,
        cableEstado: true, chicoteDanado: true, antenaEstado: true, hallazgos: true,
      },
      orderBy: { fecha: 'desc' },
      take: 30,
    });
  }

  async crear(dto: CrearInspeccionGruaDto, userId?: string | null) {
    const activo = await this.prisma.asset.findFirst({
      where: { id: dto.assetId, deletedAt: null },
      select: { id: true, type: true, assetCode: true },
    });
    if (!activo) throw new NotFoundException('Esa cámara no existe.');
    if (activo.type !== 'CAMERA') {
      throw new BadRequestException(
        `${activo.assetCode} no es una cámara. Esta inspección es para cámaras montadas en grúa.`,
      );
    }
    if (!dto.grua?.trim()) {
      throw new BadRequestException('Falta indicar de qué grúa se trata.');
    }

    /* COHERENCIA: si dice que NO se pudo acceder, no puede haber revisado
       nada. Dejarlo pasar produciría un registro que afirma "cámara conforme"
       en una visita donde nadie llegó al equipo — y eso es peor que no tener
       registro, porque el mes que viene alguien lo lee y se lo cree. */
    const revisoAlgo = [
      dto.camaraEstado, dto.antenaEstado, dto.cableEstado,
      dto.alimentacionEstado, dto.gabineteEstado,
    ].some((e) => e && e !== 'NO_REVISADO');
    if (dto.resultado === 'NO_SE_PUDO_ACCEDER' && revisoAlgo) {
      throw new BadRequestException(
        'Marcaste "no se pudo acceder" pero hay componentes revisados. ' +
        'O se llegó al equipo, o no: corrige una de las dos cosas.',
      );
    }

    // La señal anterior se arrastra sola para poder calcular la deriva sin
    // que nadie tenga que buscarla ni teclearla.
    const previa = await this.prisma.inspeccionGrua.findFirst({
      where: { assetId: dto.assetId, senalDbm: { not: null } },
      orderBy: { fecha: 'desc' },
      select: { senalDbm: true },
    });

    const { workOrderId, proximaRevision, ...resto } = dto;

    return this.prisma.inspeccionGrua.create({
      data: {
        ...resto,
        code: await this.siguienteCodigo(),
        workOrderId: workOrderId || null,
        proximaRevision: proximaRevision ? new Date(proximaRevision) : null,
        senalDbmAnterior: previa?.senalDbm ?? null,
        inspeccionadoPorId: userId || null,
      } as any,
      select: { id: true, code: true },
    });
  }

  /**
   * Resumen por grúa: la vista que usa el ingeniero para decidir a cuál
   * subir el próximo día que haya manlift.
   */
  async porGrua(userId?: string | null) {
    const filas = await this.lista(userId, null);
    const mapa = new Map<string, any>();
    for (const f of filas) {
      const actual = mapa.get(f.grua);
      // Sólo la MÁS RECIENTE de cada grúa: la lista ya viene ordenada por
      // fecha descendente, así que la primera que aparece es la buena.
      if (!actual) {
        mapa.set(f.grua, {
          grua: f.grua,
          ultima: f.fecha,
          resultado: f.resultado,
          camaras: 1,
          pendientes: f.pendientes,
          requiereManlift: f.requiereManlift,
          deriva: f.deriva,
        });
      } else {
        actual.camaras++;
        actual.pendientes += f.pendientes;
        if (f.requiereManlift) actual.requiereManlift = true;
      }
    }
    return [...mapa.values()].sort((a, b) => b.pendientes - a.pendientes);
  }
}
