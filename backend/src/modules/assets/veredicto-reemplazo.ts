/**
 * ¿HAY QUE CAMBIAR ESTE EQUIPO? — bloque 108.
 *
 * =============================================================================
 *  LO QUE PIDIÓ EL USUARIO
 * =============================================================================
 *  «Cuando son muy reincidentes en el tema de incidencias, por ejemplo OM
 *   correctivas y tal, para poder hacer un análisis y cambiar ese equipo.»
 *
 *  Las SEÑALES ya existían (`reincidencia.ts`, bloque 78) y el informe del
 *  activo ya las imprimía. Lo que no existía es la frase que hay que llevar a
 *  una reunión: **qué se hace con este equipo**. Un informe que enumera
 *  síntomas y no concluye nada obliga a que el que lo lee lo interprete, y
 *  entonces cada uno concluye una cosa distinta.
 *
 * =============================================================================
 *  EL ORDEN DE LAS COMPROBACIONES ES TODA LA DECISIÓN
 * =============================================================================
 *  1. ¿FALLAN TAMBIÉN LOS VECINOS? Entonces el problema NO está en este equipo:
 *     está en la antena, en el switch o en el tablero del que cuelgan todos.
 *     Cambiar la cámara aquí **tira una cámara buena** y el fallo sigue. Esta
 *     comprobación va PRIMERA por eso, y gana aunque haya diez órdenes.
 *
 *  2. ¿LAS FALLAS SON DEL APARATO QUE ESTÁ PUESTO, O DEL ANTERIOR? Aquí es
 *     donde paga el bloque 106-A/B. Antes, «el sitio» y «el aparato» eran la
 *     misma fila: si la cámara se cambió el mes pasado, las averías del aparato
 *     viejo seguían contando contra el nuevo, y el informe pedía cambiar una
 *     cámara recién puesta. Ahora se cuentan sólo las órdenes posteriores a la
 *     instalación del aparato actual.
 *
 *  3. Sólo entonces, con las fallas del aparato de dentro sobre la mesa, se
 *     propone el reemplazo.
 *
 * =============================================================================
 *  LO QUE ESTA FUNCIÓN NO HACE
 * =============================================================================
 *  NO decide. Propone, con el motivo escrito y los números detrás, y **el visto
 *  bueno lo pone una persona** — que es el norte del proyecto escrito en el §47
 *  de CLAUDE.md: automatizar el mantenimiento para que un ingeniero decida con
 *  el dato delante, no para decidir en su lugar.
 *
 *  Y NO inventa un coste. En este sistema no hay precio de los equipos; poner
 *  una cifra «razonable» en un documento que va a una reunión de presupuesto
 *  sería exactamente el tipo de dato inventado que este proyecto no admite.
 */

export type Veredicto =
  /** El fallo es aguas arriba. Cambiar este equipo no arregla nada. */
  | 'MIRAR_AGUAS_ARRIBA'
  /** El aparato que está puesto acumula fallas. Se propone cambiarlo. */
  | 'PROPONER_REEMPLAZO'
  /** Hay fallas, pero son del aparato ANTERIOR. El de ahora todavía no ha dicho nada. */
  | 'OBSERVAR_EL_NUEVO'
  /** Fallas repetidas sin patrón claro todavía. */
  | 'SEGUIR_OBSERVANDO'
  /** Nada que reportar. */
  | 'SIN_MOTIVO';

/** Órdenes correctivas del aparato ACTUAL a partir de las cuales se propone cambiarlo. */
export const UMBRAL_REEMPLAZO = 3;

export interface DatosVeredicto {
  /** Severidad global que ya calcula `reincidencia.ts`. */
  severidad: 'NINGUNA' | 'SOSPECHA' | 'CONFIRMADA';
  /** Códigos de las señales encontradas. */
  codigos: string[];
  /** Órdenes del sitio, con su fecha, ya filtradas a correctivas por quien llama. */
  correctivas: Array<{ fecha: Date | string | null }>;
  /** Desde cuándo está puesto el aparato actual. `null` si no hay ninguno registrado. */
  aparatoDesde?: Date | string | null;
  /** La fecha de arriba es estimada (traspaso del 106-A), no medida. */
  aparatoDesdeEsEstimado?: boolean;
  /** Cuántos aparatos se han cambiado ya en este sitio. */
  reemplazosPrevios?: number;
}

