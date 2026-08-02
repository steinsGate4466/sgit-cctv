import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { resolverContextoDePlanta } from '../../common/plant-context';
import { ambitoDelUsuario } from '../../common/ambito-usuario';
import { GrafoRed, impactoDeCaida, porDanoPotencial } from './impacto';

/**
 * TOPOLOGÍA Y ANÁLISIS DE IMPACTO (bloque 7).
 *
 * El grafo NO se guarda: se ARMA en cada consulta a partir de lo que ya
 * existe. Guardarlo por separado significaría mantener dos verdades, y la
 * segunda siempre se queda vieja — es el mismo error que teníamos con el
 * tren escrito a mano en el activo.
 *
 * De dónde salen los enlaces, en orden de fiabilidad:
 *   1. SwitchPort.connectedAssetId — qué hay enchufado en cada puerto. Es
 *      el dato más fiable porque se registra al cablear.
 *   2. NetworkLink — enlaces declarados: fibra del anillo, radioenlaces.
 *   3. AssetCamera.nvrChannel — la cámara grabando en tal NVR.
 */
@Injectable()
export class NetworkService {
  constructor(private readonly prisma: PrismaService) {}

  /** Arma el grafo de toda la planta una sola vez. */
  private async grafo(): Promise<{
    g: GrafoRed;
    info: Map<string, { code: string; tipo: string; lugar: string | null; estado: string; tren: string | null }>;
  }> {
    const [activos, puertos, enlaces, camaras] = await Promise.all([
      this.prisma.asset.findMany({
        where: { deletedAt: null, status: { notIn: ['BAJA', 'STOCK'] } },
        select: {
          id: true, assetCode: true, type: true, status: true,
          referencePlace: true, locationId: true,
        },
      }),
      this.prisma.switchPort.findMany({
        where: { connectedAssetId: { not: null } },
        select: { switchId: true, connectedAssetId: true },
      }),
      this.prisma.networkLink.findMany({
        select: { endpointAId: true, endpointBId: true, isRing: true },
      }),
      this.prisma.assetCamera.findMany({
        where: { nvrName: { not: null } },
        select: { assetId: true, nvrName: true },
      }),
    ]);

    const ctx = await resolverContextoDePlanta(this.prisma, activos as any);
    const info = new Map(
      activos.map((a) => [a.id, {
        code: a.assetCode,
        tipo: a.type as string,
        lugar: a.referencePlace,
        estado: a.status as string,
        tren: ctx[a.id]?.trenCode ?? null,
      }]),
    );

    // Las cámaras se enlazan a su NVR POR NOMBRE, que es como está el dato
    // hoy. Es más flojo que un identificador y por eso se resuelve contra el
    // código del activo: si el nombre no casa con ningún NVR, la cámara sale
    // como no conectada en vez de inventarse un enlace que no existe.
    const nvrPorCodigo = new Map(
      activos.filter((a) => a.type === 'NVR').map((a) => [a.assetCode.toUpperCase(), a.id]),
    );

    const lista: GrafoRed['enlaces'] = [];
    for (const p of puertos) {
      if (p.connectedAssetId) lista.push({ a: p.switchId, b: p.connectedAssetId });
    }
    for (const e of enlaces) {
      lista.push({ a: e.endpointAId, b: e.endpointBId, esAnillo: e.isRing });
    }
    for (const c of camaras) {
      const nvr = nvrPorCodigo.get((c.nvrName || '').trim().toUpperCase());
      if (nvr) lista.push({ a: c.assetId, b: nvr });
    }

    const g: GrafoRed = {
      nodos: activos.map((a) => a.id),
      enlaces: lista,
      // La imagen tiene que llegar a un grabador. Si mañana graba un
      // servidor, se añade aquí y no hay que tocar nada más.
      raices: activos.filter((a) => a.type === 'NVR' || a.type === 'SERVER').map((a) => a.id),
    };
    return { g, info };
  }

  private esCamara(info: Map<string, any>) {
    return (id: string) => info.get(id)?.tipo === 'CAMERA';
  }

