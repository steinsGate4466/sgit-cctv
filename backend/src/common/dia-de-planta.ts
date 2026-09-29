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
