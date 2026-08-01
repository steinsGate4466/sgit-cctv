// ============================================================================
//  ASIGNAR Y DETALLAR — lógica pura.
//
//  EL MODELO DE TRABAJO
//  El ingeniero ASIGNA: qué hay que hacer, sobre qué, a quién y para cuándo.
//  Cuatro cosas. No sabe cuál cámara exactamente, ni qué tramo, ni qué
//  materiales; obligarle a rellenarlo le hace inventar datos que después
//  alguien corrige.
//
//  El técnico de red DETALLA: equipo exacto, materiales, herramientas y
//  duración. Es quien tiene el contexto y quien firma.
// ============================================================================

export type Criticidad = 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA';

/**
 * Plazo por defecto, en días, según la criticidad del equipo.
 *
 * POR QUÉ EXISTE
 * Si la asignación no lleva fecha, el indicador de "vencidas" deja de
 * funcionar y las órdenes sin plazo se quedan ahí para siempre sin que nadie
 * las eche de menos. Antes que pedirle una fecha más al ingeniero, se deduce
 * de algo que el sistema YA sabe: la criticidad, que se deriva de la etapa del
 * proceso donde está el equipo.
 *
 * ESTOS NÚMEROS SON UN PUNTO DE PARTIDA, NO UNA VERDAD. Salen de la lógica de
 * que una cámara ciega en el tren de desbaste no puede esperar dos semanas y
 * una del almacén sí. Si en planta se manejan otros plazos, se cambian aquí y
 * más adelante deberían ser editables como los demás catálogos.
 */
export const PLAZO_POR_CRITICIDAD: Record<Criticidad, number> = {
  CRITICA: 2,
  ALTA: 5,
  MEDIA: 10,
  BAJA: 20,
};

export const PLAZO_POR_DEFECTO = 10;

export function diasDePlazo(criticidad?: string | null): number {
  if (!criticidad) return PLAZO_POR_DEFECTO;
  return PLAZO_POR_CRITICIDAD[criticidad as Criticidad] ?? PLAZO_POR_DEFECTO;
}

/**
 * Fecha límite a partir de la criticidad.
 * `desde` se pasa a propósito en vez de usar el reloj: así se puede probar.
 */
export function fechaLimite(criticidad: string | null | undefined, desde: Date): Date {
  const d = new Date(desde);
  d.setDate(d.getDate() + diasDePlazo(criticidad));
  // Al final del día: una orden con plazo "hoy" no está vencida a las 9 de la
  // mañana. Si no, el tablero mentiría durante toda la jornada.
  d.setHours(23, 59, 59, 999);
  return d;
}

export interface EstadoDetalle {
  detallada: boolean;
  /** Lo que falta para poder trabajar con ella. */
  faltan: string[];
  /** true si el técnico cambió el equipo respecto a lo asignado. */
  alcanceCambiado: boolean;
}

/**
 * Qué le falta a una orden para estar detallada.
 *
 * NO se exige todo: los materiales pueden no hacer falta (una revisión no
 * consume nada) y la duración es una estimación. Lo que sí es obligatorio es
 * saber SOBRE QUÉ se trabaja: una orden sin equipo ni ubicación no se puede
 * ejecutar ni medir.
 */
export function estadoDetalle(wo: {
  detailedAt?: Date | string | null;
  assetId?: string | null;
  locationId?: string | null;
  activity?: string | null;
  assignedAssetId?: string | null;
}): EstadoDetalle {
  const faltan: string[] = [];
  if (!wo.assetId && !wo.locationId) faltan.push('el equipo o la ubicación');
  if (!wo.activity || !wo.activity.trim()) faltan.push('qué hay que hacer');

  return {
    detallada: !!wo.detailedAt && faltan.length === 0,
    faltan,
    // Solo cuenta como cambio si el ingeniero había puesto un equipo y el
    // técnico puso otro. Rellenar un hueco vacío no es cambiar el alcance.
    alcanceCambiado: !!wo.assignedAssetId && !!wo.assetId && wo.assignedAssetId !== wo.assetId,
  };
}

/** Texto de la actividad al convertir una incidencia en orden. */
export function actividadDesdeIncidencia(inc: {
  code?: string | null;
  title?: string | null;
  description?: string | null;
}): string {
  const partes = [inc.title?.trim(), inc.description?.trim()].filter(Boolean);
  const cuerpo = partes.join('. ') || 'Atender la incidencia reportada.';
  return inc.code ? `[${inc.code}] ${cuerpo}` : cuerpo;
}
