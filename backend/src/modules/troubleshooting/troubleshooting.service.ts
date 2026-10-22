import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SOLO_FALLAS } from '../../common/aviso-sap';

@Injectable()
export class TroubleshootingService {
  constructor(private prisma: PrismaService) {}

  // Métricas de resolución de problemas (MTTR, tiempo sin visión, patrones por causa)
  async metrics() {
    const resolved = await this.prisma.incident.findMany({
      // Bloque 180: el MTTR es de FALLAS: lo que funcionaba no se «restituye».
      where: { status: { in: ['RESUELTA', 'CERRADA'] }, mttrMinutes: { not: null }, AND: [SOLO_FALLAS] },
      select: { mttrMinutes: true, visionDownMin: true, category: true },
    });

    const count = resolved.length;
    const avg = (arr: number[]) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0);
    const mttr = avg(resolved.map((r) => r.mttrMinutes ?? 0));
    const visionDown = avg(resolved.map((r) => r.visionDownMin ?? 0));

    // Reincidencia por causa raíz (patrones: saturación NVR, caída PMP, etc.)
    const byCategory = await this.prisma.incident.groupBy({
      by: ['category'],
      where: { AND: [SOLO_FALLAS] },
      _count: { _all: true },
      orderBy: { _count: { category: 'desc' } },
    });

    return {
      resolvedIncidents: count,
      mttrMinutes: mttr,
      avgVisionDownMinutes: visionDown,
      incidentsByRootCause: byCategory.map((c) => ({ category: c.category, count: c._count._all })),
    };
  }
}
