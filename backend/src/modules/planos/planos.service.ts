import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Optica, vision } from '../modelos/vision';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { descendientes } from '../../common/ambito-planta';
import { filtroConAmbito } from '../../common/ambito-usuario';
import { tipoRealDeImagen } from '../../common/archivos-seguros';
import { computeEffectiveStatuses } from '../../common/asset-status';
import { evaluar } from '../monitoreo/frescura';
import {
  Punto, cajaDeZona, calibrar, rotuloDeZona, colorDelPunto, dentroDeZona, dentroDelPlano, estadoDeZona, validarZona,
} from './geometria';
import { CalibrarPlanoDto, ColocarEquipoDto, CrearPlanoDto } from './dto/planos.dto';
import { iconoDelEquipo } from './icono';
import {
  NivelRiesgo, ORDEN_RIESGO, TOPE_UTP_M, avisosDeNorma, esNivel, largoPx, lineaPasaPorZona,
  nivelesEnPunto, recorrido, riesgosDeUbicacion, validarTrazado,
} from './regulacion';

/* =============================================================================
   LO QUE VE CADA CÁMARA EN EL MAPA — bloque 184
   Si la cámara tiene ficha técnica, el cono deja de ser «lo que alguien dibujó»
   y pasa a ser lo que dice el fabricante: cuatro franjas DORI (identificar,
   reconocer, observar, detectar) al zoom en que quedó, y de noche hasta donde
   llega el infrarrojo. Se calcula AQUÍ, en un solo sitio (`modelos/vision.ts`):
   la pantalla sólo dibuja lo que recibe.
============================================================================= */
const SELECT_OPTICA = {
  id: true, lente: true, resolucionAncho: true, anguloH: true, anguloHTele: true, zoomOptico: true,
  doriAnguloRef: true, identificarM: true, reconocerM: true, observarM: true, detectarM: true, irM: true,
  verificadaEn: true, documentoId: true,
  modelo: { select: { marca: true, modelo: true } },
} as const;

type OpticaDelPunto = Optica & {
  id: string; lente: string; verificadaEn: Date | null; modelo: { marca: string; modelo: string } | null;
};

function visionDelPunto(f: OpticaDelPunto | null | undefined, zoom: number | null) {
  if (!f) return null;
  const v = vision(f, zoom ?? 1);
  return {
    ...v,
    fichaId: f.id,
    lente: f.lente,
    marca: f.modelo?.marca ?? null,
    modelo: f.modelo?.modelo ?? null,
    verificada: !!f.verificadaEn,
  };
}

const ES_RED = ['SWITCH', 'ROUTER', 'FIREWALL'];
/** Lo que se espera ver colgado de un puerto: sin él, «sin conexión declarada». */
const CUELGA_DE_PUERTO = ['CAMERA', 'WIRELESS', 'NVR'];

/** Un plano exportado a PNG a buena resolución pesa más que una foto. */
const MAX_BYTES_PLANO = 25 * 1024 * 1024;

/**
 * ¿Es un SVG que se puede guardar? Se acepta porque AutoCAD exporta a SVG
 * conservando capas y escala. Se RECHAZA si trae código: aunque en pantalla
 * se dibuja como <image> —y ahí un SVG no ejecuta nada—, un archivo con
 * scripts dentro no tiene nada que hacer en el almacén de la planta.
 */
function esSvgLimpio(buf: Buffer): boolean {
  const txt = buf.subarray(0, Math.min(buf.length, 4_000_000)).toString('utf8');
  if (!/<svg[\s>]/i.test(txt.slice(0, 5000))) return false;
  return !/<script|javascript:|\son[a-z]+\s*=|<foreignObject/i.test(txt);
}

const ABIERTAS_OM = ['ABIERTA', 'EN_PROCESO', 'EN_ESPERA'];
const ABIERTAS_INC = ['ABIERTA', 'EN_DIAGNOSTICO', 'EN_PROCESO', 'EN_ESPERA'];

/** Cuántos equipos hay de cada color. */
function contar(equipos: { estado: string }[]): Record<string, number> {
  const r = { ok: 0, alerta: 0, caida: 0, sindato: 0 } as Record<string, number>;
  for (const e of equipos) r[e.estado] = (r[e.estado] ?? 0) + 1;
  return r;
}

/**
 * PLANO VIVO — bloque 151. Ver el comentario del modelo en schema.prisma.
 */
