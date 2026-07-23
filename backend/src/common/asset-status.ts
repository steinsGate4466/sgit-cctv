// =============================================================================
//  Estado operativo DERIVADO de un activo (F5)
//  Una sola fuente de verdad: el estado que ve el ingeniero se CALCULA en vivo
//  a partir de las incidencias y órdenes de mantenimiento abiertas del activo.
//  Así es imposible que una OM/incidencia diga "error" y el activo siga "operativo".
//
//  Regla de precedencia (de mayor a menor severidad operativa):
//    1) BAJA / STOCK           -> estado administrativo, se respeta tal cual.
//    2) OM activa              -> MANTENIMIENTO.
//    3) Incidencia ALTA/CRÍTICA-> FUERA_SERVICIO.
//    4) Incidencia (cualquiera)-> CON_INCIDENCIA (degradado).
//    5) sin nada abierto       -> el estado base del activo (OPERATIVO, etc.).
//
//  Rendimiento: 2 consultas agregadas por lote (no N+1), apoyadas en los índices
//  work_orders(assetId,status) e incidents(assetId,status,priority).
// =============================================================================
import { PrismaService } from '../prisma/prisma.service';

export type EffectiveStatus =
  | 'OPERATIVO'
  | 'MANTENIMIENTO'
  | 'FUERA_SERVICIO'
  | 'CON_INCIDENCIA'
  | 'BAJA'
  | 'STOCK';

// Estados que cuentan como "abierto / en curso".
const ACTIVE_WO_STATUS = ['ABIERTA', 'EN_PROCESO', 'EN_ESPERA'];
const OPEN_INCIDENT_STATUS = ['ABIERTA', 'EN_DIAGNOSTICO', 'EN_PROCESO'];
const HIGH_PRIORITY = ['ALTA', 'CRITICA'];

interface AssetLike {
  id: string;
  status?: string | null;
}

/**
 * Devuelve un mapa assetId -> estado efectivo, calculado en lote.
 */
export async function computeEffectiveStatuses(
  prisma: PrismaService,
  assets: AssetLike[],
): Promise<Record<string, EffectiveStatus>> {
  const result: Record<string, EffectiveStatus> = {};
  const ids = assets.map((a) => a.id).filter(Boolean);
  if (!ids.length) return result;

  // Activos con al menos una OM activa.
  const activeWo = await prisma.workOrder.findMany({
    where: { assetId: { in: ids }, status: { in: ACTIVE_WO_STATUS as any } },
    select: { assetId: true },
    distinct: ['assetId'],
  });
  const woSet = new Set(activeWo.map((w) => w.assetId));

  // Incidencias abiertas y su prioridad (para distinguir crítico de degradado).
  const openInc = await prisma.incident.findMany({
    where: { assetId: { in: ids }, status: { in: OPEN_INCIDENT_STATUS as any } },
    select: { assetId: true, priority: true },
  });
  const incPriority = new Map<string, Set<string>>();
  for (const i of openInc) {
    if (!i.assetId) continue;
    if (!incPriority.has(i.assetId)) incPriority.set(i.assetId, new Set());
    incPriority.get(i.assetId)!.add(i.priority);
  }

  for (const a of assets) {
    const base = (a.status || 'OPERATIVO') as EffectiveStatus;
    // 1) Estado administrativo manda.
    if (base === 'BAJA' || base === 'STOCK') {
      result[a.id] = base;
      continue;
    }
    // 2) OM activa.
    if (woSet.has(a.id)) {
      result[a.id] = 'MANTENIMIENTO';
      continue;
    }
    // 3/4) Incidencia abierta.
    const prios = incPriority.get(a.id);
    if (prios && prios.size) {
      const critical = HIGH_PRIORITY.some((p) => prios.has(p));
      result[a.id] = critical ? 'FUERA_SERVICIO' : 'CON_INCIDENCIA';
      continue;
    }
    // 5) Sin nada abierto: se respeta el estado base (operativo o el que fijó el técnico).
    result[a.id] = base;
  }
  return result;
}

/** Versión de conveniencia para un solo activo. */
export async function computeEffectiveStatus(
  prisma: PrismaService,
  asset: AssetLike,
): Promise<EffectiveStatus> {
  const map = await computeEffectiveStatuses(prisma, [asset]);
  return map[asset.id] || ((asset.status as EffectiveStatus) || 'OPERATIVO');
}
