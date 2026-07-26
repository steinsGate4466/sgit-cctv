import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * MANTENIMIENTO PREDICTIVO — alerta temprana basada en CONDICIÓN (curva P-F).
 *
 * Fundamento: entre que una falla se vuelve detectable (punto P) y que se vuelve
 * funcional/real (punto F) hay una ventana. El predictivo busca detectar en P e
 * intervenir ANTES de F. En una red CCTV de planta siderúrgica, las señales que
 * anticipan la falla son:
 *
 *   1. El técnico marcó "Cambiar" en el checklist de condición   → desgaste declarado
 *   2. El técnico marcó "Observado"                              → degradación incipiente
 *   3. Correctivos repetidos                                     → el activo ya está en su ventana P-F
 *   4. Incidencias de alta prioridad recientes                   → inestabilidad
 *   5. Preventivo vencido hace mucho                             → degradación esperada (polvo/calor del horno)
 *   6. Enlace inalámbrico inestable                              → anticipa saturación de sesiones del NVR
 *
 * IMPORTANTE: este predictivo es POR REGLAS sobre datos ya registrados. Cuando se
 * integre el monitoreo en vivo (HikCentral/Zabbix), estas mismas reglas se alimentarán
 * de telemetría real (señal dBm, disco, ping) sin cambiar la estructura.
 *
 * El predictivo NO genera OM automáticamente: propone, y la persona decide.
 */

const DIAS_CONDICION = 120;   // ventana para leer checklists de condición
const DIAS_CORRECTIVO = 180;  // ventana para contar correctivos
const DIAS_INCIDENCIA = 90;   // ventana para incidencias de alta prioridad

export interface RiskSignal {
  senal: string;
  detalle: string;
  peso: number;
}

@Injectable()
export class PredictiveService {
  constructor(private prisma: PrismaService) {}

  private daysAgo(n: number): Date {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d;
  }

