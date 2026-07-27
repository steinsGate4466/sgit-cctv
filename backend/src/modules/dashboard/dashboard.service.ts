import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { computeEffectiveStatuses } from '../../common/asset-status';

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
    const outOfService: any = { in: ['BAJA', 'STOCK'] };

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
      where: { deletedAt: null, type: 'CAMERA', status: { notIn: outOfService } },
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
      select: { id: true, type: true, status: true, criticality: true, train: true },
    });
    const eff = await computeEffectiveStatuses(this.prisma, assets);

    const count = (arr: string[]) => {
      const m: Record<string, number> = {};
      for (const k of arr) m[k] = (m[k] || 0) + 1;
      return Object.entries(m).map(([name, value]) => ({ name, value }));
    };

    return {
      byType: count(assets.map((a) => a.type)),
      byStatus: count(assets.map((a) => eff[a.id] || a.status)),
      byCriticality: count(assets.map((a) => a.criticality)),
      byTrain: this.agruparPorTren(assets, eff),
    };
  }

  /**
   * Estado de la infraestructura POR TREN. Es la vista que le importa a Producción:
   * "¿cómo está la visión del Tren 2 ahora mismo?".
   * Usa el campo `train` del activo (dato explícito), no el texto de la ubicación.
   */
  private agruparPorTren(assets: any[], eff: Record<string, string>) {
    const ORDEN = ['TREN_1', 'TREN_2', 'TREN_3', 'PATIO', 'PLANTA_GENERAL', 'SIN_ASIGNAR'];
    const acc: Record<string, any> = {};

    for (const a of assets) {
      const t = a.train || 'SIN_ASIGNAR';
      if (!acc[t]) {
        acc[t] = {
          train: t, total: 0, camaras: 0,
          operativos: 0, enMantenimiento: 0, conIncidencia: 0, fueraServicio: 0,
          camarasCaidas: 0, criticos: 0,
        };
      }
      const g = acc[t];
      g.total++;
      if (a.type === 'CAMERA') g.camaras++;
      if (a.criticality === 'CRITICA') g.criticos++;

      const e = eff[a.id] || a.status;
      if (e === 'OPERATIVO') g.operativos++;
      else if (e === 'MANTENIMIENTO') g.enMantenimiento++;
      else if (e === 'CON_INCIDENCIA') g.conIncidencia++;
      else if (e === 'FUERA_SERVICIO') g.fueraServicio++;

      if (a.type === 'CAMERA' && (e === 'FUERA_SERVICIO' || e === 'CON_INCIDENCIA')) g.camarasCaidas++;
    }

    return Object.values(acc)
      .map((g: any) => {
        // Base de cálculo: activos en operación (excluye baja y stock).
        const enOperacion = g.operativos + g.enMantenimiento + g.conIncidencia + g.fueraServicio;
        const afectados = g.conIncidencia + g.fueraServicio;
        return {
          ...g,
          disponibilidad: enOperacion > 0
            ? Number((((enOperacion - afectados) / enOperacion) * 100).toFixed(1))
            : 100,
          disponibilidadCamaras: g.camaras > 0
            ? Number((((g.camaras - g.camarasCaidas) / g.camaras) * 100).toFixed(1))
            : 100,
        };
      })
      .sort((a: any, b: any) => ORDEN.indexOf(a.train) - ORDEN.indexOf(b.train));
  }

  /** Detalle de un tren: sus activos con problemas y sus trabajos pendientes. */
  async trainDetail(train: string) {
    const where: any = train === 'SIN_ASIGNAR'
      ? { deletedAt: null, train: null }
      : { deletedAt: null, train: train as any };

    const assets = await this.prisma.asset.findMany({
      where,
      select: {
        id: true, assetCode: true, type: true, status: true, criticality: true,
        location: { select: { name: true } }, cabinet: { select: { code: true } },
      },
      orderBy: { assetCode: 'asc' },
    });
    const eff = await computeEffectiveStatuses(this.prisma, assets);
    const ids = assets.map((a) => a.id);

    const [oms, incs] = await Promise.all([
      ids.length ? this.prisma.workOrder.count({
        where: { assetId: { in: ids }, status: { in: ['ABIERTA', 'EN_PROCESO', 'EN_ESPERA'] as any } },
      }) : 0,
      ids.length ? this.prisma.incident.count({
        where: { assetId: { in: ids }, status: { in: ['ABIERTA', 'EN_DIAGNOSTICO', 'EN_PROCESO', 'EN_ESPERA'] as any } },
      }) : 0,
    ]);

    return {
      train,
      omAbiertas: oms,
      incidenciasAbiertas: incs,
      // Solo los que requieren atención: es lo que se necesita ver en el tablero.
      activos: assets
        .map((a) => ({ ...a, effectiveStatus: eff[a.id] || a.status }))
        .filter((a) => a.effectiveStatus !== 'OPERATIVO'),
      totalActivos: assets.length,
    };
  }

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
