import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async kpis() {
    const [totalAssets, cameras, camerasDown, criticalAssets, pendingWO, openIncidents] =
      await Promise.all([
        this.prisma.asset.count({ where: { deletedAt: null } }),
        this.prisma.asset.count({ where: { deletedAt: null, type: 'CAMERA' } }),
        this.prisma.asset.count({ where: { deletedAt: null, type: 'CAMERA', status: 'FUERA_SERVICIO' } }),
        this.prisma.asset.count({ where: { deletedAt: null, criticality: 'CRITICA' } }),
        this.prisma.workOrder.count({ where: { status: { in: ['ABIERTA', 'EN_PROCESO', 'EN_ESPERA'] } } }),
        this.prisma.incident.count({ where: { status: { in: ['ABIERTA', 'EN_DIAGNOSTICO', 'EN_PROCESO'] } } }),
      ]);

    const availability = cameras > 0 ? Number((((cameras - camerasDown) / cameras) * 100).toFixed(1)) : 100;

    return {
      totalAssets,
      cameras,
      camerasDown,
      criticalAssets,
      pendingWorkOrders: pendingWO,
      openIncidents,
      cameraAvailabilityPct: availability,
    };
  }
}
