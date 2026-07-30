import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { evaluarReincidencia, severidadGlobal, VENTANA_DIAS } from '../../common/reincidencia';
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

    const resultado: any[] = [];
    for (const c of candidatos) {
      if (!c.assetId) continue;
      const h = await this.delActivo(c.assetId).catch(() => null);
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
