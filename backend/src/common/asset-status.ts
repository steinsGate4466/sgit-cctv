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
import type { IncidentStatus, WorkOrderStatus } from '../generated/prisma/client';
import { cuentaComoFalla } from './aviso-sap';

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
/* Bloque 174 · las mismas listas, tipadas, para FILTRAR por estado real en la
   lista de Activos («sin servicio»). Una sola fuente: si cambian aquí, el
   filtro y el estado que pinta la ficha cambian juntos. */
export const WO_EN_CURSO = ACTIVE_WO_STATUS as WorkOrderStatus[];
export const INCIDENCIA_ABIERTA = OPEN_INCIDENT_STATUS as IncidentStatus[];
const HIGH_PRIORITY = ['ALTA', 'CRITICA'];

/* BLOQUE 180 · EL ESTADO DICE SI FUNCIONA, Y ESO SÓLO LO CAMBIA UNA FALLA.
   -----------------------------------------------------------------------------
   Un aviso de CONDICIÓN —«funciona, pero se va a dañar»— o una SOLICITUD no
   quitan servicio: el equipo sigue OPERATIVO. Si contaran, «Mis cámaras», el
   mapa y «Estado por tren» darían por ciega una cámara que el púlpito está
   viendo, y la lista de caídas dejaría de creerse. El aviso sigue a la vista
   donde se trabaja: en Incidencias, en la bandeja y en la ficha del equipo.
   Una sola regla para el estado y para su motivo: si fueran dos, el badge y la
   frase de al lado acabarían contradiciéndose. */
