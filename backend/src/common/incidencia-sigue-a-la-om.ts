/* =============================================================================
   BLOQUE 97 · LA INCIDENCIA SIGUE A SU ORDEN
   -----------------------------------------------------------------------------
   EL FALLO, y lo vio el usuario en pantalla: convertía una incidencia en OM y
   la incidencia seguía diciendo «Abierta» mientras el activo ya decía «En
   mantenimiento». Dos pantallas contando cosas distintas del mismo hecho.

   Medido: `desdeIncidencia()` creaba la orden con `incidentId` y **no tocaba
   la incidencia**. Al cerrar la orden, tampoco.

   -----------------------------------------------------------------------------
   POR QUÉ NO SE FUNDEN EN UNA SOLA COSA

       La INCIDENCIA responde:  ¿qué se rompió?
       La ORDEN responde:       ¿qué hicimos?

   Parecen lo mismo y no lo son. La prueba: **una cámara que se cae y nadie
   atiende no genera ninguna orden**. Si sólo hubiera órdenes, esa falla no
   existiría — se contaría cuánto se trabaja, no cuánto se rompe la planta.

   La cardinalidad, que es la del usuario y la de cualquier CMMS:

       1 incidencia  →  0, 1 o VARIAS órdenes
       1 orden       →  0 o 1 incidencia

   · Orden SIN incidencia  → preventivo, mejora, mapeo. Trabajo programado.
   · Incidencia SIN orden  → falsa alarma, o se resolvió en el momento.
   · Las dos juntas        → el correctivo, y ahí el enlace NO es opcional:
                             sin él no hay MTTR, ni causa por equipo, ni
                             reparto correctivo/preventivo.

   -----------------------------------------------------------------------------
   LA DIRECCIÓN: LA ORDEN EMPUJA, LA INCIDENCIA REFLEJA

   Nunca al revés. Cerrar la incidencia a mano NO cierra la orden: la orden
   lleva materiales retirados y firma, y darla por terminada desde otra
   pantalla dejaría material descuadrado sin que nadie lo decidiera.

   -----------------------------------------------------------------------------
   Y **RESUELTA NO ES CERRADA**

       RESUELTA  la pone el TRABAJO   (la orden se cerró)
       CERRADA   la pone el JEFE      (acto aparte y firmado, bloque 65)

   Juntarlas convertiría el cierre en automático y nadie revisaría nunca. El
   MTTR se mide hasta RESUELTA, que es cuando el servicio volvió; la revisión
   del Jefe puede tardar días y no es tiempo de avería.
============================================================================= */

/** Los estados de incidencia, tal cual el enum de la base. */
export type EstadoIncidencia =
  | 'ABIERTA' | 'EN_DIAGNOSTICO' | 'EN_PROCESO' | 'EN_ESPERA' | 'RESUELTA' | 'CERRADA';

/** Estados de incidencia en los que el trabajo todavía no ha terminado. */
export const INCIDENCIA_VIVA: EstadoIncidencia[] = [
  'ABIERTA', 'EN_DIAGNOSTICO', 'EN_PROCESO', 'EN_ESPERA',
];

/**
 * A qué estado pasa la incidencia cuando se le ABRE una orden.
 * Devuelve `null` si no hay que tocarla.
 */
export function alAbrirOrden(actual: EstadoIncidencia): EstadoIncidencia | null {
  /* Una incidencia ya RESUELTA o CERRADA no se reabre porque alguien abra otra
     orden sobre el mismo equipo: sería reescribir un hecho pasado. Si de
     verdad volvió a fallar, es una incidencia NUEVA — y así el recuento del
     mes dice dos, que es la verdad. */
  if (!INCIDENCIA_VIVA.includes(actual)) return null;
  /* EN_ESPERA la puso el técnico a propósito (falta repuesto, falta manlift).
     Pisarla con EN_PROCESO borraría por qué está parada. */
  if (actual === 'EN_ESPERA') return null;
  if (actual === 'EN_PROCESO') return null;      // ya estaba, no se escribe por escribir
  return 'EN_PROCESO';
}

/**
 * A qué estado pasa la incidencia cuando se CIERRA una de sus órdenes.
 *
 * `otrasAbiertas` = cuántas órdenes suyas siguen sin cerrar. **Con dos órdenes
 * abiertas la incidencia NO se resuelve al cerrar la primera**: diría
 * «arreglado» con trabajo en curso, y el MTTR se cortaría antes de tiempo.
 */
export function alCerrarOrden(
  actual: EstadoIncidencia,
  otrasAbiertas: number,
): EstadoIncidencia | null {
  if (!INCIDENCIA_VIVA.includes(actual)) return null;   // ya resuelta o cerrada
  if (otrasAbiertas > 0) return null;                   // todavía hay trabajo
  return 'RESUELTA';
}

/**
 * Texto para la auditoría. Un cambio de estado que hizo el sistema tiene que
 * decir POR QUÉ lo hizo: si no, tres semanas después parece que alguien tocó
 * la incidencia a mano y nadie sabe quién.
 */
export const porQueCambio = (de: EstadoIncidencia, a: EstadoIncidencia, om: string): string =>
  a === 'EN_PROCESO'
    ? `De ${de} a ${a}: se abrió la orden ${om}.`
    : `De ${de} a ${a}: se cerró la orden ${om} y no queda ninguna abierta.`;
