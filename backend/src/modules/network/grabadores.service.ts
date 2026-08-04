import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { resolverContextoDePlanta } from '../../common/plant-context';
import { ambitoDelUsuario } from '../../common/ambito-usuario';
import { construirRejilla, buscarPorLoQueDiceElPulpito, CamaraDelGrabador } from './canales';

/**
 * GRABADORES Y SUS CANALES (bloques 6a y 6b).
 *
 * Este servicio existe para cerrar el hueco entre CÓMO HABLA LA PLANTA y
 * cómo guarda las cosas el sistema.
 *
 * En el púlpito nadie dice "AA-CAM-T2-045". Dicen "el 7 está negro" o "no se
 * ve la de la grúa". Si el sistema no sabe traducir eso, cada aviso empieza
 * con diez minutos de "¿cuál es esa?" — y ese es exactamente el tiempo que
 * este bloque devuelve.
 *
 * Tres cosas hace:
 *   · 6a — la rejilla: qué cámara hay en cada canal de cada grabador.
 *   · 6b — enlazar: asignar cámara ↔ canal ↔ nombre del púlpito, sin tener
 *          que entrar a editar activo por activo.
 *   · buscar por lo que dijeron por radio.
 */
@Injectable()
export class GrabadoresService {
  constructor(private readonly prisma: PrismaService) {}

  /** Los NVR que el usuario puede ver, con el resumen de su ocupación. */
  async lista(userId?: string | null, tren?: string | null) {
    const nvrs = await this.prisma.asset.findMany({
      where: { deletedAt: null, type: 'NVR', status: { notIn: ['BAJA'] } },
      select: {
        id: true, assetCode: true, model: true, status: true,
        referencePlace: true, locationId: true,
        nvr: { select: { channels: true, capacityTb: true, nicPrimary: true } },
      },
      orderBy: { assetCode: 'asc' },
    });
    if (nvrs.length === 0) return { grabadores: [], sinAmbito: false };

    const ctx = await resolverContextoDePlanta(this.prisma, nvrs as any);
    const { trenes, sinLimite } = await ambitoDelUsuario(this.prisma, userId);

    const visibles = nvrs.filter((n) => {
      const t = ctx[n.id]?.trenCode ?? null;
      if (!sinLimite && (!t || !trenes.includes(t))) return false;
      if (tren && t !== tren.toUpperCase()) return false;
      return true;
    });

    // Una sola consulta para las cámaras de TODOS los grabadores visibles.
    // Una consulta por grabador sería el mismo N+1 que ya costó 40 segundos
    // en monitoreo; no se repite el error.
    const camaras = await this.prisma.assetCamera.findMany({
      where: { nvrId: { in: visibles.map((n) => n.id) } },
      select: { assetId: true, nvrId: true, nvrChannel: true, nvrName: true },
    });

    const porNvr = new Map<string, typeof camaras>();
    for (const c of camaras) {
      if (!c.nvrId) continue;
      if (!porNvr.has(c.nvrId)) porNvr.set(c.nvrId, []);
      (porNvr.get(c.nvrId) as typeof camaras).push(c);
    }

    return {
      grabadores: visibles.map((n) => {
        const suyas = porNvr.get(n.id) || [];
        const capacidad = n.nvr?.channels ?? null;
        const conCanal = suyas.filter((c) => c.nvrChannel != null && c.nvrChannel > 0).length;
        return {
          id: n.id,
          code: n.assetCode,
          modelo: n.model,
          estado: n.status,
          lugar: n.referencePlace,
          tren: ctx[n.id]?.trenCode ?? null,
          etapa: ctx[n.id]?.etapaNombre ?? ctx[n.id]?.etapaCode ?? null,
          capacidad,
          camaras: suyas.length,
          conCanal,
          sinCanal: suyas.length - conCanal,
          libres: capacidad != null ? Math.max(0, capacidad - conCanal) : null,
          sinNombre: suyas.filter((c) => !c.nvrName || !c.nvrName.trim()).length,
        };
      }),
      sinAmbito: !sinLimite && visibles.length === 0 && nvrs.length > 0,
    };
  }