export function pesaComoCaida(x: { priority: string; tipoAviso?: string | null }): boolean {
  return HIGH_PRIORITY.includes(x.priority) && cuentaComoFalla(x.tipoAviso);
}

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
    select: { assetId: true, priority: true, tipoAviso: true },
  });
  const avisosPorActivo = new Map<string, Array<{ priority: string; tipoAviso?: string | null }>>();
  for (const i of openInc) {
    if (!i.assetId || !cuentaComoFalla(i.tipoAviso)) continue;
    if (!avisosPorActivo.has(i.assetId)) avisosPorActivo.set(i.assetId, []);
    avisosPorActivo.get(i.assetId)!.push(i);
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
    const avisos = avisosPorActivo.get(a.id);
    if (avisos && avisos.length) {
      const critical = avisos.some(pesaComoCaida);
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

/* =============================================================================
   POR QUÉ ESTÁ ASÍ — bloque 83
   -----------------------------------------------------------------------------
   EL PROBLEMA, y lo reportó el usuario como un bug:

       «eso del estado es grave, ¿cómo se puede actualizar?, ¿cómo es que
        funciona esa lógica si aquí se supone que se actualizó?»

   Y NO era un bug: el estado se DERIVA, y una orden abierta lo fija en
   MANTENIMIENTO por diseño. El activo se puede haber reparado, pero mientras
   la orden siga abierta el sistema dice —con razón— que hay trabajo en curso.

   El fallo era otro, y es el de siempre en este proyecto:

   > **Un cálculo correcto que no se explica es indistinguible de un fallo.**

   El técnico ponía el activo en OPERATIVO, recargaba, seguía viendo «En
   mantenimiento» y no había NADA en pantalla que dijera por qué. Con eso, la
   conclusión razonable es que el software no guarda.

   Así que no se cambia el cálculo: se DICE quién lo retiene, con su código,
   para poder ir a esa orden y cerrarla. La misma regla del mapa de red, del
   módulo de documentos y del aviso del QR — *sin pantalla, no existe*, aquí en
   su versión más barata: sin explicación, parece roto.
============================================================================= */
export interface MotivoDelEstado {
  /** Qué lo retiene. `null` cuando el estado es el base del activo. */
  tipo: 'ORDEN' | 'INCIDENCIA' | null;
  /** Identificador, para poder enlazar a la ficha desde el frontend. */
  id: string | null;
  /** Código legible: `OM-42`, `INC-17`. Es lo que se pinta. */
  codigo: string | null;
  /** Frase corta y completa, ya redactada. El frontend no compone texto. */
  texto: string;
}

/**
 * Devuelve, por activo, QUÉ le está fijando el estado efectivo.
 *
 * Se resuelve con el MISMO orden de precedencia que `computeEffectiveStatuses`
 * y no con uno propio: dos criterios paralelos acabarían discrepando, y una
 * pantalla que enseña un estado y a su lado un motivo que no le corresponde es
 * peor que no enseñar el motivo.
 */
export async function motivosDelEstado(
  prisma: PrismaService,
  assets: AssetLike[],
): Promise<Record<string, MotivoDelEstado>> {
  const result: Record<string, MotivoDelEstado> = {};
  const ids = assets.map((a) => a.id).filter(Boolean);
  if (!ids.length) return result;

  /* La MÁS ANTIGUA, no la más reciente. Si un equipo arrastra dos órdenes
     abiertas, la que lleva más tiempo es la que hay que cerrar: la vieja es la
     que está falseando el estado desde hace semanas. */
  const ordenes = await prisma.workOrder.findMany({
    where: { assetId: { in: ids }, status: { in: ACTIVE_WO_STATUS as any } },
    select: { id: true, assetId: true, code: true, status: true, activity: true },
    orderBy: { createdAt: 'asc' },
  });
  const porOrden = new Map<string, (typeof ordenes)[number]>();
  for (const o of ordenes) {
    if (o.assetId && !porOrden.has(o.assetId)) porOrden.set(o.assetId, o);
  }

  const incidencias = await prisma.incident.findMany({
    where: { assetId: { in: ids }, status: { in: OPEN_INCIDENT_STATUS as any } },
    select: { id: true, assetId: true, code: true, priority: true, tipoAviso: true },
    /* `reportedAt`, NO `createdAt`: `Incident` no tiene ese campo. Lo cazó el
       typecheck, y es el mismo tropiezo del `name` del bloque 6 y del
       `environment` del 16.2 — dar por hecho que un modelo tiene un campo
       porque el de al lado lo tiene. */
    orderBy: { reportedAt: 'asc' },
  });
  const porIncidencia = new Map<string, (typeof incidencias)[number]>();
  for (const i of incidencias) {
    if (!i.assetId || !cuentaComoFalla(i.tipoAviso)) continue;
    const previa = porIncidencia.get(i.assetId);
    /* Gana la de MAYOR prioridad; a igualdad, la más antigua (ya vienen
       ordenadas). Si se quedara la primera a secas, un equipo con una avería
       crítica y una menor anterior explicaría su FUERA_SERVICIO citando la
       menor — y el motivo diría lo contrario que el estado. */
    if (!previa || (pesaComoCaida(i) && !pesaComoCaida(previa))) {
      porIncidencia.set(i.assetId, i);
    }
  }

  for (const a of assets) {
    const base = (a.status || 'OPERATIVO') as EffectiveStatus;
    if (base === 'BAJA' || base === 'STOCK') {
      result[a.id] = {
        tipo: null,
        id: null,
        codigo: null,
        texto: base === 'BAJA'
          ? 'Dado de baja. El estado administrativo manda sobre todo lo demás.'
          : 'En almacén, sin instalar.',
      };
      continue;
    }

    const om = porOrden.get(a.id);
    if (om) {
      result[a.id] = {
        tipo: 'ORDEN',
        id: om.id,
        codigo: om.code,
        /* Se dice QUÉ HACER, no sólo qué pasa. «Hay una orden abierta» deja al
           usuario en el mismo sitio; «se pondrá operativo solo al cerrarla» le
           dice dónde ir y qué esperar después. */
        texto: `Lo retiene la orden ${om.code}`
          + (om.activity ? ` (${om.activity})` : '')
          + `, en estado ${om.status.toLowerCase().replace(/_/g, ' ')}. `
          + 'El equipo volverá a OPERATIVO solo cuando esa orden se cierre.',
      };
      continue;
    }

    const inc = porIncidencia.get(a.id);
    if (inc) {
      const grave = pesaComoCaida(inc);
      result[a.id] = {
        tipo: 'INCIDENCIA',
        id: inc.id,
        codigo: inc.code,
        texto: `Lo retiene la incidencia ${inc.code}, de prioridad `
          + `${inc.priority.toLowerCase()}. `
          + (grave
            ? 'Por eso figura fuera de servicio. Se resuelve cerrando la incidencia o abriendo la orden que la atienda.'
            : 'Sigue dando imagen, pero con un problema declarado sin resolver.'),
      };
      continue;
    }

    result[a.id] = {
      tipo: null,
      id: null,
      codigo: null,
      texto: 'Nada abierto lo retiene: este es el estado que tiene guardado el equipo.',
    };
  }
  return result;
}

/** Versión de conveniencia para un solo activo. */
export async function motivoDelEstado(
  prisma: PrismaService,
  asset: AssetLike,
): Promise<MotivoDelEstado> {
  const map = await motivosDelEstado(prisma, [asset]);
  return map[asset.id] || { tipo: null, id: null, codigo: null, texto: '' };
}
