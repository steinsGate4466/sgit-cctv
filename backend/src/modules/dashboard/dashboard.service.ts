import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async kpis() {
    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    // Estados de OM "abierta" (no cerrada ni cancelada). `any` evita fricción de tipos enum.
    const openWo: any = { status: { in: ['ABIERTA', 'EN_PROCESO', 'EN_ESPERA'] } };

    const [
      totalAssets, cameras, camerasDown, criticalAssets,
      pendingWO, overdueWO, upcomingWO, openIncidents,
    ] = await Promise.all([
      this.prisma.asset.count({ where: { deletedAt: null } }),
      this.prisma.asset.count({ where: { deletedAt: null, type: 'CAMERA' } }),
      this.prisma.asset.count({ where: { deletedAt: null, type: 'CAMERA', status: 'FUERA_SERVICIO' } }),
      this.prisma.asset.count({ where: { deletedAt: null, criticality: 'CRITICA' } }),
      this.prisma.workOrder.count({ where: openWo }),
      this.prisma.workOrder.count({ where: { ...openWo, scheduledDate: { lt: now } } }),
      this.prisma.workOrder.count({ where: { ...openWo, scheduledDate: { gte: now, lt: in7 } } }),
      this.prisma.incident.count({ where: { status: { in: ['ABIERTA', 'EN_DIAGNOSTICO', 'EN_PROCESO'] } } }),
    ]);

    const availability = cameras > 0 ? Number((((cameras - camerasDown) / cameras) * 100).toFixed(1)) : 100;

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
    };
  }
}