export interface Resultado {
  veredicto: Veredicto;
  /** La frase que va en el informe, ya redactada. */
  frase: string;
  /** Correctivas atribuibles al aparato que está puesto AHORA. */
  correctivasDelAparato: number;
  /** Correctivas del sitio, de todos los aparatos que han pasado. */
  correctivasDelSitio: number;
  /** El veredicto se apoya en una fecha estimada, no medida. Se dice. */
  apoyadoEnFechaEstimada: boolean;
}

export function decidirReemplazo(d: DatosVeredicto): Resultado {
  const correctivasDelSitio = d.correctivas.length;

  /* Órdenes posteriores a la instalación del aparato actual. Sin aparato
     registrado no se puede separar, y entonces se cuentan todas — pero el
     informe lo dice, en vez de dar a entender que son del de ahora. */
  const desde = d.aparatoDesde ? new Date(d.aparatoDesde).getTime() : null;
  const correctivasDelAparato = desde === null
    ? correctivasDelSitio
    : d.correctivas.filter((o) => {
      if (!o.fecha) return false;
      return new Date(o.fecha).getTime() >= desde;
    }).length;

  const apoyadoEnFechaEstimada = !!d.aparatoDesdeEsEstimado && desde !== null;
  const base = { correctivasDelAparato, correctivasDelSitio, apoyadoEnFechaEstimada };

  /* 1 · LOS VECINOS. Va primero y gana a todo lo demás. */
  if (d.codigos.includes('FALLA_COMPARTIDA')) {
    return {
      ...base,
      veredicto: 'MIRAR_AGUAS_ARRIBA',
      frase: 'Otros equipos que comparten la misma infraestructura también fallan. '
        + 'Antes de cambiar nada aquí hay que revisar la antena, el switch o el '
        + 'tablero del que cuelgan todos: cambiar este equipo no arreglaría el fallo '
        + 'y dejaría fuera de servicio un aparato que probablemente está bien.',
    };
  }

  if (d.severidad === 'NINGUNA' && correctivasDelSitio < 2) {
    return { ...base, veredicto: 'SIN_MOTIVO', frase: 'Sin señales de reincidencia.' };
  }

  /* 2 · ¿DE QUIÉN SON LAS FALLAS? Aquí paga el 106-A/B. */
  if (desde !== null && correctivasDelSitio >= UMBRAL_REEMPLAZO
      && correctivasDelAparato < UMBRAL_REEMPLAZO) {
    return {
      ...base,
      veredicto: 'OBSERVAR_EL_NUEVO',
      frase: `Este punto acumula ${correctivasDelSitio} correctivas, pero `
        + `${correctivasDelSitio - correctivasDelAparato} son del aparato ANTERIOR. `
        + `El que está puesto lleva ${correctivasDelAparato} y todavía no ha `
        + 'confirmado el patrón. Cambiarlo ahora sería cambiar un aparato que aún '
        + 'no ha fallado lo suficiente para saber si el problema era del equipo o '
        + 'del sitio.',
    };
  }

  /* 3 · El aparato de dentro acumula fallas. */
  if (correctivasDelAparato >= UMBRAL_REEMPLAZO || d.severidad === 'CONFIRMADA') {
    const cuantos = d.reemplazosPrevios ?? 0;
    return {
      ...base,
      veredicto: 'PROPONER_REEMPLAZO',
      frase: `El aparato instalado acumula ${correctivasDelAparato} correctiva(s) `
        + 'y la reincidencia está confirmada. Se propone su reemplazo.'
        + (cuantos > 0
          ? ` Ojo: este punto ya ha consumido ${cuantos} aparato(s). Si el siguiente `
            + 'vuelve a fallar, el problema es del SITIO —montaje, alimentación, '
            + 'vibración, ambiente— y no del modelo.'
          : ''),
    };
  }

  return {
    ...base,
    veredicto: 'SEGUIR_OBSERVANDO',
    frase: `Hay ${correctivasDelAparato} correctiva(s) sobre el aparato instalado, `
      + 'por debajo del umbral. Conviene seguirlo de cerca antes de proponer un cambio.',
  };
}

/** Título corto para la cabecera del informe. */
export const TITULO: Record<Veredicto, string> = {
  MIRAR_AGUAS_ARRIBA: 'El fallo no parece estar en este equipo',
  PROPONER_REEMPLAZO: 'Se propone reemplazar el equipo',
  OBSERVAR_EL_NUEVO: 'Las fallas son del aparato anterior',
  SEGUIR_OBSERVANDO: 'Seguir observando',
  SIN_MOTIVO: 'Sin motivo para reemplazar',
};
