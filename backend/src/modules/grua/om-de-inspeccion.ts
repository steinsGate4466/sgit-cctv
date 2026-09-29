/**
 * ¿ESTA INSPECCIÓN ABRE UNA ORDEN? — bloque 140.
 *
 * Antes la inspección de grúa anotaba el hallazgo y ahí se quedaba: el
 * ingeniero tenía que leerla y acordarse de abrir la orden. Lo que no se
 * convierte en trabajo, no se hace.
 *
 * Regla, en orden:
 *   · Ya viene hecha DENTRO de una orden   → no se abre otra.
 *   · FUERA DE SERVICIO                    → se abre (correctivo).
 *   · Con observaciones y «requiere seguimiento» marcado → se abre.
 *   · Operativa, o no se pudo acceder      → no. Si no se llegó al equipo no
 *     hay hallazgo que arreglar: hay que volver a subir, y eso lo programa
 *     el ingeniero con el manlift.
 *
 * Si la cámara ya tiene un correctivo ABIERTO, se enlaza a ese en vez de
 * abrir otro: dos órdenes sobre la misma cámara son dos cuadrillas a la
 * misma grúa.
 */
export type DecisionOm = 'ABRIR' | 'NO';

export function decidirOmDeInspeccion(i: {
  resultado?: string | null;
  requiereSeguimiento?: boolean | null;
  workOrderId?: string | null;
}): DecisionOm {
  if (i.workOrderId) return 'NO';
  if (i.resultado === 'FUERA_DE_SERVICIO') return 'ABRIR';
  if (i.resultado === 'OPERATIVA_CON_OBSERVACIONES' && i.requiereSeguimiento) return 'ABRIR';
  return 'NO';
}

/** Lo que dice la orden: qué se vio y dónde, para que el técnico no tenga que abrir la inspección. */
export function actividadDeLaOm(i: { code: string; grua: string; posicionEnGrua?: string | null; resultado?: string | null; hallazgos?: string | null }): string {
  const donde = `grúa ${i.grua}${i.posicionEnGrua ? ` (${i.posicionEnGrua})` : ''}`;
  const que = i.resultado === 'FUERA_DE_SERVICIO' ? 'Cámara fuera de servicio' : 'Seguimiento de observaciones';
  const detalle = (i.hallazgos || '').trim();
  return `${que} en ${donde}. Inspección ${i.code}.${detalle ? ` Hallazgos: ${detalle}` : ''}`.slice(0, 1000);
}
