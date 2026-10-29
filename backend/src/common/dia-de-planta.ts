/**
 * EL DÍA DE PLANTA Y CUÁNDO VENCE UNA ORDEN — bloque 158.
 *
 * Una OM programada para HOY no está vencida hasta que termina hoy. Antes se
 * comparaba con «ahora» y una orden de las 08:00 salía «vencida · 0 días» a
 * las 09:00 del mismo día: en la bandeja, en el Dashboard y en el resumen de
 * Telegram. Para quien programa por días, eso es una alarma falsa.
 *
 * Regla única: una orden abierta está VENCIDA cuando su día ya pasó, contado
 * en la hora de la planta (Perú, UTC-5 salvo `PLANT_UTC_OFFSET`).
 */

/** Medianoche de HOY en la planta, expresada en UTC. */
export function inicioDelDiaDePlanta(ahora: Date = new Date(), desfaseHoras = Number(process.env.PLANT_UTC_OFFSET ?? -5)): Date {
  const local = new Date(ahora.getTime() + desfaseHoras * 3600_000);
  const medianocheLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(medianocheLocal - desfaseHoras * 3600_000);
}

/** Todo lo programado ANTES de este instante y sin cerrar, está vencido. */
export const corteDeVencidas = (ahora: Date = new Date()) => inicioDelDiaDePlanta(ahora);

export function omVencida(programada: Date | string | null | undefined, ahora: Date = new Date()): boolean {
  if (!programada) return false;
  return new Date(programada).getTime() < corteDeVencidas(ahora).getTime();
}

/* -----------------------------------------------------------------------------
   UN DÍA DEL CALENDARIO QUE LLEGA DE UN FORMULARIO — bloque 184
   -----------------------------------------------------------------------------
   Un campo de fecha sin hora (`<input type="date">`) llega como «2026-10-28».
   `new Date('2026-10-28')` lo lee como MEDIANOCHE UTC, que en la planta
   (UTC-5) son las 19:00 del día ANTERIOR: una orden asignada salía programada
   y vencida un día antes de lo elegido, y el fin de soporte de un modelo
   retrocedía un día cada vez que se guardaba la ficha sin tocarla.

   Campañas ya lo resolvía por su cuenta (bloque 12.5). Ahora vive aquí, junto
   a la regla de vencimiento, con el mismo desfase: un día suelto se guarda a
   MEDIODÍA de la planta, lejos de cualquier borde. Lo que ya trae hora (ISO
   completo) pasa tal cual.
----------------------------------------------------------------------------- */
const SOLO_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** «2026-10-28» → el 28 a mediodía en la planta. Con hora, tal cual. */
export function diaDePlanta(v: string | Date, desfaseHoras = Number(process.env.PLANT_UTC_OFFSET ?? -5)): Date {
  if (v instanceof Date) return v;
  const t = String(v).trim();
  const m = SOLO_DIA.exec(t);
  if (!m) return new Date(t);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) - desfaseHoras * 3600_000);
}
