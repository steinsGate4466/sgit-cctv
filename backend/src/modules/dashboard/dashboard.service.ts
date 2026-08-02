import { Injectable } from '@nestjs/common';
import { AssetStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { computeEffectiveStatuses } from '../../common/asset-status';
import { resolverContextoDePlanta } from '../../common/plant-context';
import { contarPorTren } from './infra-agregados';

/**
 * Indicadores del tablero ejecutivo.
 *
 * Decisión de diseño: el frontend NO debe pedir la lista completa de activos solo para
 * contar. Eso es lento con 400+ equipos y, peor, para roles con permiso de credenciales
 * el listado descifra TODAS las contraseñas de los equipos. Por eso los conteos se
 * calculan aquí y se envían ya agregados.
 */
@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  private daysAgo(n: number): Date {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d;
  }

  async kpis() {
    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    const openWo: any = { status: { in: ['ABIERTA', 'EN_PROCESO', 'EN_ESPERA'] } };
    // Incidencias vigentes: incluye EN_ESPERA (si no, una incidencia en espera
    // desaparecía del tablero y el Jefe la perdía de vista).
    const openIncidentStatus: any = { in: ['ABIERTA', 'EN_DIAGNOSTICO', 'EN_PROCESO', 'EN_ESPERA'] };
    // FUERA DE INVENTARIO: dado de baja o guardado en almacén. No es una
    // cámara "caída"; es una cámara que no está puesta. Contarla arruinaría
    // el porcentaje de disponibilidad.
    //
    // OJO CON LA FORMA: esto es un ARRAY, no un objeto de filtro.
    // Estuvo escrito como `{ in: ['BAJA','STOCK'] }` y se usaba en
    // `status: { notIn: outOfService }`, lo que producía
    // `notIn: { in: [...] }` — un filtro dentro de otro filtro. Prisma lo
    // rechazaba y el tablero devolvía 400 en producción.
    // Compiló porque estaba anotado `: any`, que apaga exactamente la
    // comprobación que lo habría cazado. Por eso ahora va tipado de verdad.
    const fueraDeInventario: AssetStatus[] = ['BAJA', 'STOCK'];

    const [
      totalAssets, criticalAssets,
      pendingWO, overdueWO, upcomingWO, openIncidents, criticalIncidents,
      accessPending, preventiveOverdue, preventiveTotal, lowStock,
    ] = await Promise.all([
      this.prisma.asset.count({ where: { deletedAt: null } }),
      this.prisma.asset.count({ where: { deletedAt: null, criticality: 'CRITICA' } }),
      this.prisma.workOrder.count({ where: openWo }),
      this.prisma.workOrder.count({ where: { ...openWo, scheduledDate: { lt: now } } }),
      this.prisma.workOrder.count({ where: { ...openWo, scheduledDate: { gte: now, lt: in7 } } }),
      this.prisma.incident.count({ where: { status: openIncidentStatus } }),
      this.prisma.incident.count({ where: { status: openIncidentStatus, priority: { in: ['ALTA', 'CRITICA'] as any } } }),
      this.prisma.accessRequest.count({ where: { status: { in: ['SOLICITADO', 'EN_REVISION'] as any } } }),
      this.prisma.preventivePlan.count({ where: { active: true, nextDueAt: { lt: now } } }),
      this.prisma.preventivePlan.count({ where: { active: true } }),
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM spare_parts WHERE "currentStock" <= "minStock"
      `.then((r) => Number(r?.[0]?.count ?? 0)).catch(() => 0),
    ]);

    // Disponibilidad de visión con el ESTADO EFECTIVO (el mismo que ve el usuario en
    // Activos): una cámara con OM o incidencia abierta NO cuenta como operativa.
    const cameraRows = await this.prisma.asset.findMany({
      where: { deletedAt: null, type: 'CAMERA', status: { notIn: fueraDeInventario } },
      select: { id: true, status: true },
    });
    const eff = await computeEffectiveStatuses(this.prisma, cameraRows);
    const cameras = cameraRows.length;
    const camerasDown = cameraRows.filter((c) => {
      const e = eff[c.id] || c.status;
      return e === 'FUERA_SERVICIO' || e === 'CON_INCIDENCIA' || e === 'MANTENIMIENTO';
    }).length;

    const availability = cameras > 0
      ? Number((((cameras - camerasDown) / cameras) * 100).toFixed(1))
      : 100;

    // Cumplimiento del plan preventivo (indicador de gestión del Jefe).
    const preventiveCompliance = preventiveTotal > 0
      ? Number((((preventiveTotal - preventiveOverdue) / preventiveTotal) * 100).toFixed(1))
      : 100;

    return {
      totalAssets,
      cameras,
      camerasDown,
      criticalAssets,
      pendingWorkOrders: pendingWO,
      overdueWorkOrders: overdueWO,
      upcomingWorkOrders: upcomingWO,
      openIncidents,
      criticalIncidents,
      cameraAvailabilityPct: availability,
      accessRequestsPending: accessPending,
      preventiveOverdue,
      preventiveCompliancePct: preventiveCompliance,
      lowStockParts: lowStock,
    };
  }

  /**
   * Agregados para los gráficos: por tipo, por estado efectivo, por criticidad y
   * por Tren. Se calcula en el servidor para no exponer ni transferir los activos
   * completos (con sus credenciales) solo para pintar barras.
   */
  async overview() {
    const assets = await this.prisma.asset.findMany({
      where: { deletedAt: null },
      // locationId en vez de train: el tren se DERIVA del árbol. Ver la nota
      // larga en agruparPorTren, más abajo.
      select: { id: true, type: true, status: true, criticality: true, locationId: true },
    });
    const eff = await computeEffectiveStatuses(this.prisma, assets);
    const ctx = await resolverContextoDePlanta(this.prisma, assets as any);

    const count = (arr: string[]) => {
      const m: Record<string, number> = {};
      for (const k of arr) m[k] = (m[k] || 0) + 1;
      return Object.entries(m).map(([name, value]) => ({ name, value }));
    };

    return {
      byType: count(assets.map((a) => a.type)),
      byStatus: count(assets.map((a) => eff[a.id] || a.status)),
      byCriticality: count(assets.map((a) => a.criticality)),
      byTrain: await this.agruparPorTren(assets, eff, ctx),
    };
  }

  /**
   * Estado de la infraestructura POR TREN, para el gráfico del tablero.
   *
   * CAMBIO DE FUENTE DE VERDAD (esto era un bug de datos, no de código)
   * Antes agrupaba por la columna `Asset.train`, escrita a mano en el alta.
   * El avance del mapeo, la criticidad y los intervalos preventivos, en
   * cambio, ya derivaban del árbol de ubicaciones. Resultado: el mismo activo
   * podía contar en el Tren 2 en una pantalla y en "SIN_ASIGNAR" en la otra,
   * y aparecía un cuarto tren fantasma que en Laminación no existe.
   *
   * Ahora agrupa por el tren DERIVADO del árbol, igual que el resto del
   * sistema. La columna `Asset.train` se conserva en la base —no se borra
   * nada— pero ya no se lee en ningún sitio.
   *
   * Los activos que no cuelgan de ningún tren NO se disfrazan de tren: salen
   * con clave `SIN_UBICAR` y el tablero los muestra como aviso accionable
   * ("hay N activos fuera del árbol"), que es lo que realmente son.
   */
  private async agruparPorTren(
    assets: any[],
    eff: Record<string, string>,
    ctx: Record<string, any>,
  ) {
    const agregables = assets.map((a) => ({
      id: a.id,
      type: a.type,
      estado: eff[a.id] || a.status,
      criticidad: ctx[a.id]?.criticidad || a.criticality,
      trenCode: ctx[a.id]?.trenCode ?? null,
      // El gráfico del tablero ejecutivo no mide mapeo; estos tres campos son
      // obligatorios en el tipo y aquí no aportan, así que van neutros.
      fichaIncompleta: false,
      sinFoto: false,
      sinEtapa: false,
    }));

    const porTren = contarPorTren(agregables);

    // Nombre legible del tren a partir del árbol, para no rotular con el código.
    const trenes = await this.prisma.location.findMany({
      where: { type: 'TREN' },
      select: { code: true, name: true },
      orderBy: { code: 'asc' },
    });
    const nombre = new Map(trenes.map((t) => [t.code, t.name] as const));
    const orden = trenes.map((t) => t.code);

    return [...porTren.entries()]
      .map(([code, g]) => ({
        train: code ?? 'SIN_UBICAR',
        nombre: code ? nombre.get(code) || code : 'Sin ubicación en el árbol',
        total: g.total,
        camaras: g.camaras,
        operativos: g.operativos,
        enMantenimiento: g.enMantenimiento,
        conIncidencia: g.conIncidencia,
        fueraServicio: g.fueraServicio,
        camarasCaidas: g.camarasCaidas,
        criticos: g.criticos,
        disponibilidad: g.disponibilidad,
        disponibilidadCamaras: g.disponibilidadCamaras,
      }))
      // Los trenes en el orden del árbol; lo no ubicado, siempre al final.
      .sort((a, b) => {
        const ia = a.train === 'SIN_UBICAR' ? 999 : orden.indexOf(a.train);
        const ib = b.train === 'SIN_UBICAR' ? 999 : orden.indexOf(b.train);
        return ia - ib;
      });
  }

  // trainDetail() RETIRADO en 3B-2.
  //
  // Era el último consumidor de la columna Asset.train. Su sustituto es
  // InfraService.detalleTren(), que deriva el tren del árbol de ubicaciones y
  // además devuelve la infraestructura completa: gabinetes, cableado, canales
  // de grabador, avance del mapeo y accesos.
  //
  // Se comprobó que nadie lo llamaba antes de quitarlo. Con esto, NINGUNA
  // consulta del backend lee ya Asset.train, y la contradicción de las dos
  // fuentes de verdad queda cerrada de raíz, no solo tapada.

  /**
   * Causas raíz REALES de los últimos N días (campo rootCause de las incidencias
   * resueltas). Antes el tablero rotulaba "causa raíz" pero mostraba la categoría,
   * que es otra cosa: la categoría dice DÓNDE falló, la causa raíz dice POR QUÉ.
   */
  async rootCauses(days = 180) {
    const rows = await this.prisma.incident.findMany({
      where: { rootCause: { not: null }, reportedAt: { gte: this.daysAgo(days) } },
      select: { rootCause: true },
    });
    const m: Record<string, number> = {};
    for (const r of rows) {
      const k = (r.rootCause || '').trim();
      if (!k) continue;
      // Agrupa por las primeras palabras para tolerar redacciones distintas.
      const key = k.length > 60 ? k.slice(0, 60) + '…' : k;
      m[key] = (m[key] || 0) + 1;
    }
    return Object.entries(m)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }
}
