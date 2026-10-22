/* =============================================================================
   BLOQUE 180 · EL AVISO Y LA ORDEN, COMO EN SAP
   -----------------------------------------------------------------------------
   Decidido por Cristhian el 22/10/2026 (claude/DISENO-AVISO-OM-SAP.md):

   1. UNA INCIDENCIA NO SIEMPRE ES UN CORRECTIVO. Es un AVISO de algo que
      alguien vio. Un gabinete destrozado que sigue funcionando no es una
      avería: es una condición que mañana será avería. El tipo de trabajo lo
      decide Mantenimiento al evaluarla; el sistema sólo lo SUGIERE.
   2. LA ORDEN LA CREA SAP, NO SGIT. Aquí se apunta su número.

   Funciones PURAS, sin base de datos: las usan el servicio de incidencias,
   el de órdenes y el preventivo, y la pantalla tiene su espejo en
   `frontend/src/avisoSap.ts` (la prueba compara los dos).
============================================================================= */

import type { Prisma } from '../generated/prisma/client';

/** Lo que contesta quien reporta a «¿El equipo funciona?». Mismo orden que el enum `TipoAviso`. */
export const TIPOS_DE_AVISO = ['FALLA', 'CONDICION', 'SOLICITUD'] as const;
export type TipoDeAviso = (typeof TIPOS_DE_AVISO)[number];

/** Las palabras de la pantalla. Sin jerga: lo lee el púlpito. */
export const RESPUESTA_DEL_AVISO: Record<TipoDeAviso, string> = {
  FALLA: 'No funciona',
  CONDICION: 'Funciona, pero se va a dañar',
  SOLICITUD: 'Es un pedido o un cambio',
};

/**
 * El tipo de un aviso, también para los de antes del bloque 180.
 *
 * Un aviso sin tipo es de antes: entonces toda incidencia con equipo creaba
 * su evento de falla, así que se lee como FALLA. Leerlo de otra forma
 * cambiaría, de un día para otro, el MTBF de todo el histórico.
 */
export function tipoDeAviso(valor?: string | null): TipoDeAviso {
  return (TIPOS_DE_AVISO as readonly string[]).includes(valor || '') ? (valor as TipoDeAviso) : 'FALLA';
}

/**
 * ¿Cuenta como falla? Sólo lo que NO funciona.
 *
 * Es lo que decide si nace el evento de falla y, con él, si el aviso entra
 * en el MTBF, el MTTR y la disponibilidad. Contar como avería un gabinete que
 * funciona diría que el equipo falla más de lo que falla.
 */
export function cuentaComoFalla(valor?: string | null): boolean {
  return tipoDeAviso(valor) === 'FALLA';
}

/**
 * FILTRO DE PRISMA · sólo los avisos que cuentan como falla: los FALLA y los
 * de antes del bloque 180, que no tienen tipo.
 *
 * NO vale `tipoAviso: { not: 'SOLICITUD' }` ni `NOT`: en SQL una comparación
 * con NULL no es verdadera, así que dejarían fuera todo el histórico — y el
 * MTBF de cada equipo bajaría de golpe sin que nadie supiera por qué. Se usa
 * dentro de un `AND: [...]` para no pisar otro `OR` de la misma consulta.
 */
export const SOLO_FALLAS: Prisma.IncidentWhereInput = { OR: [{ tipoAviso: null }, { tipoAviso: 'FALLA' }] };

/**
 * El tipo de orden que se PROPONE al tratar el aviso. Decide la persona.
 *
 *   no funciona            → correctivo
 *   funciona, se va a dañar → preventivo
 *   pedido o cambio        → mejora (o instalación, si son equipos nuevos:
 *                            eso lo sabe quien lo trata, no el aviso)
 */
export function tipoDeOrdenSugerido(valor?: string | null): 'CORRECTIVO' | 'PREVENTIVO' | 'MEJORA' {
  const t = tipoDeAviso(valor);
  return t === 'FALLA' ? 'CORRECTIVO' : t === 'CONDICION' ? 'PREVENTIVO' : 'MEJORA';
}

/* -----------------------------------------------------------------------------
   EL NÚMERO DE SAP (aviso u orden)
   -----------------------------------------------------------------------------
   En SAP los dos son un campo de 12 caracteres, casi siempre cifras, que la
   pantalla enseña SIN los ceros de delante: el aviso 000010000261278 se ve
   como 10000261278. Si aquí se guardara tal cual se escribe, «010000261278»
   y «10000261278» serían dos números distintos y el buscador no encontraría
   la mitad. Se guarda como lo enseña SAP.
----------------------------------------------------------------------------- */

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

/* -----------------------------------------------------------------------------
   EL TEXTO BREVE DEL AVISO
   -----------------------------------------------------------------------------
   La «descripción» del aviso en SAP es un campo de 40 caracteres: lo que se
   escriba de más, SAP lo corta. Se propone ya cortado, por palabras, para que
   quien lo copia a SAP no tenga que contar letras.
----------------------------------------------------------------------------- */

export const TEXTO_BREVE_SAP = 40;

export function textoBreveParaSap(titulo?: string | null): string {
  const t = String(titulo ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
  if (t.length <= TEXTO_BREVE_SAP) return t;
  const corte = t.slice(0, TEXTO_BREVE_SAP + 1);
  const espacio = corte.lastIndexOf(' ');
  return (espacio >= 20 ? corte.slice(0, espacio) : t.slice(0, TEXTO_BREVE_SAP)).trim();
}

/* -----------------------------------------------------------------------------
   «PRIMERO EL N° SAP» — decisión de Cristhian, 22/10/2026
   -----------------------------------------------------------------------------
   La OM la crea SAP (Producción o el Jefe). Aquí no se ABRE, no AVANZA, no
   saca MATERIAL y no se CIERRA una orden sin su número: sin él, el trabajo
   queda fuera de SAP y las horas y el material no tienen orden a la que ir.
   El texto dice quién lo apunta y dónde, para que nadie se quede parado
   delante de un «no se puede».
----------------------------------------------------------------------------- */
export function motivoSinOmSap(wo: { code: string; externalRef?: string | null }, queSeIntenta: string): string | null {
  if (wo.externalRef) return null;
  return `La orden ${wo.code} todavía no tiene su N° de OM SAP: sin él no se ${queSeIntenta}. `
    + 'Lo apunta quien la creó en SAP (Producción o el Jefe de Mantenimiento) con el botón «N° SAP» de la orden.';
}
