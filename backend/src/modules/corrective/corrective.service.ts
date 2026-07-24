import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// Umbral de "candidato a reemplazo": correctivos en los últimos 12 meses.
const REPLACEMENT_THRESHOLD = 3;

@Injectable()
export class CorrectiveService {
  constructor(private prisma: PrismaService) {}

  private monthsAgo(n: number): Date {
    const d = new Date();
    d.setMonth(d.getMonth() - n);
    return d;
  }

  /**
   * Historial de fallas por activo: nº de correctivos (total y últimos 12 meses),
   * nº de incidencias, última falla y bandera de candidato a reemplazo.
   * Todo con consultas agregadas indexadas (sin N+1).
   */
  async assetsHistory() {
    const since = this.monthsAgo(12);

    const [corrAll, corr12, incs] = await Promise.all([
      this.prisma.workOrder.groupBy({
        by: ['assetId'],
        where: { type: 'CORRECTIVO' },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      this.prisma.workOrder.groupBy({
        by: ['assetId'],
        where: { type: 'CORRECTIVO', createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.incident.groupBy({
        by: ['assetId'],
        _count: { _all: true },
        _max: { reportedAt: true },
      }),
    ]);

    const map = new Map<string, any>();
    const ensure = (id: string) => {
      if (!map.has(id)) {
        map.set(id, { assetId: id, correctiveTotal: 0, corrective12m: 0, incidents: 0, lastFailureAt: null });
      }
      return map.get(id);
    };

    for (const r of corrAll) {
      if (!r.assetId) continue;
      const row = ensure(r.assetId);
      row.correctiveTotal = r._count._all;
      row.lastFailureAt = r._max.createdAt;
    }
    for (const r of corr12) {
      if (!r.assetId) continue;
      ensure(r.assetId).corrective12m = r._count._all;
    }
    for (const r of incs) {
      if (!r.assetId) continue;
      const row = ensure(r.assetId);
      row.incidents = r._count._all;
      const inc = r._max.reportedAt;
      if (inc && (!row.lastFailureAt || new Date(inc) > new Date(row.lastFailureAt))) row.lastFailureAt = inc;
    }

    const ids = [...map.keys()];
    if (!ids.length) return [];
    const assets = await this.prisma.asset.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, assetCode: true, type: true, criticality: true, location: { select: { name: true } } },
    });
    const assetById = new Map(assets.map((a) => [a.id, a]));

    return [...map.values()]
      .filter((r) => assetById.has(r.assetId)) // ignora activos borrados
      .map((r) => ({
        ...r,
        asset: assetById.get(r.assetId),
        replacementCandidate: r.corrective12m >= REPLACEMENT_THRESHOLD,
      }))
      .sort((a, b) => b.corrective12m - a.corrective12m || b.correctiveTotal - a.correctiveTotal);
  }

  async summary() {
    const rows = await this.assetsHistory();
    return {
      assetsWithFailures: rows.length,
      replacementCandidates: rows.filter((r) => r.replacementCandidate).length,
      threshold: REPLACEMENT_THRESHOLD,
    };
  }
}