  /**
   * Ranking: qué equipo se lleva más cámaras por delante si cae.
   * Es lo que decide dónde poner el repuesto en caliente.
   */
  async puntosCriticos(userId?: string | null, tren?: string | null) {
    const { g, info } = await this.grafo();
    const { trenes, sinLimite } = await ambitoDelUsuario(this.prisma, userId);

    const visible = (id: string) => {
      const t = info.get(id)?.tren ?? null;
      if (!sinLimite && (!t || !trenes.includes(t))) return false;
      if (tren && t !== tren.toUpperCase()) return false;
      return true;
    };

    // El ranking se calcula sobre la red ENTERA aunque el usuario sólo vea
    // su tren: si el switch del core se cae, al jefe del Tren 2 le afecta
    // igual, aunque ese switch no sea "suyo". Lo que se recorta es lo que se
    // LISTA, no lo que se calcula. Al revés daría números falsos.
    const ranking = porDanoPotencial(g, this.esCamara(info));

    return {
      equipos: ranking
        .filter((r) => r.camarasAfectadas > 0 || info.get(r.id)?.tipo === 'NVR')
        .slice(0, 30)
        .map((r) => ({
          ...r,
          ...info.get(r.id),
          // Se marca lo que el usuario no puede abrir, en lugar de
          // esconderlo: saber que existe un punto crítico que no es tuyo es
          // justamente lo que hace falta para entender por qué te quedaste
          // sin ver.
          visible: visible(r.id),
        })),
      totalCamaras: g.nodos.filter(this.esCamara(info)).length,
      generado: new Date().toISOString(),
    };
  }

  /** Qué se deja de ver si cae ESTE equipo. */
  async impacto(assetId: string) {
    const { g, info } = await this.grafo();
    if (!info.has(assetId)) throw new NotFoundException('Ese equipo no está en la red.');

    const i = impactoDeCaida(g, assetId, this.esCamara(info));
    const detalle = i.pierden
      .map((id) => ({ id, ...info.get(id) }))
      .sort((a, b) => (a.code || '').localeCompare(b.code || ''));

    // Frase lista para leer. El número solo no mueve a nadie: "8 cámaras" no
    // dice dónde. Producción entiende zonas, no identificadores.
    const zonas = [...new Set(detalle.filter((d) => d.tipo === 'CAMERA').map((d) => d.lugar).filter(Boolean))];
    const resumen = i.camarasAfectadas === 0
      ? (i.salvadoPorAnillo
          ? 'No se pierde nada: hay camino alternativo por el anillo.'
          : 'No hay cámaras dependiendo de este equipo.')
      : `Se dejarían de ver ${i.camarasAfectadas} cámara(s)` +
        (zonas.length ? `, en: ${zonas.slice(0, 5).join(', ')}.` : '.');

    return { equipo: { id: assetId, ...info.get(assetId) }, ...i, detalle, resumen };
  }

  /** Alta de un enlace declarado (fibra, radioenlace). */
  async crearEnlace(dto: any) {
    const { endpointAId, endpointBId, medium, isRing, description } = dto || {};
    if (!endpointAId || !endpointBId) {
      throw new BadRequestException('Hacen falta los dos extremos del enlace.');
    }
    if (endpointAId === endpointBId) {
      throw new BadRequestException('Un enlace no puede empezar y terminar en el mismo equipo.');
    }
    const existen = await this.prisma.asset.count({
      where: { id: { in: [endpointAId, endpointBId] }, deletedAt: null },
    });
    if (existen !== 2) throw new BadRequestException('Alguno de los dos equipos no existe.');

    // Sin repetir el mismo enlace en los dos sentidos: sería el mismo cable
    // contado dos veces, y el análisis lo trataría como redundancia.
    const yaEsta = await this.prisma.networkLink.findFirst({
      where: {
        OR: [
          { endpointAId, endpointBId },
          { endpointAId: endpointBId, endpointBId: endpointAId },
        ],
      },
    });
    if (yaEsta) throw new BadRequestException('Ese enlace ya está registrado.');

    return this.prisma.networkLink.create({
      data: {
        endpointAId, endpointBId,
        medium: medium || 'FIBRA',
        isRing: !!isRing,
        description: description?.trim() || null,
      },
    });
  }

  async borrarEnlace(id: string) {
    await this.prisma.networkLink.delete({ where: { id } }).catch(() => {
      throw new NotFoundException('Ese enlace ya no existe.');
    });
    return { ok: true };
  }
}
