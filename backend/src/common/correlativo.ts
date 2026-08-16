/**
 * CORRELATIVOS A PRUEBA DE DOS PERSONAS A LA VEZ — bloque 37.
 *
 * =============================================================================
 *  EL FALLO
 * =============================================================================
 *  Generar un código correlativo se hacía así, en tres módulos distintos:
 *
 *      1. leer la última orden del año            -> OM-2026-0041
 *      2. sumarle uno en JavaScript               -> 42
 *      3. escribir la orden nueva                 -> OM-2026-0042
 *
 *  Entre el paso 1 y el 3 hay un hueco. Si dos personas crean una orden en ese
 *  hueco, las dos leen 0041, las dos calculan 0042, y las dos intentan
 *  escribirlo.
 *
 *  Como `code` es `@unique`, no salen dos órdenes con el mismo número —eso ya
 *  estaba bien—. Lo que sale es un **error 500 sin explicación** para la
 *  segunda persona.
 *
 *  Y pasa justo cuando peor viene: cuando cae algo gordo en un tren y tres
 *  personas abren órdenes a la vez. El sistema fallaba exactamente en el
 *  momento en que hacía falta.
 *
 * =============================================================================
 *  POR QUÉ NO SE «ARREGLA» EL HUECO
 * =============================================================================
 *  Se podría bloquear la tabla, o usar una secuencia de PostgreSQL. Las dos
 *  tienen el mismo problema para este caso: el correlativo se reinicia POR AÑO
 *  y lleva el año dentro del texto (`OM-2026-0042`). Una secuencia no sabe de
 *  años, y bloquear la tabla de órdenes en una planta con tres trenes
 *  trabajando es cambiar un error raro por una espera constante.
 *
 *  La carrera no se evita: SE ABSORBE. Si el número ya estaba cogido, se pide
 *  el siguiente y se vuelve a intentar. Es lo que hace cualquier sistema que
 *  numere documentos por año, y es honesto: reconoce que dos personas pueden
 *  pulsar a la vez, en vez de fingir que no.
 *
 * =============================================================================
 *  POR QUÉ AQUÍ Y NO COPIADO EN CADA SERVICIO
 * =============================================================================
 *  El mismo patrón estaba en `maintenance`, `instalacion` y `preventive`, con
 *  tres redacciones distintas. Tres sitios donde arreglarlo, y el que se
 *  olvidara iba a ser el que fallara. Aquí es uno, y se prueba una vez.
 */

/** Prisma marca así la violación de una restricción de unicidad. */
export const CHOQUE_DE_UNICIDAD = 'P2002';

/** ¿El error que subió es «ese código ya existe»? */
export function esChoqueDeUnicidad(e: any): boolean {
  return e?.code === CHOQUE_DE_UNICIDAD;
}

/* =============================================================================
   CUÁNTOS REINTENTOS, Y POR QUÉ CON ESPERA AL AZAR
   -----------------------------------------------------------------------------
   La primera versión de esto hacía tres intentos seguidos, sin pausa. Una
   prueba de concurrencia contra PostgreSQL de verdad —ocho peticiones a la
   vez— la tumbó: sólo entraron 3 de 8.

   El motivo es que TODOS LOS QUE COMPITEN HACEN LO MISMO AL MISMO TIEMPO:

     ronda 1 · los 8 leen «no hay ninguna» -> los 8 piden 0001 -> gana 1
     ronda 2 · los 7 releen «hay 0001»     -> los 7 piden 0002 -> gana 1
     ronda 3 · los 6 releen «hay 0002»     -> los 6 piden 0003 -> gana 1

   Cada ronda deja pasar exactamente a uno, así que hacen falta tantas rondas
   como personas compitiendo. Con tres, los otros cinco se quedaban fuera.

   Dos cambios, y los dos hacen falta:

   1. UNA ESPERA CORTA Y AL AZAR entre intentos. Es lo que rompe la formación:
      si los siete esperan tiempos distintos, dejan de leer y escribir al
      unísono y se ordenan solos. Sin el azar, esperar todos lo mismo sólo
      retrasa el mismo choque.

   2. MÁS INTENTOS. Ocho cubre de sobra el peor momento real —cae algo gordo y
      el ingeniero, el jefe y dos técnicos abren órdenes a la vez—. No es un
      número infinito: si tras ocho sigue chocando, el problema no es la
      concurrencia y hay que verlo, no esconderlo bajo más reintentos.

   La espera es de milisegundos y sólo ocurre cuando ya hubo un choque, así
   que en el 99,9 % de las veces —una sola persona creando una orden— esto no
   cuesta absolutamente nada.
   ============================================================================= */
