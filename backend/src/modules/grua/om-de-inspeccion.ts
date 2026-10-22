/**
 * ¿ESTA INSPECCIÓN ABRE UN AVISO? — bloques 140 y 180.
 *
 * Bloque 140: antes la inspección de grúa anotaba el hallazgo y ahí se
 * quedaba; lo que no se convierte en trabajo, no se hace. Se le hizo abrir un
 * CORRECTIVO solo.
 *
 * Bloque 180 (corrección de Cristhian, 22/10/2026): la OM NO la crea SGIT, la
 * crea SAP; y una observación no es un correctivo. Así que la inspección abre
 * un AVISO —una incidencia— con lo que vio, y Mantenimiento lo TRATA: decide
 * el tipo de orden y la crea en SAP.
 *
 * Regla, en orden:
 *   · Ya viene hecha DENTRO de una orden   → no (el hallazgo va a esa orden).
 *   · FUERA DE SERVICIO                    → aviso de FALLA («no funciona»).
 *   · Con observaciones y «requiere seguimiento» → aviso de CONDICIÓN
 *     («funciona, pero se va a dañar»): no cuenta como falla en el MTBF.
 *   · Operativa, o no se pudo acceder      → no. Si no se llegó al equipo no
 *     hay hallazgo: hay que volver a subir, y eso lo programa el ingeniero.
 *
 * Si la cámara ya tiene un aviso VIVO, se enlaza a ése en vez de abrir otro:
 * dos avisos de la misma cámara son el mismo problema contado dos veces.
 */
export type DecisionAviso = 'FALLA' | 'CONDICION' | 'NO';

export function decidirAvisoDeInspeccion(i: {
  resultado?: string | null;
  requiereSeguimiento?: boolean | null;
  workOrderId?: string | null;
}): DecisionAviso {
  if (i.workOrderId) return 'NO';
  if (i.resultado === 'FUERA_DE_SERVICIO') return 'FALLA';
  if (i.resultado === 'OPERATIVA_CON_OBSERVACIONES' && i.requiereSeguimiento) return 'CONDICION';
  return 'NO';
}

/** El título del aviso: qué y dónde, corto (lo lee la bandeja sin abrir nada). */
export function tituloDelAviso(i: { grua: string; posicionEnGrua?: string | null; resultado?: string | null }): string {
  const que = i.resultado === 'FUERA_DE_SERVICIO' ? 'Cámara fuera de servicio' : 'Observaciones en cámara';
  return `${que} · grúa ${i.grua.trim()}${i.posicionEnGrua ? ` (${i.posicionEnGrua})` : ''}`.slice(0, 160);
}

/** El detalle del aviso: qué se vio y de qué inspección salió, para no tener que abrirla. */
export function descripcionDelAviso(i: { code: string; grua: string; posicionEnGrua?: string | null; resultado?: string | null; hallazgos?: string | null }): string {
  const donde = `grúa ${i.grua}${i.posicionEnGrua ? ` (${i.posicionEnGrua})` : ''}`;
  const que = i.resultado === 'FUERA_DE_SERVICIO' ? 'Cámara fuera de servicio' : 'Seguimiento de observaciones';
  const detalle = (i.hallazgos || '').trim();
  return `${que} en ${donde}. Inspección ${i.code}.${detalle ? ` Hallazgos: ${detalle}` : ''}`.slice(0, 1000);
}
