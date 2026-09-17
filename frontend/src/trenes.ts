/**
 * QUÉ TREN ES ÉSTE — la ÚNICA forma de comparar dos identificadores de tren.
 * ===========================================================================
 *
 *  BLOQUE 103. Lo vio el usuario abriendo el software: en «Por tren» elegía el
 *  Tren 2, pulsaba «Qué está fallando», y aterrizaba en el Tren 1.
 *
 *  Eran DOS fallos encadenados, y el segundo es el que volvería a morder:
 *
 *  1. Los tres enlaces de «Por tren» NO llevaban el tren elegido. La pantalla
 *     de destino arranca con `t[0].code` —el PRIMERO de la lista— así que
 *     siempre caía en el Tren 1. Y no rompe nada: enseña un tren de verdad,
 *     con datos de verdad. Por eso sobrevivió a todo.
 *
 *  2. Cada pantalla llama «tren» a una cosa distinta. «Por tren» guarda la
 *     SIGLA (`T2`); «Mis cámaras» y «Mis activos» guardan el CÓDIGO del árbol
 *     (`AASA-PISCO-T2`). Pasar el valor de una a otra sin normalizar habría
 *     arreglado el síntoma y dejado el mecanismo intacto para la siguiente.
 *
 *  El backend ya resolvió esto en el bloque 42 (`common/ambito-usuario.ts`,
 *  función `alcanza`). Aquí se replica la MISMA regla, y se replica a propósito
 *  en un solo archivo: lo que falló fue tener la comparación repartida.
 *
 *  Y NO se compara por subcadena suelta. Con `includes('T1')`, el Tren 1
 *  alcanzaría también a un futuro Tren 10. Se exige que coincida entero o que
 *  venga precedido de un guion, que es como separan los códigos del árbol.
 */

/** Lo que este sistema entiende por «qué tren es»: la sigla, y si no, el código. */
export function siglaDeTren(t: any): string {
  return String(t?.sigla || t?.code || '');
}

/**
 * ¿Los dos nombran el mismo tren? Acepta `T2` contra `AASA-PISCO-T2` en
 * cualquier orden, porque según quién cargara el dato se guardó de las dos
 * maneras. Vacío nunca alcanza a nada: un dato que falta no es un permiso.
 */
export function mismoTren(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = String(a || '').toUpperCase();
  const y = String(b || '').toUpperCase();
  if (!x || !y) return false;
  return x === y || x.endsWith(`-${y}`) || y.endsWith(`-${x}`);
}

/** El tren que pide la dirección (`?tren=T2`). Cadena vacía si no pide ninguno. */
export function trenPedido(search: string): string {
  try {
    return new URLSearchParams(search).get('tren') || '';
  } catch {
    /* Una dirección malformada no puede dejar la pantalla en blanco: se
       comporta como si no hubiera pedido ningún tren. */
    return '';
  }
}

/**
 * Elige el tren con el que abrir la pantalla.
 *
 *  - Si la dirección pide uno Y ESTÁ EN SU ÁMBITO, ése.
 *  - Si pide uno que no está, el primero de los suyos. NO se enseña vacío:
 *    el servidor ya recortó la lista por ámbito, así que «no está» significa
 *    que el enlace venía de otro sitio, no que le falte permiso.
 *  - Si no pide ninguno, el primero.
 *
 * Devuelve `null` sólo cuando la persona no tiene ningún tren.
 */
export function elegirTren(trenes: any[], pedido: string): any | null {
  if (!trenes || !trenes.length) return null;
  if (pedido) {
    const suyo = trenes.find((t) => mismoTren(siglaDeTren(t), pedido) || mismoTren(t?.code, pedido));
    if (suyo) return suyo;
  }
  return trenes[0];
}