  /**
   * Calcula el índice de riesgo (0-100) de cada activo y las señales que lo explican.
   * Consultas agregadas en lote (sin N+1).
   */
  async riskAssets() {
    const [condWos, correctivos, incidencias, planes, wireless] = await Promise.all([
      // 1-2) Checklists de condición recientes
      this.prisma.workOrder.findMany({
        where: { condition: { not: null as any }, createdAt: { gte: this.daysAgo(DIAS_CONDICION) } },
        select: { assetId: true, condition: true, code: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      // 3) Correctivos por activo
      this.prisma.workOrder.groupBy({
        by: ['assetId'],
        where: { type: 'CORRECTIVO', createdAt: { gte: this.daysAgo(DIAS_CORRECTIVO) } },
        _count: { _all: true },
      }),
      // 4) Incidencias de alta prioridad
      this.prisma.incident.groupBy({
        by: ['assetId'],
        where: { priority: { in: ['ALTA', 'CRITICA'] as any }, reportedAt: { gte: this.daysAgo(DIAS_INCIDENCIA) } },
        _count: { _all: true },
      }),
      // 5) Preventivos vencidos
      this.prisma.preventivePlan.findMany({
        where: { active: true, nextDueAt: { lt: new Date() } },
        select: { assetId: true, nextDueAt: true, intervalDays: true },
      }),
      // 6) Enlaces inalámbricos inestables
      this.prisma.assetWireless.findMany({
        where: { linkStable: false },
        select: { assetId: true, signalDbm: true },
      }),
    ]);

    const signals = new Map<string, RiskSignal[]>();
    const push = (assetId: string | null, s: RiskSignal) => {
      if (!assetId) return;
      if (!signals.has(assetId)) signals.set(assetId, []);
      signals.get(assetId)!.push(s);
    };

    // 1-2) Condición declarada por el técnico (la señal más valiosa: es inspección directa)
    const yaContado = new Set<string>();
    for (const wo of condWos) {
      if (!wo.assetId) continue;
      const cond: any = wo.condition;
      if (!cond || typeof cond !== 'object') continue;
      const cambiar = Object.entries(cond).filter(([, v]) => v === 'Cambiar').map(([k]) => k);
      const observado = Object.entries(cond).filter(([, v]) => v === 'Observado').map(([k]) => k);
      // Solo la revisión más reciente por activo (las anteriores ya no reflejan su estado).
      if (yaContado.has(wo.assetId)) continue;
      yaContado.add(wo.assetId);
      if (cambiar.length) {
        push(wo.assetId, {
          senal: 'Componente marcado para CAMBIO',
          detalle: `${cambiar.join(', ')} (revisión ${wo.code})`,
          peso: 35 + Math.min(15, (cambiar.length - 1) * 5),
        });
      }
      if (observado.length) {
        push(wo.assetId, {
          senal: 'Componente OBSERVADO',
          detalle: `${observado.join(', ')} (revisión ${wo.code})`,
          peso: 15 + Math.min(10, (observado.length - 1) * 3),
        });
      }
    }

    // 3) Recurrencia de correctivos
    for (const c of correctivos) {
      if (!c.assetId) continue;
      const n = c._count._all;
      if (n >= 2) {
        push(c.assetId, {
          senal: 'Fallas recurrentes',
          detalle: `${n} correctivos en los últimos ${DIAS_CORRECTIVO / 30 | 0} meses`,
          peso: n >= 3 ? 30 : 18,
        });
      }
    }

    // 4) Incidencias de alta prioridad
    for (const i of incidencias) {
      if (!i.assetId) continue;
      const n = i._count._all;
      push(i.assetId, {
        senal: 'Incidencias de alta prioridad',
        detalle: `${n} incidencia(s) ALTA/CRÍTICA en ${DIAS_INCIDENCIA} días`,
        peso: Math.min(25, 12 + (n - 1) * 6),
      });
    }

    // 5) Preventivo vencido (a más atraso, más degradación probable)
    for (const p of planes) {
      if (!p.nextDueAt) continue;
      const dias = Math.floor((Date.now() - new Date(p.nextDueAt).getTime()) / 86400000);
      if (dias >= 15) {
        push(p.assetId, {
          senal: 'Preventivo vencido',
          detalle: `${dias} días de atraso (frecuencia cada ${p.intervalDays} días)`,
          peso: dias >= 60 ? 22 : dias >= 30 ? 15 : 8,
        });
      }
    }

    // 6) Enlace inalámbrico inestable (anticipa la saturación de sesiones del NVR)
    for (const w of wireless) {
      push(w.assetId, {
        senal: 'Enlace inalámbrico inestable',
        detalle: w.signalDbm != null ? `Señal ${w.signalDbm} dBm` : 'Cortes intermitentes registrados',
        peso: 28,
      });
    }

    const ids = [...signals.keys()];
    if (!ids.length) return [];

    const assets = await this.prisma.asset.findMany({
      where: { id: { in: ids }, deletedAt: null, status: { notIn: ['BAJA', 'STOCK'] as any } },
      select: {
        id: true, assetCode: true, type: true, criticality: true,
        location: { select: { name: true } },
        cabinet: { select: { code: true } },
      },
    });

    return assets
      .map((a) => {
        const ss = signals.get(a.id) || [];
        let score = Math.min(100, ss.reduce((sum, s) => sum + s.peso, 0));
        // La criticidad del activo agrava el riesgo: no es lo mismo una cámara de
        // pasillo que la del horno.
        if (a.criticality === 'CRITICA') score = Math.min(100, Math.round(score * 1.25));
        else if (a.criticality === 'ALTA') score = Math.min(100, Math.round(score * 1.1));

        const nivel = score >= 70 ? 'CRITICO' : score >= 45 ? 'ALTO' : score >= 25 ? 'MEDIO' : 'BAJO';
        return {
          asset: a,
          score,
          nivel,
          signals: ss.sort((x, y) => y.peso - x.peso),
          recomendacion: this.recomendar(nivel, ss),
        };
      })
      .filter((r) => r.score >= 25) // por debajo de 25 no amerita alerta
      .sort((x, y) => y.score - x.score);
  }

  private recomendar(nivel: string, ss: RiskSignal[]): string {
    const tieneCambio = ss.some((s) => s.senal.includes('CAMBIO'));
    const tieneRecurrencia = ss.some((s) => s.senal.includes('recurrentes'));
    const tieneEnlace = ss.some((s) => s.senal.includes('inalámbrico'));
    if (nivel === 'CRITICO') {
      if (tieneCambio) return 'Programar reemplazo del componente antes de que falle. Verificar stock del repuesto.';
      if (tieneEnlace) return 'Intervenir el radioenlace (alineación/reemplazo) para evitar la saturación de sesiones del NVR.';
      return 'Intervención prioritaria: adelantar la OM y revisar en sitio.';
    }
    if (nivel === 'ALTO') {
      if (tieneRecurrencia) return 'Analizar causa raíz: el activo falla de forma repetida; evaluar reemplazo.';
      return 'Adelantar el mantenimiento preventivo y revisar los puntos observados.';
    }
    return 'Vigilar en la próxima ronda preventiva.';
  }

  async summary() {
    const rows = await this.riskAssets();
    return {
      total: rows.length,
      criticos: rows.filter((r) => r.nivel === 'CRITICO').length,
      altos: rows.filter((r) => r.nivel === 'ALTO').length,
      medios: rows.filter((r) => r.nivel === 'MEDIO').length,
      ventanas: { condicionDias: DIAS_CONDICION, correctivoDias: DIAS_CORRECTIVO, incidenciaDias: DIAS_INCIDENCIA },
    };
  }
}
