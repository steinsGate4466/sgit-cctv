import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { evaluarReincidencia, severidadGlobal, VENTANA_DIAS } from '../../common/reincidencia';
import { filtroConAmbito } from '../../common/ambito-usuario';
import { LIMITE_TRAMO_M } from './cables.service';

/**
 * HISTORIAL DEL ACTIVO — la retroalimentación que faltaba.
 *
 * EL PROBLEMA QUE RESUELVE
 * Todo lo que capturamos —causas de cierre, reincidencia marcada, tramos de
 * cable, incidencias— se guardaba y nadie lo volvía a mirar. El ingeniero creaba
 * una orden sobre una cámara sin ver nada de su pasado, y el técnico iba a campo
 * a improvisar. La lista de 17 causas, sin este paso, solo acumulaba datos que
 * nadie leía.
 *
 * Aquí se junta todo y se muestra ANTES de intervenir: al crear la orden, en la
 * ficha del activo y al escanear su QR en planta.
 */
@Injectable()
export class HistoryService {
  constructor(private prisma: PrismaService) {}

  /**
   * Historial completo de un activo, con las señales de reincidencia ya
   * evaluadas y la infraestructura que comparte con otros equipos.
   */
  async delActivo(assetId: string) {
    const activo = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: {
        location: { select: { id: true, name: true } },
        camera: { select: { nvrId: true, wirelessUplinkId: true, poeSourcePortId: true, nvrName: true, nvrChannel: true } },
      },
    });
    if (!activo || activo.deletedAt) throw new NotFoundException('Activo no encontrado');

    const desde = new Date(Date.now() - VENTANA_DIAS * 24 * 60 * 60 * 1000);

    const [ordenes, incidencias, tramos, accesos] = await Promise.all([
      this.prisma.workOrder.findMany({
        where: { assetId },
        orderBy: [{ endedAt: 'desc' }, { createdAt: 'desc' }],
        take: 20,
        select: {
          id: true, code: true, type: true, status: true,
          rootCause: true, rootCauseNote: true, isRecurrent: true,
          startedAt: true, endedAt: true, executedDate: true, scheduledDate: true,
          diagnosis: true, materials: true,
          technician: { select: { fullName: true } },
        },
      }),
      this.prisma.incident.findMany({
        where: { assetId },
        // El campo de fecha de la incidencia es reportedAt, no createdAt.
        orderBy: { reportedAt: 'desc' },
        take: 15,
        select: {
          id: true, code: true, title: true, category: true, priority: true, status: true,
          reportedAt: true, resolvedAt: true,
          // Minutos sin visión: el impacto real en producción. Es el dato que
          // convierte "falló una cámara" en "el púlpito estuvo ciego 3 horas".
          visionDownMin: true,
          mttrMinutes: true,
          rootCause: true,
        },
      }),
      this.prisma.assetCable.findMany({
        where: {
          status: { not: 'RETIRADO' },
          OR: [{ fromAssetId: assetId }, { toAssetId: assetId }],
        },
        select: {
          id: true, code: true, category: true, meters: true, metersEstimated: true,
          shielded: true, route: true, status: true, fromAssetId: true, toAssetId: true,
        },
      }),
      this.prisma.accessRequest.findMany({
        where: { assetId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, code: true, status: true, means: true, heightMeters: true, createdAt: true },
      }),
    ]);

    const compartida = await this.infraestructuraCompartida(activo, desde);

    const senales = evaluarReincidencia({
      ordenes: ordenes as any,
      tramos: tramos as any,
      compartida,
      limiteTramoM: LIMITE_TRAMO_M,
    });

    // Conteo por causa: qué le pasa REALMENTE a este equipo.
    const porCausa: Record<string, number> = {};
    for (const o of ordenes) {
      if (o.rootCause) porCausa[o.rootCause] = (porCausa[o.rootCause] || 0) + 1;
    }

    // Materiales usados históricamente. Hoy es texto libre, así que solo se
    // juntan las líneas: cuando el inventario esté ligado a la OM (Bloque 9)
    // esto pasará a ser una lista con código SAP y cantidades reales.
    const materiales = ordenes
      .flatMap((o) => (o.materials || '').split('\n'))
      .map((m) => m.trim())
      .filter(Boolean);

    return {
      activo: {
        id: activo.id,
        assetCode: activo.assetCode,
        type: activo.type,
        ubicacion: activo.location?.name || null,
        nombreEnGrabador: activo.camera?.nvrName || null,
        canal: activo.camera?.nvrChannel ?? null,
      },
      ventanaDias: VENTANA_DIAS,
      resumen: {
        ordenesTotales: ordenes.length,
        ordenesEnVentana: ordenes.filter((o) => {
          const f = o.endedAt || o.executedDate;
          return f ? new Date(f) >= desde : false;
        }).length,
        incidencias: incidencias.length,
        sinFallaEncontrada: ordenes.filter((o) => o.rootCause === 'SIN_FALLA_ENCONTRADA').length,
        marcadasReincidentes: ordenes.filter((o) => o.isRecurrent).length,
        // Impacto acumulado en producción: cuánto tiempo el púlpito estuvo
        // ciego por culpa de este equipo. Es el argumento para justificar un
        // reemplazo ante el Jefe, mucho más que el número de órdenes.
        minutosSinVision: incidencias.reduce((t, i) => t + (i.visionDownMin || 0), 0),
      },
      porCausa,
      ordenes,
      incidencias,
      tramos,
      accesos,
      compartida,
      senales,
      severidad: severidadGlobal(senales),
      materiales: Array.from(new Set(materiales)).slice(0, 20),
    };
  }

  /**
   * Equipos que comparten infraestructura con este activo y cuántos de ellos
   * también fallaron en la ventana.
   *
   * ES LA PIEZA QUE RESPONDE A LA QUEJA DEL JEFE: si 4 de las 6 cámaras que
   * cuelgan de la misma antena también fallaron, el problema no está en la
   * cámara que se está mirando. Hoy nadie puede ver eso.
   */
  private async infraestructuraCompartida(activo: any, desde: Date) {
    const cam = activo.camera;
    if (!cam) return { vecinos: 0, vecinosConFalla: 0, via: null, vecinosDetalle: [] };

    // Se prioriza la antena: es el punto de falla más frecuente en esta planta.
    let via: string | null = null;
    let where: any = null;

    if (cam.wirelessUplinkId) {
      via = 'la misma antena';
      where = { wirelessUplinkId: cam.wirelessUplinkId };
    } else if (cam.poeSourcePortId) {
      via = 'el mismo puerto PoE';
      where = { poeSourcePortId: cam.poeSourcePortId };
    } else if (cam.nvrId) {
      via = 'el mismo grabador';
      where = { nvrId: cam.nvrId };
    }
    if (!where) return { vecinos: 0, vecinosConFalla: 0, via: null, vecinosDetalle: [] };

    const hermanas = await this.prisma.assetCamera.findMany({
      where: { ...where, assetId: { not: activo.id } },
      select: { assetId: true, asset: { select: { assetCode: true } } },
    });
    if (!hermanas.length) return { vecinos: 0, vecinosConFalla: 0, via, vecinosDetalle: [] };

    const ids = hermanas.map((h) => h.assetId);
    // Una sola consulta agrupada: con 400 activos, preguntar uno por uno sería
    // un N+1 que se nota al abrir la pantalla.
    const conFalla = await this.prisma.workOrder.groupBy({
      by: ['assetId'],
      where: {
        assetId: { in: ids },
        type: 'CORRECTIVO',
        OR: [{ endedAt: { gte: desde } }, { executedDate: { gte: desde } }],
      },
      _count: { _all: true },
    });

    const mapa = new Map(conFalla.map((c) => [c.assetId, c._count._all]));
    return {
      via,
      vecinos: hermanas.length,
      vecinosConFalla: conFalla.length,
      vecinosDetalle: hermanas.map((h) => ({
        assetCode: h.asset?.assetCode || '—',
        ordenes: mapa.get(h.assetId) || 0,
      })).sort((a, b) => b.ordenes - a.ordenes),
    };
  }

  /* ===========================================================================
     BLOQUE 107 · EQUIPOS RETIRADOS — LO QUE SALIÓ DE PLANTA SIGUE CONTANDO
     ---------------------------------------------------------------------------
     DE DÓNDE SALE. Palabras del usuario, descartando un botón de borrado
     masivo: «nos puede eliminar toda la data... mejor hagamos un módulo de
     historial de equipos desfasados/retirados».

     Tenía razón, y la razón es de fondo: un equipo dado de BAJA no es basura
     que estorba. Es la mitad de dos informes que este proyecto necesita:

       · el de REEMPLAZO   — «esta cámara se cambió tres veces en dos años»
       · el de MIGRACIÓN   — qué se sustituyó, por qué y cuándo

     Sin pantalla, todo eso existía en la base y no lo veía nadie. Y en este
     proyecto eso tiene nombre: modelo + endpoint ≠ función.

     ---------------------------------------------------------------------------
     POR QUÉ NO SE REUTILIZA `findAll` CON `?status=BAJA`

     Porque `findAll` filtra `deletedAt: null` de entrada, que es justo lo que
     aquí hay que mirar. Colarle una excepción a la lista principal la
     convertiría en una función con dos comportamientos, y el día que alguien
     olvide el parámetro, los equipos retirados aparecerían mezclados con los
     vivos en la pantalla del ingeniero. Un listado que a veces enseña equipos
     que ya no están es peor que no tenerlo.

     ---------------------------------------------------------------------------
     TRES CONSULTAS Y NINGÚN N+1

     Una para los equipos, una para quién firmó la baja (auditoría) y una para
     la última orden de cada uno. Nada dentro de un bucle: la lección del
     bloque 102 y del preventivo del 105.
  =========================================================================== */

  /** Tope de la pantalla de retirados. Va con su `count`, como manda el 101. */
  static readonly TOPE_RETIRADOS = 200;

  async retirados(
    q: { tren?: string | null; etapa?: string | null } | null | undefined,
    userId?: string | null,
  ) {
    const generadoEn = new Date();
    const ambito = await filtroConAmbito(this.prisma, userId, {
      tren: q?.tren, etapa: q?.etapa,
    });

    /* DOS MARCAS PARA UNA MISMA COSA, y las dos se miran a propósito.
       `deletedAt` la pone la baja; `status: BAJA` lo puede dejar una edición
       manual antigua. Mirar sólo una dejaría equipos retirados fuera de la
       pantalla, que es exactamente lo que este bloque viene a arreglar. */
    const where: any = {
      OR: [{ deletedAt: { not: null } }, { status: 'BAJA' }],
    };
    if (ambito) where.locationId = ambito;

    const [total, activos] = await this.prisma.$transaction([
      this.prisma.asset.count({ where }),
      this.prisma.asset.findMany({
        where,
        orderBy: [{ deletedAt: 'desc' }, { updatedAt: 'desc' }],
        take: HistoryService.TOPE_RETIRADOS,
        select: {
          id: true, assetCode: true, type: true, brand: true, model: true,
          serialNumber: true, status: true, deletedAt: true, updatedAt: true,
          installDate: true, criticality: true,
          location: { select: { id: true, code: true, name: true } },
        },
      }),
    ]);

    const ids = activos.map((a) => a.id);

    /* QUIÉN FIRMÓ LA BAJA. Sale de la auditoría y no de un campo en el activo:
       el dato ya está escrito allí desde el bloque 15 y duplicarlo en el
       activo abriría la puerta a que los dos digan cosas distintas. */
    const firmas = new Map<string, any>();
    /* LA ÚLTIMA ORDEN DE CADA UNO: es lo que responde «por qué salió». */
    const ultimaOm = new Map<string, any>();

    if (ids.length) {
      const [bajas, ordenes] = await Promise.all([
        this.prisma.auditLog.findMany({
          where: { entity: 'assets', action: 'DELETE_ASSET', entityId: { in: ids } },
          orderBy: { createdAt: 'desc' },
          take: HistoryService.TOPE_RETIRADOS,
          select: {
            entityId: true, createdAt: true,
            user: { select: { id: true, fullName: true } },
          },
        }),
        this.prisma.workOrder.findMany({
          where: { assetId: { in: ids } },
          orderBy: [{ createdAt: 'desc' }],
          take: HistoryService.TOPE_RETIRADOS * 3,
          select: {
            assetId: true, code: true, type: true, status: true,
            rootCause: true, rootCauseCode: true, rootCauseNote: true,
            endedAt: true, createdAt: true,
          },
        }),
      ]);
      /* Se queda la PRIMERA de cada activo porque vienen ordenadas de más
         reciente a más antigua. El tope de 3 por equipo es holgado para la
         última; si un equipo tuviera más de tres órdenes muy recientes, la
         suya sigue siendo la primera que aparece. */
      for (const b of bajas) {
        if (b.entityId && !firmas.has(b.entityId)) firmas.set(b.entityId, b);
      }
      for (const o of ordenes) {
        if (o.assetId && !ultimaOm.has(o.assetId)) ultimaOm.set(o.assetId, o);
      }
    }

    const data = activos.map((a) => {
      const firma = firmas.get(a.id) ?? null;
      const om = ultimaOm.get(a.id) ?? null;
      /* LA FECHA DE SALIDA, DICIENDO DE DÓNDE SALE. Si no hay `deletedAt` es
         una baja antigua hecha a mano: se usa `updatedAt` y se MARCA como
         aproximada. Enseñarla como exacta sería inventar una fecha, y en este
         proyecto eso no se hace ni para que la tabla quede bonita. */
      const salida = a.deletedAt ?? firma?.createdAt ?? a.updatedAt;
      return {
        ...a,
        salida,
        salidaEsAproximada: !a.deletedAt && !firma,
        firmadaPor: firma?.user?.fullName ?? null,
        ultimaOm: om
          ? {
            code: om.code, tipo: om.type, estado: om.status,
            causa: om.rootCauseCode ?? om.rootCause ?? null,
            nota: om.rootCauseNote ?? null,
            en: om.endedAt ?? om.createdAt,
          }
          : null,
      };
    });

    return {
      generadoEn,
      total,
      tope: HistoryService.TOPE_RETIRADOS,
      recortados: total > data.length ? total - data.length : 0,
      sinFirma: data.filter((d) => !d.firmadaPor).length,
      data,
    };
  }

  /**
   * Activos con reincidencia detectada, para el tablero.
   *
   * PARA QUÉ: que la señal aparezca sola. Si hay que ir a buscarla activo por
   * activo, nadie la mira y el problema sigue invisible.
   */
  async reincidentes() {
    const desde = new Date(Date.now() - VENTANA_DIAS * 24 * 60 * 60 * 1000);

    // Candidatos: activos con más de una correctiva en la ventana, o con algún
    // cierre sin falla encontrada, o marcados por el técnico. Se filtra primero
    // para no evaluar los 400.
    const candidatos = await this.prisma.workOrder.findMany({
      where: {
        assetId: { not: null },
        OR: [
          { type: 'CORRECTIVO', endedAt: { gte: desde } },
          { rootCause: 'SIN_FALLA_ENCONTRADA' },
          { isRecurrent: true },
        ],
      },
      select: { assetId: true },
      distinct: ['assetId'],
      take: 200,
    });

    /* EL BUCLE QUE ERA UN N+1 — bloque 107.
       -------------------------------------------------------------------------
       Esto era un `for` con un `await` dentro llamando a `delActivo`, y
       `delActivo` hace SEIS consultas. Con 150 candidatos —que en una planta de
       400 equipos es un número normal— son NOVECIENTAS consultas, y además
       EN FILA: cada una espera a que termine la anterior. A 5 ms de ida y
       vuelta contra Railway eso son cuatro segundos y medio de pantalla en
       blanco, y esta consulta se dispara al abrir «Avance del mapeo».

       NO SE CAMBIA EL CÁLCULO, NI UN RESULTADO. Las consultas siguen siendo
       las mismas: lo único que cambia es que van de cinco en cinco en vez de
       una detrás de otra. El orden de entrada se conserva —se escribe en la
       posición que le toca, no con un `push`— porque el `sort` de abajo es
       estable y un empate resuelto al revés cambiaría la primera fila.

       CINCO Y NO CINCUENTA: el pool de conexiones de Prisma es limitado y esta
       consulta no es la única del servidor. Cinco reparte bien sin dejar a las
       demás peticiones esperando conexión. Sigue siendo la consulta más cara
       del proyecto: la forma correcta de arreglarla del todo es calcular la
       reincidencia con agregados en vez de activo por activo, y eso es un
       bloque propio. Esto quita el 80 % del dolor sin arriesgar el resultado.

       ES LA MISMA LECCIÓN DEL BLOQUE 105 en el preventivo, aplicada donde
       todavía quedaba. */
    const utiles = candidatos.filter((c) => c.assetId);
    const historiales: Array<any | null> = new Array(utiles.length).fill(null);
    const A_LA_VEZ = 5;
    let siguiente = 0;
    const obrero = async () => {
      for (;;) {
        const i = siguiente++;
        if (i >= utiles.length) return;
        historiales[i] = await this.delActivo(utiles[i].assetId as string).catch(() => null);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(A_LA_VEZ, utiles.length) }, () => obrero()),
    );

    const resultado: any[] = [];
    for (const h of historiales) {
      if (!h || h.severidad === 'NINGUNA') continue;
      resultado.push({
        assetId: h.activo.id,
        assetCode: h.activo.assetCode,
        type: h.activo.type,
        ubicacion: h.activo.ubicacion,
        nombreEnGrabador: h.activo.nombreEnGrabador,
        severidad: h.severidad,
        senales: h.senales,
        ordenes: h.resumen.ordenesEnVentana,
        sinFallaEncontrada: h.resumen.sinFallaEncontrada,
      });
    }

    // Confirmadas primero, y dentro de eso las de más órdenes.
    resultado.sort((a, b) =>
      (a.severidad === b.severidad ? 0 : a.severidad === 'CONFIRMADA' ? -1 : 1)
      || b.ordenes - a.ordenes);

    return {
      ventanaDias: VENTANA_DIAS,
      total: resultado.length,
      confirmadas: resultado.filter((r) => r.severidad === 'CONFIRMADA').length,
      items: resultado,
    };
  }
}