@Injectable()
export class PlanosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  /** La ubicación del plano y todo lo que cuelga de ella. */
  private async subarbol(locationId: string): Promise<Set<string>> {
    const nodos = await this.prisma.location.findMany({
      select: { id: true, parentId: true, type: true, code: true, stageId: true },
    });
    return descendientes(nodos as any, [locationId]);
  }

  /** Un plano es información sensible de planta: cada uno ve el de su zona. */
  private async comprobarAmbito(locationId: string, userId: string | null) {
    const ambito = await filtroConAmbito(this.prisma, userId, {});
    if (ambito && !ambito.in.includes(locationId)) {
      throw new ForbiddenException('Ese plano no es de tu zona.');
    }
  }

  private async plano(id: string) {
    const p = await this.prisma.plano.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Ese plano no existe.');
    return p;
  }

  // --------------------------------------------------------------- lectura
  async listar(userId: string | null, gestiona: boolean) {
    const ambito = await filtroConAmbito(this.prisma, userId, {});
    const filas = await this.prisma.plano.findMany({
      where: {
        ...(gestiona ? {} : { estado: 'PUBLICADO' }),
        ...(ambito ? { locationId: { in: ambito.in } } : {}),
      },
      orderBy: [{ locationId: 'asc' }, { version: 'desc' }],
      select: {
        id: true, nombre: true, version: true, estado: true, anchoPx: true, altoPx: true,
        metrosPorPx: true, publicadoEn: true, creadoEn: true, locationId: true,
        location: { select: { name: true, code: true } },
        _count: { select: { posiciones: true } },
      },
    });
    return filas.map(({ _count, ...p }) => ({ ...p, equiposColocados: _count.posiciones }));
  }

  /**
   * DÓNDE ESTÁ DIBUJADO UN EQUIPO — bloque 171 (plan 154, «Estás aquí»).
   *
   * Sólo planos PUBLICADOS y de su ámbito: el QR lo escanea cualquiera con
   * permiso de mirar, y un borrador puede tener el equipo mal colocado. Si es
   * un componente (la fuente PoE de una antena), se busca a su equipo padre,
   * que es lo que está dibujado. Vacío = no está en ningún plano todavía.
   */
  async donde(assetId: string, userId: string | null) {
    const a = await this.prisma.asset.findUnique({ where: { id: assetId }, select: { id: true, parteDeId: true } });
    if (!a) throw new NotFoundException('Ese equipo no existe.');
    const ambito = await filtroConAmbito(this.prisma, userId, {});
    const ids = [a.id, ...(a.parteDeId ? [a.parteDeId] : [])];
    const filas = await this.prisma.posicionEnPlano.findMany({
      where: {
        assetId: { in: ids },
        plano: { estado: 'PUBLICADO', ...(ambito ? { locationId: { in: ambito.in } } : {}) },
      },
      select: {
        assetId: true, xPx: true, yPx: true,
        plano: { select: { id: true, nombre: true, version: true, location: { select: { name: true } } } },
      },
    });
    // El equipo mismo antes que su padre; y de cada plano, la versión más nueva.
    filas.sort((x, y) => (x.assetId === a.id ? 0 : 1) - (y.assetId === a.id ? 0 : 1) || y.plano.version - x.plano.version);
    return filas.map((f) => ({
      planoId: f.plano.id, plano: f.plano.nombre, ubicacion: f.plano.location?.name ?? null,
      xPx: f.xPx, yPx: f.yPx, porSuPadre: f.assetId !== a.id,
    }));
  }

  async imagen(id: string, userId: string | null, gestiona: boolean) {
    const p = await this.plano(id);
    if (!gestiona && p.estado !== 'PUBLICADO') throw new NotFoundException('Ese plano no está publicado.');
    await this.comprobarAmbito(p.locationId, userId);
    return { buffer: await this.storage.getBuffer(p.archivoFileId), mime: p.archivoMime };
  }

  /**
   * TODO LO QUE EL MAPA NECESITA, EN UNA RESPUESTA. Nada se calcula aquí que
   * el sistema no calcule ya: el estado sale del monitoreo (`frescura`) y del
   * estado efectivo de siempre; las órdenes e incidencias, de sus tablas.
   *
   * `veRed` = puede ver la infraestructura (`asset.read`). Sin eso —Producción—
   * no se manda ni switch ni puerto: ve qué se deja de ver, no cómo está cableado.
   */
  async vista(id: string, userId: string | null, gestiona: boolean, veRed: boolean) {
    const p = await this.prisma.plano.findUnique({
      where: { id },
      include: { location: { select: { name: true } } },
    });
    if (!p) throw new NotFoundException('Ese plano no existe.');
    if (!gestiona && p.estado !== 'PUBLICADO') throw new NotFoundException('Ese plano no está publicado.');
    await this.comprobarAmbito(p.locationId, userId);

    const ahora = Date.now();
    const { equipos, hayMonitoreo } = await this.equiposDe(p, veRed, ahora);
    const resumen = contar(equipos);
    const { zonas, padre } = await this.zonasDe(p, equipos, ahora);
    /* Bloque 176 · el riesgo: las áreas DIBUJADAS y lo que las zonas ya
       declaran en Ubicaciones. Cada equipo sabe en qué niveles está. */
    const riesgos = await this.riesgosDe(p.id);
    const areas = [
      ...riesgos.map((r) => ({ nivel: r.nivel, nombre: r.nombre, puntos: r.puntos })),
      ...zonas.flatMap((z: any) => z.riesgos.map((r: any) => ({ nivel: r.nivel as NivelRiesgo, nombre: z.nombre, puntos: z.puntos }))),
    ];
    for (const e of equipos as any[]) e.riesgos = nivelesEnPunto(e.xPx, e.yPx, areas);
    const red = veRed ? await this.redDe(p, equipos, areas) : null;

    return {
      plano: {
        id: p.id, nombre: p.nombre, version: p.version, estado: p.estado,
        anchoPx: p.anchoPx, altoPx: p.altoPx, metrosPorPx: p.metrosPorPx,
        rotacionNorte: p.rotacionNorte, ubicacion: p.location?.name ?? null, locationId: p.locationId,
      },
      equipos,
      resumen,
      zonas,
      padre,
      riesgos,
      cables: red?.cables ?? [],
      enlaces: red?.enlaces ?? [],
      avisos: red?.avisos ?? [],
      topeUtpM: TOPE_UTP_M,
      hayMonitoreo,
      datoDe: new Date(ahora).toISOString(),
    };
  }

  /**
   * Los equipos colocados en un plano, con su estado. Es lo que el mapa pinta
   * y lo que cuentan las zonas y la vista de planta: UNA sola forma de
   * decidir el color, para que el mismo equipo no salga rojo en un sitio y
   * verde en otro.
   */
  private async equiposDe(p: { id: string; metrosPorPx: number | null }, veRed: boolean, ahora: number) {
    const id = p.id;
    const posiciones = await this.prisma.posicionEnPlano.findMany({
      where: { planoId: id, asset: { deletedAt: null } },
      include: {
        asset: {
          select: {
            id: true, assetCode: true, type: true, referencePlace: true, status: true, locationId: true,
            /* El tipo de cámara va siempre (decide el ícono); el switch y el
               puerto, sólo a quien ve la red. */
            camera: {
              select: {
                cameraStyle: true,
                // Bloque 184 · lo que ve, según su ficha técnica.
                fichaOptica: { select: SELECT_OPTICA },
                ...(veRed ? { switchPort: { select: { portNumber: true, switchAsset: { select: { id: true, assetCode: true } } } } } : {}),
              },
            },
            wireless: { select: { mode: true } },
          },
        },
      },
    });
    const ids = posiciones.map((x) => x.assetId);
    const [observaciones, efectivos, ordenes, incidencias, ultimas] = await Promise.all([
      this.prisma.assetObservation.findMany({ where: { assetId: { in: ids } } }),
      computeEffectiveStatuses(this.prisma, posiciones.map((x) => ({ id: x.asset.id, status: x.asset.status }))),
      this.prisma.workOrder.findMany({
        where: { assetId: { in: ids }, status: { in: ABIERTAS_OM as any } },
        orderBy: { createdAt: 'desc' },
        select: { assetId: true, code: true, type: true, progressPct: true, status: true },
      }),
      this.prisma.incident.findMany({
        where: { assetId: { in: ids }, status: { in: ABIERTAS_INC as any } },
        orderBy: { reportedAt: 'desc' },
        // Bloque 181 · el tipo de aviso y su N° SAP (bloque 180), para la tarjeta.
        select: { id: true, assetId: true, code: true, priority: true, title: true, tipoAviso: true, avisoSap: true },
      }),
      /* Bloque 163: la última orden CERRADA de cada equipo, para que la
         tarjeta diga «última intervención: OM-… hace 12 días». Una por equipo
         (`distinct`), así que no crece con el historial. */
      this.prisma.workOrder.findMany({
        where: { assetId: { in: ids }, status: 'CERRADA' },
        orderBy: { executedDate: 'desc' },
        distinct: ['assetId'],
        select: { assetId: true, code: true, type: true, executedDate: true },
      }),
    ]);
    const ultimaDe = new Map(ultimas.map((o) => [o.assetId, o]));
    const obsDe = new Map(observaciones.map((o) => [o.assetId, o]));
    const omDe = new Map<string, any>();
    for (const o of ordenes) if (o.assetId && !omDe.has(o.assetId)) omDe.set(o.assetId, o);
    const incDe = new Map<string, any>();
    for (const i of incidencias) if (i.assetId && !incDe.has(i.assetId)) incDe.set(i.assetId, i);

    const mpp = p.metrosPorPx;
    const equipos = posiciones.map((x) => {
      const obs = obsDe.get(x.assetId);
      const ver = obs ? evaluar(obs as any, ahora) : null;
      const om = omDe.get(x.assetId);
      const est = colorDelPunto(ver, efectivos[x.assetId], !!om);
      const sw = (x.asset as any).camera?.switchPort;
      const inc = incDe.get(x.assetId);
      const ult = ultimaDe.get(x.assetId);
      return {
        assetId: x.assetId,
        codigo: x.asset.assetCode,
        tipo: x.asset.type,
        // Bloque 161: el dibujo según el dispositivo (domo, bala, PTZ, antena base…).
        icono: iconoDelEquipo(x.asset.type, (x.asset as any).camera?.cameraStyle, (x.asset as any).wireless?.mode),
        referencia: x.asset.referencePlace,
        ubicacionId: x.asset.locationId,
        xPx: x.xPx, yPx: x.yPx,
        xM: mpp ? +(x.xPx * mpp).toFixed(1) : null,
        yM: mpp ? +(x.yPx * mpp).toFixed(1) : null,
        alturaM: x.alturaM, rumbo: x.rumbo, anguloVision: x.anguloVision, alcanceM: x.alcanceM,
        zoom: x.zoom,
        vision: visionDelPunto(x.asset.camera?.fichaOptica, x.zoom),
        estado: est.color, estadoTexto: est.texto, fuente: est.fuente,
        om: om ? { code: om.code, tipo: om.type, avance: om.progressPct, estado: om.status } : null,
        incidencia: inc ? {
          id: inc.id, code: inc.code, prioridad: inc.priority, titulo: inc.title,
          tipoAviso: inc.tipoAviso ?? null, avisoSap: inc.avisoSap ?? null,
        } : null,
        ultima: ult ? { code: ult.code, tipo: ult.type, fecha: ult.executedDate } : null,
        switch: veRed && sw?.switchAsset ? { assetId: sw.switchAsset.id, codigo: sw.switchAsset.assetCode, puerto: sw.portNumber } : null,
      };
    });
    return { equipos, hayMonitoreo: observaciones.length > 0 };
  }

  /**
   * LAS ZONAS DEL PLANO — bloque 165. Cada una con sus equipos (los que caen
   * dentro del dibujo), su resumen y, si su ubicación tiene plano propio, ese
   * plano y cómo está. Y el plano «padre» para volver un nivel arriba.
   */
  private async zonasDe(
    p: { id: string; locationId: string },
    equipos: { assetId: string; xPx: number; yPx: number; estado: string; ubicacionId: string | null }[],
    ahora: number,
  ) {
    const [filas, nodos, publicados] = await Promise.all([
      this.prisma.zonaEnPlano.findMany({
        where: { planoId: p.id },
        include: {
          location: {
            select: {
              name: true, type: true,
              // Bloque 176 · lo que la zona ya declara de su riesgo.
              riesgoPersonas: true, riesgoPersonasMotivo: true, requiereAltura: true,
              intervencionFirmada: true, criticidadProduccion: true,
            },
          },
        },
        orderBy: { dibujadoEn: 'asc' },
      }),
      this.prisma.location.findMany({ select: { id: true, parentId: true, type: true, code: true, stageId: true } }),
      this.prisma.plano.findMany({
        where: { estado: 'PUBLICADO', id: { not: p.id } },
        select: { id: true, nombre: true, locationId: true, metrosPorPx: true },
      }),
    ]);
    const planoDe = new Map(publicados.map((x) => [x.locationId, x]));
    const padreDe = new Map(nodos.map((n) => [n.id, n.parentId]));

    const zonas: any[] = [];
    for (const z of filas) {
      const pol = (z.puntos as unknown as Punto[]) || [];
      const dentro = equipos.filter((e) => dentroDeZona(e.xPx, e.yPx, pol));
      const rama = descendientes(nodos as any, [z.locationId]);
      const hijo = planoDe.get(z.locationId) ?? null;
      let resumenHijo: Record<string, number> | null = null;
      if (hijo) resumenHijo = contar((await this.equiposDe(hijo, false, ahora)).equipos);
      const resumen = contar(dentro);
      /* Lo que se ve en ESTE plano manda; si la zona no tiene nada dibujado
         aquí pero su plano propio sí, el color sale de ese plano. */
      const base = dentro.length ? resumen : (resumenHijo ?? resumen);
      zonas.push({
        id: z.id,
        locationId: z.locationId,
        nombre: z.location.name,
        tipoUbicacion: z.location.type,
        puntos: pol,
        caja: cajaDeZona(pol),
        rotulo: rotuloDeZona(pol),
        equipos: dentro.map((e) => e.assetId),
        resumen,
        estado: estadoDeZona(base),
        /* Dentro del dibujo pero con otra ubicación en su ficha: se avisa, no
           se corrige a escondidas (puede estar mal el dibujo o la ficha). */
        conOtraUbicacion: dentro.filter((e) => !e.ubicacionId || !rama.has(e.ubicacionId)).map((e) => e.assetId),
        planoHijo: hijo ? { id: hijo.id, nombre: hijo.nombre, resumen: resumenHijo } : null,
        riesgos: riesgosDeUbicacion(z.location as any),
      });
    }

    // El plano del nivel de arriba: el de la ubicación antepasada más cercana.
    let padre: { id: string; nombre: string } | null = null;
    for (let u = padreDe.get(p.locationId); u; u = padreDe.get(u)) {
      const x = planoDe.get(u);
      if (x) { padre = { id: x.id, nombre: x.nombre }; break; }
    }
    return { zonas, padre };
  }

  /** Bloque 176 · las áreas de riesgo dibujadas en el plano, con quién las dibujó. */
  private async riesgosDe(planoId: string) {
    const filas = await this.prisma.zonaDeRiesgo.findMany({ where: { planoId }, orderBy: { dibujadoEn: 'asc' } });
    const ids = [...new Set(filas.map((f) => f.dibujadoPorId).filter(Boolean) as string[])];
    const gente = ids.length ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }) : [];
    const nombre = new Map(gente.map((u) => [u.id, u.fullName]));
    return filas
      .map((f) => {
        const pol = (f.puntos as unknown as Punto[]) || [];
        return {
          id: f.id, nivel: f.nivel as NivelRiesgo, nombre: f.nombre, motivo: f.motivo, puntos: pol,
          caja: cajaDeZona(pol), rotulo: rotuloDeZona(pol),
          dibujadoPor: f.dibujadoPorId ? nombre.get(f.dibujadoPorId) ?? null : null, editadoEn: f.editadoEn,
        };
      })
      .sort((a, b) => ORDEN_RIESGO[b.nivel] - ORDEN_RIESGO[a.nivel]); // lo más grave se dibuja encima
  }

  /**
   * Bloque 176 · LA RED SOBRE EL PLANO: el cable de cada puerto del switch al
   * equipo enchufado, los enlaces declarados (fibra, radio, cobre), el
   * resumen de puertos de cada switch y los avisos de norma. Sólo a quien ve
   * la red. Nada se inventa: una línea sale sólo si el puerto está declarado
   * y los DOS extremos están dibujados en este plano.
   */
  private async redDe(
    p: { id: string; metrosPorPx: number | null },
    equipos: any[],
    areas: { nivel: NivelRiesgo; nombre: string; puntos: Punto[] }[],
  ) {
    const mpp = p.metrosPorPx;
    const pos = new Map<string, any>(equipos.map((e) => [e.assetId, e]));
    const ids = [...pos.keys()];
    const switchesAqui = equipos.filter((e) => e.tipo === 'SWITCH').map((e) => e.assetId);
    const [puertos, trazados, enlacesBd, fichas] = await Promise.all([
      this.prisma.switchPort.findMany({
        where: { OR: [{ connectedAssetId: { in: ids } }, { switchId: { in: switchesAqui } }] },
        select: {
          switchId: true, portNumber: true, poe: true, connectedAssetId: true,
          switchAsset: { select: { assetCode: true } },
          connectedAsset: { select: { type: true } },
        },
      }),
      this.prisma.trazadoCable.findMany({ where: { planoId: p.id } }),
      this.prisma.networkLink.findMany({
        where: { endpointAId: { in: ids }, endpointBId: { in: ids } },
        select: { id: true, medium: true, isRing: true, endpointAId: true, endpointBId: true },
      }),
      this.prisma.assetSwitch.findMany({ where: { assetId: { in: switchesAqui } }, select: { assetId: true, portCount: true, poePorts: true } }),
    ]);
    const trazadoDe = new Map(trazados.map((t) => [t.assetId, t]));
    const ids2 = [...new Set(trazados.map((t) => t.trazadoPorId).filter(Boolean) as string[])];
    const gente = ids2.length ? await this.prisma.user.findMany({ where: { id: { in: ids2 } }, select: { id: true, fullName: true } }) : [];
    const quien = new Map(gente.map((u) => [u.id, u.fullName]));
    const aM = (px: number) => (mpp ? Math.round(px * mpp) : null);
    const medioDe = (l: Punto[]) => l[Math.floor(l.length / 2)] ?? l[0];
    const cruzaDe = (linea: Punto[]) => {
      const vistos = new Set<string>();
      return areas
        .filter((z) => lineaPasaPorZona(linea, z.puntos))
        .filter((z) => { const k = z.nivel + z.nombre; return vistos.has(k) ? false : (vistos.add(k), true); })
        .map((z) => ({ nivel: z.nivel, nombre: z.nombre }));
    };

    const cables: any[] = [];
    const conPuerto = new Set<string>();
    const switchFuera: any[] = [];
    for (const pt of puertos) {
      if (!pt.connectedAssetId) continue;
      const eq = pos.get(pt.connectedAssetId);
      if (eq) conPuerto.add(eq.assetId);
      const sw = pos.get(pt.switchId);
      if (eq && !sw) {
        switchFuera.push({ assetId: eq.assetId, codigo: eq.codigo, switchCodigo: pt.switchAsset.assetCode, xPx: eq.xPx, yPx: eq.yPx });
        continue;
      }
      if (!eq || !sw) continue;
      const t = trazadoDe.get(eq.assetId);
      const puntos = t ? ((t.puntos as unknown as Punto[]) || []) : null;
      const linea = recorrido({ x: sw.xPx, y: sw.yPx }, { x: eq.xPx, y: eq.yPx }, puntos);
      const metros = aM(largoPx(linea));
      const esEnlace = ES_RED.includes(pt.connectedAsset?.type ?? '');
      const cruza = cruzaDe(linea);
      cables.push({
        assetId: eq.assetId, codigo: eq.codigo, switchId: sw.assetId, switchCodigo: sw.codigo,
        puerto: pt.portNumber, poe: pt.poe, esEnlace,
        linea, puntos: puntos ?? [], metros, estimado: !t,
        trazadoPor: t?.trazadoPorId ? quien.get(t.trazadoPorId) ?? null : null, trazadoEn: t?.trazadoEn ?? null,
        cruza,
        fueraDeNorma: (!esEnlace && metros != null && metros > TOPE_UTP_M) || cruza.some((z) => z.nivel !== 'VITAL' && z.nivel !== 'ALTURA'),
        medio: medioDe(linea),
      });
    }

    const enlaces = enlacesBd.map((l) => {
      const a = pos.get(l.endpointAId), b = pos.get(l.endpointBId);
      const linea: Punto[] = [[a.xPx, a.yPx], [b.xPx, b.yPx]];
      return {
        id: l.id, medio: l.medium, anillo: l.isRing, aId: a.assetId, bId: b.assetId,
        codigo: `${a.codigo} ↔ ${b.codigo}`, linea, metros: aM(largoPx(linea)),
      };
    });

    const fichaDe = new Map(fichas.map((f) => [f.assetId, f]));
    const switches = switchesAqui.map((id) => {
      const e = pos.get(id);
      const suyos = puertos.filter((x) => x.switchId === id);
      const f = fichaDe.get(id);
      const r = {
        assetId: id, codigo: e.codigo, xPx: e.xPx, yPx: e.yPx,
        capacidad: f?.portCount ?? null, ocupados: suyos.filter((x) => x.connectedAssetId).length,
        poeUsados: suyos.filter((x) => x.poe).length, poePuertos: f?.poePorts ?? null,
      };
      e.puertos = { capacidad: r.capacidad, ocupados: r.ocupados, libres: r.capacidad != null ? Math.max(0, r.capacidad - r.ocupados) : null,
        poeUsados: r.poeUsados, poePuertos: r.poePuertos };
      return r;
    });

    const sinConexion = equipos
      .filter((e) => CUELGA_DE_PUERTO.includes(e.tipo) && !conPuerto.has(e.assetId))
      .map((e) => ({ assetId: e.assetId, codigo: e.codigo, xPx: e.xPx, yPx: e.yPx }));

    // Un enlace de cobre declarado también tiene el tope de 90 m.
    const deCobre = enlaces.filter((l) => l.medio === 'COBRE').map((l) => ({
      assetId: l.aId, codigo: l.codigo, metros: l.metros, estimado: true, esEnlace: false, cruza: [], medio: medioDe(l.linea),
    }));
    const avisos = avisosDeNorma({ cables: [...cables, ...deCobre], switches, sinConexion, switchFuera });
    return { cables, enlaces, avisos };
  }

  /**
   * LA PLANTA DE UN VISTAZO — bloque 165. Todos los planos publicados que esta
   * persona puede ver, con cómo está cada uno y cuántas zonas tiene. Es la
   * portada del Mapa cuando hay más de un plano: primero dónde hay problema,
   * después se entra.
   */
  async planta(userId: string | null) {
    const ambito = await filtroConAmbito(this.prisma, userId, {});
    const planos = await this.prisma.plano.findMany({
      where: { estado: 'PUBLICADO', ...(ambito ? { locationId: { in: ambito.in } } : {}) },
      orderBy: { nombre: 'asc' },
      select: {
        id: true, nombre: true, locationId: true, metrosPorPx: true,
        location: { select: { name: true, parentId: true } },
        _count: { select: { zonas: true } },
      },
    });
    const nodos = await this.prisma.location.findMany({ select: { id: true, parentId: true, type: true, name: true } });
    const porId = new Map(nodos.map((n) => [n.id, n]));
    const conPlano = new Set(planos.map((x) => x.locationId));
    const ahora = Date.now();
    const filas: any[] = [];
    for (const x of planos) {
      const { equipos } = await this.equiposDe(x, false, ahora);
      const resumen = contar(equipos);
      // El tren (o sector) al que pertenece, para agrupar; y si cuelga de otro plano.
      let tren: string | null = null;
      let dentroDe: string | null = null;
      for (let n = porId.get(x.locationId); n; n = n.parentId ? porId.get(n.parentId) : undefined) {
        if (!tren && n.type === 'TREN') tren = n.name;
        if (!dentroDe && n.id !== x.locationId && conPlano.has(n.id)) dentroDe = planos.find((q) => q.locationId === n!.id)?.id ?? null;
      }
      filas.push({
        id: x.id, nombre: x.nombre, ubicacion: x.location?.name ?? null, tren,
        dentroDe, zonas: x._count.zonas, total: equipos.length, resumen, estado: estadoDeZona(resumen),
      });
    }
    return filas;
  }

  // --------------------------------------------------------------- gestión
  async crear(archivo: any, dto: CrearPlanoDto, userId: string | null, ip?: string) {
    const buf: Buffer | undefined = archivo?.buffer;
    if (!buf?.length) throw new BadRequestException('No llegó el archivo del plano.');
    if (buf.length > MAX_BYTES_PLANO) throw new BadRequestException('El plano pesa más de 25 MB. Expórtalo con menos resolución.');
    const img = tipoRealDeImagen(buf);
    const tipo = img ? { mime: img.mime, ext: img.extension } : esSvgLimpio(buf) ? { mime: 'image/svg+xml', ext: 'svg' } : null;
    if (!tipo) {
      throw new BadRequestException('El plano tiene que ser PNG, JPG, WEBP o SVG (sin scripts). Desde AutoCAD: exportar a PNG o a SVG.');
    }
    const ubic = await this.prisma.location.findUnique({ where: { id: dto.locationId }, select: { id: true } });
    if (!ubic) throw new BadRequestException('Esa ubicación no existe.');

    const anterior = await this.prisma.plano.findFirst({
      where: { locationId: dto.locationId },
      orderBy: { version: 'desc' },
      select: { id: true, version: true, anchoPx: true, altoPx: true },
    });
    const creado = await this.prisma.plano.create({
      data: {
        nombre: dto.nombre.trim(), locationId: dto.locationId,
        version: (anterior?.version ?? 0) + 1,
        archivoFileId: 'pendiente', archivoMime: tipo.mime,
        anchoPx: dto.anchoPx, altoPx: dto.altoPx,
        notas: dto.notas?.trim() || null, creadoPorId: userId,
      },
    });
    const objeto = `planos/${creado.id}.${tipo.ext}`;
    await this.storage.put(objeto, buf, tipo.mime);
    await this.prisma.plano.update({ where: { id: creado.id }, data: { archivoFileId: objeto } });

    /* Una versión nueva hereda las posiciones de la anterior, SÓLO si la
       imagen tiene el mismo tamaño: con otro tamaño los píxeles ya no caen en
       el mismo sitio y copiarlas pondría cada cámara en el lugar equivocado. */
    let heredadas = 0;
    if (anterior && anterior.anchoPx === dto.anchoPx && anterior.altoPx === dto.altoPx) {
      const previas = await this.prisma.posicionEnPlano.findMany({ where: { planoId: anterior.id } });
      if (previas.length) {
        await this.prisma.posicionEnPlano.createMany({
          data: previas.map(({ planoId: _p, colocadoEn: _c, ...resto }) => ({ ...resto, planoId: creado.id })),
        });
        heredadas = previas.length;
      }
    }
    await this.audit.record({
      userId, ip, action: 'PLANO_CREAR', entity: 'planos', entityId: creado.id,
      after: { nombre: creado.nombre, version: creado.version, heredadas },
    });
    return { id: creado.id, version: creado.version, heredadas };
  }

  async calibrarPlano(id: string, dto: CalibrarPlanoDto, userId: string | null, ip?: string) {
    const p = await this.plano(id);
    if (p.estado === 'ARCHIVADO') throw new BadRequestException('Un plano archivado no se toca: sube una versión nueva.');
    const r = calibrar({ x: dto.x1, y: dto.y1 }, { x: dto.x2, y: dto.y2 }, dto.metros);
    if ('error' in r) throw new BadRequestException(r.error);
    const hecho = await this.prisma.plano.update({
      where: { id },
      data: { metrosPorPx: r.metrosPorPx, ...(dto.rotacionNorte !== undefined ? { rotacionNorte: dto.rotacionNorte } : {}) },
      select: { id: true, metrosPorPx: true, rotacionNorte: true, anchoPx: true, altoPx: true },
    });
    await this.audit.record({
      userId, ip, action: 'PLANO_CALIBRAR', entity: 'planos', entityId: id,
      before: { metrosPorPx: p.metrosPorPx }, after: { metrosPorPx: r.metrosPorPx, metros: dto.metros },
    });
    return { ...hecho, anchoM: +(hecho.anchoPx * r.metrosPorPx).toFixed(1), altoM: +(hecho.altoPx * r.metrosPorPx).toFixed(1) };
  }

  /** Los equipos del área que todavía no están dibujados. El sistema dice lo que no sabe. */
  async sinColocar(id: string) {
    const p = await this.plano(id);
    const zona = await this.subarbol(p.locationId);
    const where = {
      deletedAt: null, parteDeId: null, status: { not: 'BAJA' as any },
      locationId: { in: [...zona] },
      posicionesEnPlano: { none: { planoId: id } },
    };
    const [total, items] = await Promise.all([
      this.prisma.asset.count({ where }),
      this.prisma.asset.findMany({
        where, orderBy: [{ type: 'asc' }, { assetCode: 'asc' }], take: 500,
        select: { id: true, assetCode: true, type: true, referencePlace: true },
      }),
    ]);
    return { total, mostrados: items.length, items };
  }

  async colocar(id: string, assetId: string, dto: ColocarEquipoDto, userId: string | null, ip?: string) {
    const p = await this.plano(id);
    if (p.estado === 'ARCHIVADO') throw new BadRequestException('Un plano archivado no se toca: sube una versión nueva.');
    if (!dentroDelPlano(dto.xPx, dto.yPx, p.anchoPx, p.altoPx)) {
      throw new BadRequestException('Ese punto cae fuera del plano.');
    }
    const activo = await this.prisma.asset.findFirst({
      where: { id: assetId, deletedAt: null }, select: { id: true, locationId: true, assetCode: true },
    });
    if (!activo) throw new NotFoundException('Ese equipo no existe.');
    const zona = await this.subarbol(p.locationId);
    if (!activo.locationId || !zona.has(activo.locationId)) {
      throw new BadRequestException(`${activo.assetCode} no está en la zona de este plano. Corrige su ubicación en Activos.`);
    }
    const datos = {
      xPx: dto.xPx, yPx: dto.yPx,
      alturaM: dto.alturaM ?? null, rumbo: dto.rumbo ?? null,
      anguloVision: dto.anguloVision ?? null, alcanceM: dto.alcanceM ?? null,
      zoom: dto.zoom ?? null,
      colocadoPorId: userId, colocadoEn: new Date(),
    };
    const antes = await this.prisma.posicionEnPlano.findUnique({ where: { planoId_assetId: { planoId: id, assetId } } });
    const r = await this.prisma.posicionEnPlano.upsert({
      where: { planoId_assetId: { planoId: id, assetId } },
      create: { planoId: id, assetId, ...datos },
      update: datos,
    });
    await this.audit.record({
      userId, ip, action: 'PLANO_COLOCAR', entity: 'posiciones_en_plano', entityId: `${id}:${assetId}`,
      // Bloque 176 · con el ANTES: mover un equipo cambia los metros de su cable.
      before: antes ? { xPx: antes.xPx, yPx: antes.yPx, alturaM: antes.alturaM, rumbo: antes.rumbo } : undefined,
      after: { equipo: activo.assetCode, xPx: dto.xPx, yPx: dto.yPx, alturaM: dto.alturaM ?? null, rumbo: dto.rumbo ?? null },
    });
    return r;
  }

  async quitar(id: string, assetId: string, userId: string | null, ip?: string) {
    const p = await this.plano(id);
    if (p.estado === 'ARCHIVADO') throw new BadRequestException('Un plano archivado no se toca.');
    const r = await this.prisma.posicionEnPlano.deleteMany({ where: { planoId: id, assetId } });
    await this.audit.record({
      userId, ip, action: 'PLANO_QUITAR', entity: 'posiciones_en_plano', entityId: `${id}:${assetId}`,
    });
    return { quitados: r.count };
  }

  /**
   * DIBUJAR UNA ZONA — bloque 165. La ubicación tiene que colgar de la del
   * plano (no se dibuja el Tren 2 sobre el plano del Tren 1) y no puede ser
   * la del propio plano (una zona que es el plano entero no ordena nada).
   * Volver a dibujarla la reemplaza.
   */
  async guardarZona(id: string, locationId: string, puntos: unknown, userId: string | null, ip?: string) {
    const p = await this.plano(id);
    if (p.estado === 'ARCHIVADO') throw new BadRequestException('Un plano archivado no se toca: sube una versión nueva.');
    const v = validarZona(puntos, p.anchoPx, p.altoPx);
    if ('error' in v) throw new BadRequestException(v.error);
    if (locationId === p.locationId) {
      throw new BadRequestException('Esa es la ubicación de todo el plano. Elige una sala o área que cuelgue de ella.');
    }
    const rama = await this.subarbol(p.locationId);
    if (!rama.has(locationId)) {
      throw new BadRequestException('Esa ubicación no está dentro de la zona de este plano. Créala en Ubicaciones, colgando de ella.');
    }
    const antes = await this.prisma.zonaEnPlano.findUnique({ where: { planoId_locationId: { planoId: id, locationId } } });
    const z = await this.prisma.zonaEnPlano.upsert({
      where: { planoId_locationId: { planoId: id, locationId } },
      create: { planoId: id, locationId, puntos: v.puntos as any, dibujadoPorId: userId },
      update: { puntos: v.puntos as any, dibujadoPorId: userId, dibujadoEn: new Date() },
    });
    await this.audit.record({
      userId, ip, action: 'PLANO_ZONA', entity: 'zonas_en_plano', entityId: z.id,
      before: antes ? { puntos: antes.puntos } : undefined, after: { locationId, vertices: v.puntos.length },
    });
    return { id: z.id, locationId, puntos: v.puntos };
  }

  async borrarZona(id: string, locationId: string, userId: string | null, ip?: string) {
    const p = await this.plano(id);
    if (p.estado === 'ARCHIVADO') throw new BadRequestException('Un plano archivado no se toca.');
    const r = await this.prisma.zonaEnPlano.deleteMany({ where: { planoId: id, locationId } });
    await this.audit.record({
      userId, ip, action: 'PLANO_ZONA_BORRAR', entity: 'zonas_en_plano', entityId: `${id}:${locationId}`,
    });
    return { borradas: r.count };
  }

  // ------------------------------------------- bloque 176 · regular el mapa
  /**
   * DIBUJAR O CORREGIR UNA ZONA DE RIESGO. El motivo es obligatorio siempre,
   * también al corregir: es lo que se lee en la auditoría cuando alguien
   * pregunta por qué ese borde es rojo.
   */
  async guardarRiesgo(
    id: string, riesgoId: string | null,
    dto: { nivel?: string; nombre?: string; motivo?: string; puntos?: unknown },
    userId: string | null, ip?: string,
  ) {
    const p = await this.plano(id);
    if (p.estado === 'ARCHIVADO') throw new BadRequestException('Un plano archivado no se toca: sube una versión nueva.');
    if (!esNivel(dto.nivel)) throw new BadRequestException('Elige el nivel: alto riesgo, altura, eléctrico, calor o zona vital.');
    const nombre = String(dto.nombre || '').trim();
    if (nombre.length < 3) throw new BadRequestException('Ponle nombre al área (ej. «Paso de grúa 2»).');
    const motivo = String(dto.motivo || '').trim();
    if (motivo.length < 5) throw new BadRequestException('Di por qué es de riesgo. Un borde sin motivo no se puede defender en una auditoría.');
    const v = validarZona(dto.puntos, p.anchoPx, p.altoPx);
    if ('error' in v) throw new BadRequestException(v.error);

    const datos = { nivel: dto.nivel as any, nombre: nombre.slice(0, 80), motivo: motivo.slice(0, 500), puntos: v.puntos as any, dibujadoPorId: userId };
    if (riesgoId) {
      const antes = await this.prisma.zonaDeRiesgo.findFirst({ where: { id: riesgoId, planoId: id } });
      if (!antes) throw new NotFoundException('Esa zona de riesgo no existe en este plano.');
      const r = await this.prisma.zonaDeRiesgo.update({ where: { id: riesgoId }, data: datos });
      await this.audit.record({
        userId, ip, action: 'MAPA_RIESGO_EDITAR', entity: 'zonas_de_riesgo', entityId: r.id,
        before: { nivel: antes.nivel, nombre: antes.nombre, motivo: antes.motivo, puntos: antes.puntos },
        after: { nivel: r.nivel, nombre: r.nombre, motivo: r.motivo, puntos: v.puntos },
      });
      return { id: r.id };
    }
    const r = await this.prisma.zonaDeRiesgo.create({ data: { planoId: id, ...datos } });
    await this.audit.record({
      userId, ip, action: 'MAPA_RIESGO_CREAR', entity: 'zonas_de_riesgo', entityId: r.id,
      after: { planoId: id, nivel: r.nivel, nombre: r.nombre, motivo: r.motivo, puntos: v.puntos },
    });
    return { id: r.id };
  }

  /** Quitar un área de riesgo también pide motivo: quitar un borde rojo es una decisión. */
  async borrarRiesgo(id: string, riesgoId: string, motivo: string | undefined, userId: string | null, ip?: string) {
    const p = await this.plano(id);
    if (p.estado === 'ARCHIVADO') throw new BadRequestException('Un plano archivado no se toca.');
    if (String(motivo || '').trim().length < 5) throw new BadRequestException('Di por qué se quita esta zona de riesgo.');
    const antes = await this.prisma.zonaDeRiesgo.findFirst({ where: { id: riesgoId, planoId: id } });
    if (!antes) throw new NotFoundException('Esa zona de riesgo no existe en este plano.');
    // Se audita ANTES de borrar (bloque 15): si el borrado fallara, no queda un registro que mienta al revés.
    await this.audit.record({
      userId, ip, action: 'MAPA_RIESGO_BORRAR', entity: 'zonas_de_riesgo', entityId: riesgoId,
      before: { nivel: antes.nivel, nombre: antes.nombre, motivo: antes.motivo, puntos: antes.puntos },
      after: { motivoDelBorrado: String(motivo).trim() },
    });
    await this.prisma.zonaDeRiesgo.delete({ where: { id: riesgoId } });
    return { borrada: true };
  }

  /**
   * TRAZAR EL CABLE de un equipo a su switch: los puntos por donde va de
   * verdad. Sólo si el puerto está declarado y los dos extremos están en este
   * plano; si no, no hay cable que trazar. Lista vacía = volver al estimado.
   */
  async guardarTrazado(id: string, assetId: string, puntosIn: unknown, userId: string | null, ip?: string) {
    const p = await this.plano(id);
    if (p.estado === 'ARCHIVADO') throw new BadRequestException('Un plano archivado no se toca.');
    const v = validarTrazado(puntosIn, p.anchoPx, p.altoPx);
    if ('error' in v) throw new BadRequestException(v.error);
    const puerto = await this.prisma.switchPort.findUnique({
      where: { connectedAssetId: assetId },
      select: { switchId: true, portNumber: true, connectedAsset: { select: { assetCode: true } } },
    });
    if (!puerto) throw new BadRequestException('Ese equipo no tiene puerto de switch declarado. Declara el puerto en Red › Conexiones.');
    const [eq, sw] = await Promise.all([
      this.prisma.posicionEnPlano.findUnique({ where: { planoId_assetId: { planoId: id, assetId } } }),
      this.prisma.posicionEnPlano.findUnique({ where: { planoId_assetId: { planoId: id, assetId: puerto.switchId } } }),
    ]);
    if (!eq || !sw) throw new BadRequestException('El equipo y su switch tienen que estar colocados en este plano para trazar el cable.');

    const antes = await this.prisma.trazadoCable.findUnique({ where: { planoId_assetId: { planoId: id, assetId } } });
    const mpp = p.metrosPorPx;
    const metros = (pts: Punto[] | null) => (mpp ? Math.round(largoPx(recorrido({ x: sw.xPx, y: sw.yPx }, { x: eq.xPx, y: eq.yPx }, pts)) * mpp) : null);
    const metrosAntes = metros(antes ? (antes.puntos as unknown as Punto[]) : null);
    const metrosDespues = metros(v.puntos.length ? v.puntos : null);

    // Volver al estimado algo que nunca se trazó no cambia nada: ni se escribe ni se audita.
    if (!v.puntos.length && !antes) return { metros: metrosDespues, estimado: true };
    if (!v.puntos.length) {
      await this.prisma.trazadoCable.delete({ where: { planoId_assetId: { planoId: id, assetId } } });
    } else {
      await this.prisma.trazadoCable.upsert({
        where: { planoId_assetId: { planoId: id, assetId } },
        create: { planoId: id, assetId, puntos: v.puntos as any, trazadoPorId: userId },
        update: { puntos: v.puntos as any, trazadoPorId: userId, trazadoEn: new Date() },
      });
    }
    await this.audit.record({
      userId, ip, action: v.puntos.length ? 'MAPA_CABLE_TRAZAR' : 'MAPA_CABLE_BORRAR', entity: 'trazados_de_cable',
      entityId: `${id}:${assetId}`,
      before: antes ? { puntos: antes.puntos, metros: metrosAntes } : { estimado: true, metros: metrosAntes },
      after: { equipo: puerto.connectedAsset?.assetCode, puerto: puerto.portNumber, puntos: v.puntos, metros: metrosDespues },
    });
    return { metros: metrosDespues, estimado: !v.puntos.length };
  }

  /** Publicar: el plano pasa a ser EL de su zona y el anterior queda archivado. */
  async publicar(id: string, userId: string | null, ip?: string) {
    const p = await this.plano(id);
    if (p.estado === 'PUBLICADO') return { id, estado: 'PUBLICADO' };
    if (p.estado === 'ARCHIVADO') throw new BadRequestException('Un plano archivado no se vuelve a publicar: sube una versión nueva.');
    if (!p.metrosPorPx) throw new BadRequestException('Calibra la escala antes de publicar: sin ella no hay metros ni distancias.');
    const colocados = await this.prisma.posicionEnPlano.count({ where: { planoId: id } });
    if (!colocados) throw new BadRequestException('No hay ningún equipo colocado. Un plano vacío no sirve para monitorear.');
    await this.prisma.$transaction([
      this.prisma.plano.updateMany({
        where: { locationId: p.locationId, estado: 'PUBLICADO', id: { not: id } },
        data: { estado: 'ARCHIVADO' },
      }),
      this.prisma.plano.update({
        where: { id },
        data: { estado: 'PUBLICADO', publicadoPorId: userId, publicadoEn: new Date() },
      }),
    ]);
    await this.audit.record({
      userId, ip, action: 'PLANO_PUBLICAR', entity: 'planos', entityId: id,
      after: { version: p.version, colocados },
    });
    return { id, estado: 'PUBLICADO' };
  }
}
