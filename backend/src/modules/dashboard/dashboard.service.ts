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
      select: {
        id: true, type: true, status: true, criticality: true,
        location: { select: { name: true, path: true } },
      },
    });
    const eff = await computeEffectiveStatuses(this.prisma, assets);

    const count = (arr: string[]) => {
      const m: Record<string, number> = {};
      for (const k of arr) m[k] = (m[k] || 0) + 1;
      return Object.entries(m).map(([name, value]) => ({ name, value }));
    };

    // Tren al que pertenece el activo (se deduce de la ruta de la ubicación: AASA/PISCO/T1).
    const trenDe = (path?: string | null): string => {
      if (!path) return 'Sin asignar';
      const m = path.match(/\/T(\d+)/i);
      return m ? `Tren ${m[1]}` : 'Otras zonas';
    };

    const byTrain: Record<string, { total: number; caidos: number; camaras: number }> = {};
    for (const a of assets) {
      const t = trenDe(a.location?.path);
      if (!byTrain[t]) byTrain[t] = { total: 0, caidos: 0, camaras: 0 };
      byTrain[t].total++;
      if (a.type === 'CAMERA') byTrain[t].camaras++;
      const e = eff[a.id] || a.status;
      if (e === 'FUERA_SERVICIO' || e === 'CON_INCIDENCIA') byTrain[t].caidos++;
    }

    return {
      byType: count(assets.map((a) => a.type)),
      byStatus: count(assets.map((a) => eff[a.id] || a.status)),
      byCriticality: count(assets.map((a) => a.criticality)),
      byTrain: Object.entries(byTrain).map(([tren, v]) => ({
        tren,
        total: v.total,
        camaras: v.camaras,
        caidos: v.caidos,
        disponibilidad: v.total > 0 ? Number((((v.total - v.caidos) / v.total) * 100).toFixed(1)) : 100,
      })).sort((a, b) => a.tren.localeCompare(b.tren)),
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
