/* =============================================================================
   EL PLAN DE UNA CAMPAÑA — bloque 175
   -----------------------------------------------------------------------------
   Palabras del usuario: «que se pueda crear campaña de instalación, campaña de
   rotulado… a libre albedrío, pero que se pueda planificar correctamente».

   Hasta aquí una campaña era SÓLO de mapeo. Ahora el TIPO es libre y lo que la
   hace planificable es lo mismo para todas:

     · cada zona tiene QUIÉN, DESDE CUÁNDO, HASTA CUÁNDO y CUÁNTO (la meta);
     · se ve qué zona va atrasada sin hacer cuentas;
     · el avance cuenta lo APROBADO por otra persona, nunca lo «dicho».

   La revisión de calidad ficha por ficha (calidad-ficha.ts) sólo tiene sentido
   en MAPEO: ahí lo que se entrega son fichas de equipos. En un rotulado lo que
   se entrega es trabajo hecho, y lo confirma otra persona.

   Todo lo de aquí es PURO, para poder probarlo sin base de datos.
============================================================================= */
import { inicioDelDiaDePlanta } from '../../common/dia-de-planta';

/** Quita tildes y mayúsculas: «Rotulado», «rotulado» y «ROTULADO» son el mismo tipo. */
export function claveDeTipo(t: string | null | undefined): string {
  return String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Una campaña sin tipo es vieja, y las viejas eran todas de mapeo. */
export function esMapeo(tipo: string | null | undefined): boolean {
  const k = claveDeTipo(tipo);
  return k === '' || k.startsWith('mapeo') || k.startsWith('levantamiento');
}

/** Cómo se guarda el tipo: espacios limpios y la primera letra en mayúscula. */
export function limpiarTipo(t: string | null | undefined): string {
  const s = String(t ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

/**
 * Si ya existe un tipo que se escribe igual (sin mirar tildes ni mayúsculas),
 * se usa ESE. Sin esto, «Rotulado» y «rotulado» serían dos tipos y el filtro
 * partiría las campañas en dos montones.
 */
export function tipoCanonico(escrito: string, existentes: Array<string | null>): string {
  const limpio = limpiarTipo(escrito);
  const k = claveDeTipo(limpio);
  const igual = existentes.find((e) => e && claveDeTipo(e) === k);
  return igual ?? limpio;
}

/** null si las fechas cuadran; el motivo si no. */
export function fechasMal(inicio: Date | null, fin: Date | null): string | null {
  if (inicio && Number.isNaN(inicio.getTime())) return 'La fecha de inicio no se entiende.';
  if (fin && Number.isNaN(fin.getTime())) return 'La fecha de fin no se entiende.';
  if (inicio && fin && fin.getTime() < inicio.getTime()) {
    return 'El fin no puede ser antes del inicio.';
  }
  return null;
}

export type EstadoDelPlan = 'TERMINADA' | 'SIN_PLAN' | 'POR_EMPEZAR' | 'EN_PLAZO' | 'ATRASADA';

/**
 * Cómo va una zona contra su plan. El ORDEN de las comprobaciones es la regla:
 *   1. APROBADA → terminada, aunque se aprobara tarde: ya no hay nada que hacer.
 *   2. Sin fecha de fin → «sin plan». No se inventa un plazo.
 *   3. Su último día ya pasó → ATRASADA (mismo corte que una OM vencida,
 *      bloque 158: lo de hoy no está atrasado hasta que termina hoy).
 *   4. Aún no empieza y no se ha tocado → por empezar.
 */
export function estadoDelPlan(
  z: { estado: string; inicioPrevisto: Date | null; finPrevisto: Date | null },
  ahora: Date = new Date(),
): EstadoDelPlan {
  if (z.estado === 'APROBADA') return 'TERMINADA';
  if (!z.finPrevisto) return 'SIN_PLAN';
  const hoy = inicioDelDiaDePlanta(ahora).getTime();
  if (new Date(z.finPrevisto).getTime() < hoy) return 'ATRASADA';
  if (z.inicioPrevisto && new Date(z.inicioPrevisto).getTime() >= hoy + 86_400_000 && z.estado === 'PENDIENTE') {
    return 'POR_EMPEZAR';
  }
  return 'EN_PLAZO';
}

/**
 * La meta de la campaña: lo hecho contra lo esperado.
 * Si alguna zona no tiene meta, el porcentaje NO se calcula: sumar sólo las
 * que la tienen diría «80 %» de una cosa que nadie midió entera.
 */
export function avanceDeMeta(zonas: Array<{ esperados: number | null; hechos: number | null }>) {
  const sinMeta = zonas.filter((z) => z.esperados == null).length;
  const hechos = zonas.reduce((s, z) => s + (z.hechos ?? 0), 0);
  const esperados = zonas.reduce((s, z) => s + (z.esperados ?? 0), 0);
  const pct = zonas.length && sinMeta === 0 && esperados > 0
    ? Math.min(100, Math.round((hechos / esperados) * 100))
    : null;
  return { hechos, esperados, sinMeta, pct };
}