const INTENTOS_POR_DEFECTO = 8;

/** Espera entre 5 y 40 ms, distinta para cada uno. Rompe la sincronía. */
const esperaAlAzar = () =>
  new Promise((r) => setTimeout(r, 5 + Math.floor(Math.random() * 35)));

/**
 * Ejecuta `intento` y, si choca contra la unicidad, lo repite.
 *
 * @param intento  recibe el número de reintento (0 la primera vez).
 * @param maximo   8 por defecto. Pásale 1 cuando el código lo escribió una
 *                 persona: ahí el conflicto es real y tiene que llegarle.
 *
 * OJO: sólo se reintenta el choque de UNICIDAD. Cualquier otro error sube tal
 * cual. Reintentar a ciegas convertiría un fallo real —una relación que no
 * existe, un campo obligatorio vacío— en ocho intentos y el mismo fallo, con
 * ocho veces el ruido en el registro y ninguna pista más.
 */
export async function conReintentoDeCodigo<T>(
  intento: (n: number) => Promise<T>,
  maximo = INTENTOS_POR_DEFECTO,
): Promise<T> {
  let ultimo: any;
  for (let n = 0; n < maximo; n++) {
    try {
      return await intento(n);
    } catch (e: any) {
      if (!esChoqueDeUnicidad(e)) throw e;
      ultimo = e;
      // No se espera después del último: nadie va a usar esa pausa.
      if (n < maximo - 1) await esperaAlAzar();
    }
  }
  throw ultimo;
}

/**
 * El siguiente número de una serie.
 *
 * SOBRE `salto` — la primera versión lo usaba para que cada reintento pidiera
 * un número distinto sin volver a leer. Se quitó de los llamadores porque
 * TODOS releen la base antes de reintentar, y entonces sumar el número de
 * intento sólo consigue dejar HUECOS en la numeración: se salta de la
 * OM-2026-0041 a la 0044 sin que existan la 42 ni la 43.
 *
 * Un hueco en un correlativo de órdenes es exactamente la clase de cosa que
 * una auditoría pregunta —«¿y esta orden dónde está?»— y que nadie sabe
 * responder tres meses después.
 *
 * El parámetro se conserva para quien reintente SIN releer, pero lo normal es
 * releer: es más barato que explicar un hueco.
 *
 * @param ultimoCodigo  el mayor código de la serie, o null si no hay ninguno.
 * @param prefijo       'OM-2026-' o 'OT-2026-'. Se usa para recortar el número.
 */
export function siguienteCorrelativo(
  ultimoCodigo: string | null | undefined,
  prefijo: string,
  salto = 0,
  digitos = 4,
): string {
  /* Se recorta por LONGITUD DEL PREFIJO, no partiendo por guiones. Un código
     escrito a mano puede traer guiones de más («OM-2026-CAM-0007») y
     `split('-').pop()` devolvería «0007» de una serie que no es la nuestra.
     El prefijo es la única parte de la que estamos seguros. */
  const cola = (ultimoCodigo ?? '').startsWith(prefijo)
    ? ultimoCodigo!.slice(prefijo.length)
    : '';
  const n = Number.parseInt(cola, 10);
  const base = Number.isFinite(n) && n > 0 ? n : 0;
  return `${prefijo}${String(base + 1 + salto).padStart(digitos, '0')}`;
}
