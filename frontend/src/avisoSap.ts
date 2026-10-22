/* =============================================================================
   BLOQUE 180 · EL AVISO Y LA ORDEN, COMO EN SAP — lo que necesita la pantalla
   -----------------------------------------------------------------------------
   Espejo de `backend/src/common/aviso-sap.ts`. El servidor decide; esto sólo
   sirve para PREGUNTAR con las mismas palabras y avisar antes de enviar. Una
   prueba del backend compara los dos archivos: si uno cambia y el otro no, la
   pantalla diría una cosa y el servidor haría otra.
============================================================================= */

export const TIPOS_DE_AVISO = ['FALLA', 'CONDICION', 'SOLICITUD'] as const;
export type TipoDeAviso = (typeof TIPOS_DE_AVISO)[number];

/** La respuesta a «¿El equipo funciona?». Sin jerga: lo lee el púlpito. */
export const RESPUESTA_DEL_AVISO: Record<TipoDeAviso, string> = {
  FALLA: 'No funciona',
  CONDICION: 'Funciona, pero se va a dañar',
  SOLICITUD: 'Es un pedido o un cambio',
};

/** El nombre corto, para la lista. */
export const TIPO_DE_AVISO_ES: Record<TipoDeAviso, string> = {
  FALLA: 'Falla',
  CONDICION: 'Condición',
  SOLICITUD: 'Solicitud',
};

/** Rojo, ámbar o azul: se lee sin leer la palabra (clases en styles.css). */
export const CLASE_DEL_AVISO: Record<TipoDeAviso, string> = {
  FALLA: 'badge aviso-falla',
  CONDICION: 'badge aviso-condicion',
  SOLICITUD: 'badge aviso-solicitud',
};

/** Por qué importa la respuesta, para el `title`. */
export const QUE_SIGNIFICA_EL_AVISO: Record<TipoDeAviso, string> = {
  FALLA: 'Cuenta como falla: entra en el MTBF y el MTTR del equipo.',
  CONDICION: 'No es una falla todavía: no cuenta en el MTBF. Mantenimiento decide si es un preventivo o una mejora.',
  SOLICITUD: 'No es una falla: es trabajo nuevo. Mantenimiento decide si es una mejora o una instalación.',
};

export const OPCIONES_DEL_AVISO = TIPOS_DE_AVISO.map((v) => ({ valor: v, texto: RESPUESTA_DEL_AVISO[v] }));

/** Los avisos de antes del bloque 180 no tienen tipo: se leen como FALLA, igual que en el servidor. */
export function tipoDeAviso(valor?: string | null): TipoDeAviso {
  return (TIPOS_DE_AVISO as readonly string[]).includes(valor || '') ? (valor as TipoDeAviso) : 'FALLA';
}

/** El tipo de orden que se PROPONE al tratar el aviso. Decide la persona. */
export function tipoDeOrdenSugerido(valor?: string | null): 'CORRECTIVO' | 'PREVENTIVO' | 'MEJORA' {
  const t = tipoDeAviso(valor);
  return t === 'FALLA' ? 'CORRECTIVO' : t === 'CONDICION' ? 'PREVENTIVO' : 'MEJORA';
}

export const NUMERO_SAP_MAX = 12;
export const NUMERO_SAP_MIN = 4;

/** Como lo enseña SAP: sin espacios, en mayúsculas y sin ceros delante. `null` si viene vacío. */
export function normalizarNumeroSap(texto?: string | null): string | null {
  const limpio = String(texto ?? '').replace(/\s+/g, '').toUpperCase();
  if (!limpio) return null;
  return /^\d+$/.test(limpio) ? limpio.replace(/^0+(?=\d)/, '') : limpio;
}

/** Por qué NO vale un número ya normalizado, o `null` si vale. */
export function motivoNumeroSapInvalido(numero: string): string | null {
  if (!/^[A-Z0-9]+$/.test(numero)) {
    return 'El N° de SAP lleva sólo cifras (y letras, si tu planta las usa), sin guiones ni símbolos.';
  }
  if (numero.length < NUMERO_SAP_MIN || numero.length > NUMERO_SAP_MAX) {
    return `El N° de SAP tiene entre ${NUMERO_SAP_MIN} y ${NUMERO_SAP_MAX} caracteres, como lo enseña SAP (p. ej. 10000261278).`;
  }
  return null;
}

/** Lo que hay que decir debajo del campo mientras se escribe, o `null`. */
export function avisoDelNumeroSap(texto?: string | null): string | null {
  const n = normalizarNumeroSap(texto);
  return n ? motivoNumeroSapInvalido(n) : null;
}
