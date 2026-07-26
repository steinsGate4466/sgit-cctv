import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { computeEffectiveStatuses } from '../../common/asset-status';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async kpis() {
    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    // Estados de OM "abierta" (no cerrada ni cancelada). `any` evita fricción de tipos enum.
    const openWo: any = { status: { in: ['ABIERTA', 'EN_PROCESO', 'EN_ESPERA'] } };
    // Incidencias vigentes: incluye EN_ESPERA (si no, una incidencia en espera
    // desaparecía del tablero y el Jefe la perdía de vista).
    const openIncidentStatus: any = { in: ['ABIERTA', 'EN_DIAGNOSTICO', 'EN_PROCESO', 'EN_ESPERA'] };
    // Activos fuera de operación: no deben afectar la disponibilidad de visión.
    const outOfService: any = { in: ['BAJA', 'STOCK'] };

    const [
      totalAssets, criticalAssets,
      pendingWO, overdueWO, upcomingWO, openIncidents,
      accessPending, preventiveOverdue,
    ] = await Promise.all([
      this.prisma.asset.count({ where: { deletedAt: null } }),
      this.prisma.asset.count({ where: { deletedAt: null, criticality: 'CRITICA' } }),
      this.prisma.workOrder.count({ where: openWo }),
      this.prisma.workOrder.count({ where: { ...openWo, scheduledDate: { lt: now } } }),
      this.prisma.workOrder.count({ where: { ...openWo, scheduledDate: { gte: now, lt: in7 } } }),
      this.prisma.incident.count({ where: { status: openIncidentStatus } }),
      this.prisma.accessRequest.count({ where: { status: { in: ['SOLICITADO', 'EN_REVISION'] as any } } }),
      this.prisma.preventivePlan.count({ where: { active: true, nextDueAt: { lt: now } } }),
    ]);

    // Disponibilidad de visión con el ESTADO EFECTIVO (el mismo que ve el usuario en
    // Activos): una cámara con OM o incidencia abierta NO cuenta como operativa.
    // Antes se miraba solo el campo `status`, y el tablero contradecía al módulo de Activos.
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

    return {
      totalAssets,
      cameras,
      camerasDown,
      criticalAssets,
      pendingWorkOrders: pendingWO,
      overdueWorkOrders: overdueWO,
      upcomingWorkOrders: upcomingWO,
      openIncidents,
      cameraAvailabilityPct: availability,
      // Nuevos indicadores de gestión
      accessRequestsPending: accessPending,
      preventiveOverdue,
    };
  }
}
