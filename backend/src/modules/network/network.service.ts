import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { resolverContextoDePlanta } from '../../common/plant-context';
import { ambitoDelUsuario } from '../../common/ambito-usuario';
import { GrafoRed, alcanzables, impactoDeCaida, porDanoPotencial } from './impacto';

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
        where: { OR: [{ nvrId: { not: null } }, { nvrName: { not: null } }] },
        select: { assetId: true, nvrId: true, nvrName: true },
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

    /* -------------------------------------------------------------------
       FALLO CORREGIDO EL 03/08/2026 — POR QUÉ EL MAPA SALÍA VACÍO
       -------------------------------------------------------------------
       Esta parte enlazaba la cámara con su grabador comparando `nvrName`
       contra el CÓDIGO del NVR. Pero `nvrName` no es el código del grabador:
       es "el nombre de la cámara tal como se ve en el púlpito" — cosas como
       "GRUA 2 PATIO". Nunca iba a casar con "AA-NVR-T2-01".

       Resultado: el ingeniero rellenaba "Grabador al que entra" en la ficha
       —el campo `nvrId`, que es el bueno— y el mapa seguía sin dibujar ni un
       solo enlace de cámara. La función no estaba rota: estaba mirando el
       campo equivocado.

       Ahora manda `nvrId`, que es una referencia de verdad. El nombre se
       conserva SÓLO como último recurso para los datos viejos que se
       cargaron antes de que existiera el campo; si algún día no queda
       ninguno, esta segunda vía se puede borrar sin más.
       ------------------------------------------------------------------- */
    const idsDeNvr = new Set(activos.filter((a) => a.type === 'NVR').map((a) => a.id));
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
      // 1) El campo bueno: la referencia al grabador.
      let nvr = c.nvrId && idsDeNvr.has(c.nvrId) ? c.nvrId : null;
      // 2) Sólo si no hay referencia, se intenta el nombre (datos antiguos).
      if (!nvr) nvr = nvrPorCodigo.get((c.nvrName || '').trim().toUpperCase()) ?? null;
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

  /**
   * EL MAPA, para dibujarlo.
   *
   * Devuelve nodos y enlaces tal cual, sin posiciones: dónde va cada caja lo
   * decide la pantalla, que es la que sabe cuánto sitio tiene. Mandar
   * coordenadas desde aquí obligaría a rehacer el servidor cada vez que
   * cambie el diseño.
   *
   * Se incluye la PROFUNDIDAD de cada nodo —a cuántos saltos está del
   * grabador— porque eso NO es diseño: es la estructura de la red, y sale de
   * los mismos datos. Con ella el dibujo se ordena solo en columnas:
   * grabadores, switches de core, switches de tren, cámaras.
   */
  async mapa(userId?: string | null, tren?: string | null) {
    const { g, info } = await this.grafo();
    const { trenes, sinLimite } = await ambitoDelUsuario(this.prisma, userId);

    const permitido = (id: string) => {
      const t = info.get(id)?.tren ?? null;
      if (!sinLimite && (!t || !trenes.includes(t))) return false;
      if (tren && t !== tren.toUpperCase()) return false;
      return true;
    };

    // Profundidad desde las raíces, en anchura.
    const ady = new Map<string, string[]>();
    for (const n of g.nodos) ady.set(n, []);
    for (const e of g.enlaces) {
      ady.get(e.a)?.push(e.b);
      ady.get(e.b)?.push(e.a);
    }
    const nivel = new Map<string, number>();
    const cola: string[] = [];
    for (const r of g.raices) { nivel.set(r, 0); cola.push(r); }
    for (let i = 0; i < cola.length; i++) {
      const n = cola[i];
      for (const v of ady.get(n) || []) {
        if (!nivel.has(v)) { nivel.set(v, (nivel.get(n) ?? 0) + 1); cola.push(v); }
      }
    }

    // Los nodos del tren pedido, MÁS los que hagan falta para que el dibujo
    // tenga sentido: si el switch del core no es "de este tren" pero da
    // servicio a sus cámaras, esconderlo dejaría las cámaras flotando.
    const visibles = new Set(g.nodos.filter(permitido));
    for (const e of g.enlaces) {
      if (visibles.has(e.a) && !visibles.has(e.b) && !this.esCamara(info)(e.b)) visibles.add(e.b);
      if (visibles.has(e.b) && !visibles.has(e.a) && !this.esCamara(info)(e.a)) visibles.add(e.a);
    }

    const alcanzan = alcanzables(g);

    return {
      nodos: [...visibles].map((id) => ({
        id,
        ...info.get(id),
        nivel: nivel.get(id) ?? null,
        // Si no llega al grabador, se dibuja aparte: es lo que hay que ver.
        aislado: !alcanzan.has(id),
        esRaiz: g.raices.includes(id),
      })),
      enlaces: g.enlaces
        .filter((e) => visibles.has(e.a) && visibles.has(e.b))
        .map((e) => ({ a: e.a, b: e.b, esAnillo: !!e.esAnillo })),
      generado: new Date().toISOString(),
    };
  }
}
