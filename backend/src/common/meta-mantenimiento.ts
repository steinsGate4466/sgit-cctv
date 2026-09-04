/**
 * LA META DE MANTENIMIENTO — bloque 94.
 *
 * =============================================================================
 *  DE DÓNDE SALE, Y POR QUÉ HABÍA QUE MOVERLA
 * =============================================================================
 *  La hoja del ingeniero traía, en el paso ⑤ (la reunión):
 *
 *      40 CORRECTIVO  ·  30 PREVENTIVO  ·  30 PREDICTIVO   → (meta)
 *
 *  El PREDICTIVO se retiró en el bloque 80 con su visto bueno, y con razón de
 *  planta: una cámara da imagen o no la da, no avisa como avisa un rodamiento.
 *  Pero ese tercio quedó sin repartir y la meta siguió ESCRITA EN EL CÓDIGO
 *  del frontend, donde nadie de planta puede tocarla.
 *
 *  > Una meta que exige un despliegue para cambiarse no se cambia: se ignora.
 *
 *  Y una meta que nadie ha firmado, presentada como si estuviera firmada, es
 *  peor que no tener meta: se discute el número en la reunión en vez de
 *  discutir el trabajo.
 *
 * =============================================================================
 *  DOS METAS, NO UNA — y contestan preguntas distintas
 * =============================================================================
 *      REPARTO      ¿en QUÉ se trabaja?     correctivo % / preventivo %
 *      VOLUMEN      ¿CUÁNTAS se hacen?      órdenes por mes
 *
 *  El volumen es OPCIONAL. Sin él, el reparto sigue significando lo mismo. Y
 *  mezclarlos en un solo número —«hacer 40 preventivas»— confunde la dirección
 *  del trabajo con su cantidad: se puede cumplir el volumen empeorando el
 *  reparto, y entonces el indicador diría que se va bien.
 *
 * =============================================================================
 *  LA PROPUESTA NO ES UNA DECISIÓN
 * =============================================================================
 *  Mientras la tabla esté vacía se usan estos valores y la pantalla lo dice
 *  con esas palabras: PROPUESTA. Es la misma regla de los cortes de la
 *  criticidad (bloque 76): la migración no inserta ninguna fila, porque
 *  insertarla convertiría una propuesta en una decisión que nadie tomó.
 */

export interface MetaReparto {
  /** Porcentaje objetivo de trabajo correctivo. */
  correctivoPct: number;
  /** Porcentaje objetivo de trabajo preventivo. Con el anterior suma 100. */
  preventivoPct: number;
  /** Órdenes por mes. `null` = no se ha fijado, y entonces no se pinta. */
  omPorMes: number | null;
}

/**
 * PUNTO DE PARTIDA, no objetivo firmado.
 *
 * Se propone 30/70 y no el 40/60 de la hoja porque el 30 % del predictivo
 * retirado pasa al lado planificado: era trabajo que ya iba a programarse.
 * Es una propuesta, y está para que el ingeniero la cambie desde la pantalla
 * en treinta segundos.
 */
export const META_PROPUESTA: MetaReparto = {
  correctivoPct: 30,
  preventivoPct: 70,
  omPorMes: null,
};

/**
 * Por qué NO se guarda la meta como un solo número.
 *
 * Guardar sólo el correctivo y calcular el preventivo como `100 - x` parece
 * más limpio y es una trampa: el día que alguien quiera una tercera categoría
 * —y la hoja original tenía tres— habría que rehacer la tabla. Se guardan los
 * dos y se valida que sumen 100, que es una comprobación de una línea.
 */
export function motivoParaNoGuardarMeta(m: Partial<MetaReparto>): string | null {
  const c = m.correctivoPct;
  const p = m.preventivoPct;
  if (typeof c !== 'number' || typeof p !== 'number') {
    return 'Faltan los dos porcentajes del reparto.';
  }
  if (!Number.isInteger(c) || !Number.isInteger(p)) {
    return 'Los porcentajes se expresan en números enteros.';
  }
  if (c < 0 || p < 0 || c > 100 || p > 100) {
    return 'Cada porcentaje tiene que estar entre 0 y 100.';
  }
  /* SUMAR 100 NO ES BUROCRACIA. Un reparto que suma 90 deja un 10 % sin dueño,
     y el gráfico lo repartiría solo entre los dos — enseñando una meta que
     nadie escribió. */
  if (c + p !== 100) {
    return `El reparto tiene que sumar 100 %. Ahora suma ${c + p} %.`;
  }
  if (m.omPorMes !== null && m.omPorMes !== undefined) {
    if (!Number.isInteger(m.omPorMes) || m.omPorMes < 0) {
      return 'La meta de órdenes por mes es un número entero de cero o más.';
    }
    /* Un tope alto y evidente: no es una regla de planta, es un freno contra
       el dedo resbalado. Con 100.000 el indicador quedaría siempre en rojo y
       nadie sabría por qué. */
    if (m.omPorMes > 10000) {
      return 'La meta de órdenes por mes parece un error de tecleo (máximo 10 000).';
    }
  }
  return null;
}