  /** La rejilla de un grabador: el mapa canal ↔ cámara. */
  async rejilla(nvrId: string) {
    const nvr = await this.prisma.asset.findFirst({
      where: { id: nvrId, deletedAt: null, type: 'NVR' },
      select: {
        id: true, assetCode: true, model: true, status: true, referencePlace: true,
        nvr: { select: { channels: true } },
      },
    });
    if (!nvr) throw new NotFoundException('Ese grabador no existe.');

    const filas = await this.prisma.assetCamera.findMany({
      where: { nvrId },
      select: {
        assetId: true, nvrChannel: true, nvrName: true,
        asset: { select: { assetCode: true, status: true, referencePlace: true, deletedAt: true } },
      },
    });

    const camaras: CamaraDelGrabador[] = filas
      // Una cámara dada de baja no ocupa canal, pero si el enlace sigue
      // puesto conviene que no aparezca como si estuviera grabando.
      .filter((f) => !f.asset?.deletedAt)
      .map((f) => ({
        assetId: f.assetId,
        code: f.asset?.assetCode || '(sin código)',
        nombreEnGrabador: f.nvrName,
        canal: f.nvrChannel,
        estado: f.asset?.status || 'DESCONOCIDO',
        lugar: f.asset?.referencePlace || null,
      }));

    return {
      grabador: {
        id: nvr.id, code: nvr.assetCode, modelo: nvr.model,
        estado: nvr.status, lugar: nvr.referencePlace,
      },
      ...construirRejilla(camaras, nvr.nvr?.channels ?? null),
    };
  }

  /**
   * Cámaras candidatas para meter en un canal libre: las que todavía no
   * entran a NINGÚN grabador. Se limita al tren del grabador porque una
   * cámara del Tren 1 no se graba en el NVR del Tren 3, y ofrecerla sería
   * invitar a un error de carga.
   */
  async candidatas(nvrId: string, texto?: string) {
    const nvr = await this.prisma.asset.findFirst({
      where: { id: nvrId, deletedAt: null, type: 'NVR' },
      select: { id: true, locationId: true },
    });
    if (!nvr) throw new NotFoundException('Ese grabador no existe.');

    const t = texto?.trim();
    const libres = await this.prisma.asset.findMany({
      where: {
        deletedAt: null,
        type: 'CAMERA',
        status: { notIn: ['BAJA'] },
        // DOS casos, no uno: la cámara tiene ficha y su NVR está vacío, O no
        // tiene ficha de cámara todavía (alta rápida sin detalle). Filtrar
        // sólo por el primero escondería precisamente las recién dadas de
        // alta, que son las que hay que enlazar.
        AND: [
          { OR: [{ camera: { is: { nvrId: null } } }, { camera: { is: null } }] },
          ...(t
            ? [{
                OR: [
                  { assetCode: { contains: t, mode: 'insensitive' as const } },
                  { model: { contains: t, mode: 'insensitive' as const } },
                  { referencePlace: { contains: t, mode: 'insensitive' as const } },
                ],
              }]
            : []),
        ],
      },
      select: {
        id: true, assetCode: true, model: true, status: true,
        referencePlace: true, locationId: true,
      },
      orderBy: { assetCode: 'asc' },
      take: 200,
    });
    if (libres.length === 0) return [];

    const ctx = await resolverContextoDePlanta(this.prisma, [...libres, nvr] as any);
    const trenDelNvr = ctx[nvr.id]?.trenCode ?? null;

    return libres
      .filter((c) => !trenDelNvr || (ctx[c.id]?.trenCode ?? null) === trenDelNvr)
      .map((c) => ({
        id: c.id, code: c.assetCode, modelo: c.model,
        estado: c.status, lugar: c.referencePlace,
        tren: ctx[c.id]?.trenCode ?? null,
      }));
  }

  /**
   * ENLAZAR (6b): meter una cámara en un canal del grabador.
   *
   * Se comprueba ANTES de escribir que el canal esté libre. Dejar que dos
   * cámaras caigan en el mismo canal es fácil de hacer y muy caro de
   * descubrir: la rejilla lo enseñaría, pero para entonces ya nadie sabe
   * cuál de las dos era la buena.
   */
  async enlazar(nvrId: string, dto: { assetId: string; canal?: number | null; nombreEnGrabador?: string | null }) {
    const { assetId } = dto || ({} as any);
    if (!assetId) throw new BadRequestException('Falta la cámara.');

    const nvr = await this.prisma.asset.findFirst({
      where: { id: nvrId, deletedAt: null, type: 'NVR' },
      select: { id: true, nvr: { select: { channels: true } } },
    });
    if (!nvr) throw new NotFoundException('Ese grabador no existe.');

    const camara = await this.prisma.asset.findFirst({
      where: { id: assetId, deletedAt: null, type: 'CAMERA' },
      select: { id: true, assetCode: true },
    });
    if (!camara) throw new NotFoundException('Esa cámara no existe.');

    const canal = dto.canal == null || (dto.canal as any) === '' ? null : Number(dto.canal);
    if (canal != null) {
      if (!Number.isInteger(canal) || canal < 1) {
        throw new BadRequestException('El canal tiene que ser un número entero desde 1.');
      }
      const capacidad = nvr.nvr?.channels ?? null;
      if (capacidad != null && capacidad > 0 && canal > capacidad) {
        throw new BadRequestException(
          `Este grabador tiene ${capacidad} canales registrados y estás poniendo el ${canal}. Si de verdad tiene más, corrige primero la capacidad en la ficha del grabador.`,
        );
      }
      const ocupado = await this.prisma.assetCamera.findFirst({
        where: { nvrId, nvrChannel: canal, assetId: { not: assetId } },
        select: { assetId: true, asset: { select: { assetCode: true } } },
      });
      if (ocupado) {
        throw new BadRequestException(
          `El canal ${canal} ya lo ocupa ${ocupado.asset?.assetCode || 'otra cámara'}. Libéralo primero o usa otro canal.`,
        );
      }
    }

    const nombre = dto.nombreEnGrabador?.trim() || null;

    // upsert: la ficha de cámara puede no existir todavía si el activo se dio
    // de alta sin detalle. Sin esto, enlazar fallaría con un error de Prisma
    // que no dice nada al usuario.
    await this.prisma.assetCamera.upsert({
      where: { assetId },
      create: { assetId, nvrId, nvrChannel: canal, nvrName: nombre },
      update: { nvrId, nvrChannel: canal, ...(nombre !== null ? { nvrName: nombre } : {}) },
    });

    return { ok: true, assetId, canal, nombreEnGrabador: nombre };
  }

  /** Sacar una cámara del grabador. No borra la cámara: sólo la desenlaza. */
  async desenlazar(nvrId: string, assetId: string) {
    const fila = await this.prisma.assetCamera.findFirst({
      where: { assetId, nvrId },
      select: { assetId: true },
    });
    if (!fila) throw new NotFoundException('Esa cámara no está enlazada a este grabador.');

    await this.prisma.assetCamera.update({
      where: { assetId },
      data: { nvrId: null, nvrChannel: null },
    });
    return { ok: true };
  }

  /**
   * "El canal 7 está negro" / "no se ve la de la grúa" → qué cámara es.
   * Busca en TODOS los grabadores que el usuario puede ver.
   */
  async traducir(userId: string | null | undefined, texto: string) {
    const { grabadores } = await this.lista(userId, null);
    if (grabadores.length === 0) return [];

    const filas = await this.prisma.assetCamera.findMany({
      where: { nvrId: { in: grabadores.map((g) => g.id) } },
      select: {
        assetId: true, nvrId: true, nvrChannel: true, nvrName: true,
        asset: { select: { assetCode: true, status: true, referencePlace: true, deletedAt: true } },
      },
    });

    const nombreNvr = new Map(grabadores.map((g) => [g.id, g.code]));
    const camaras: (CamaraDelGrabador & { nvrId: string | null; grabador: string | null })[] = filas
      .filter((f) => !f.asset?.deletedAt)
      .map((f) => ({
        assetId: f.assetId,
        code: f.asset?.assetCode || '(sin código)',
        nombreEnGrabador: f.nvrName,
        canal: f.nvrChannel,
        estado: f.asset?.status || 'DESCONOCIDO',
        lugar: f.asset?.referencePlace || null,
        nvrId: f.nvrId,
        grabador: f.nvrId ? nombreNvr.get(f.nvrId) ?? null : null,
      }));

    return buscarPorLoQueDiceElPulpito(camaras, texto).slice(0, 25);
  }
}
