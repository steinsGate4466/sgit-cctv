/* =============================================================================
   CRITICIDAD A / B / C POR DISPOSITIVO — bloque 73
   =============================================================================

   PARA QUÉ SIRVE, en una frase:

       Decidir CADA CUÁNTO se le hace mantenimiento a cada equipo, y poder
       explicar por qué.

   -----------------------------------------------------------------------------
   1. EL MÉTODO: CTR — CRITICIDAD TOTAL POR RIESGO
   -----------------------------------------------------------------------------
   Es el método estándar en industria pesada (minería, petróleo, siderurgia).
   Se elige porque **se defiende delante de un ingeniero**: no es una escala
   inventada, es la que él ya conoce.

       CRITICIDAD = FRECUENCIA de falla  ×  CONSECUENCIA de la falla

   La multiplicación no es un capricho. Algo que falla mucho pero no le importa
   a nadie NO es crítico. Algo que casi nunca falla pero cuando falla para el
   tren, SÍ lo es. Sumar los dos daría lo mismo a los dos casos; multiplicar
   los separa, que es justo lo que se quiere.

   Y la CONSECUENCIA, adaptada a CCTV:

       CONSECUENCIA = (Impacto operacional × Falta de respaldo)
                    + Seguridad de personas
                    + Dificultad de reparación

   El producto de los dos primeros es lo importante: **una zona crítica con
   tres cámaras no es lo mismo que la misma zona con una sola**. Ésa es la
   «flexibilidad operacional» del CTR, y aquí es literal — si otra cámara ve
   lo mismo, esta puede esperar.

   -----------------------------------------------------------------------------
   2. LA DIFERENCIA ENTRE LA ZONA Y EL DISPOSITIVO — Y POR QUÉ IMPORTA
   -----------------------------------------------------------------------------
   Son dos afirmaciones distintas y confundirlas rompe el modelo:

     · LA ZONA dice **cuánto importa ver ahí**. Lo declara Producción. Ya
       existe en el sistema (`zona.criticidad`, `porQueEsVital`,
       `impactoSiSeCae`, `queSeVigila`).

     · EL DISPOSITIVO tiene una **letra de mantenimiento**. Es una afirmación
       de Mantenimiento, no de Producción, y responde a otra pregunta: ¿cada
       cuánto hay que subirse a revisar ESTE aparato?

   LA REGLA QUE LAS UNE:

       El equipo hereda la exigencia del LUGAR, repartida entre cuántos
       equipos cubren ese lugar.

   Zona crítica vigilada por UNA cámara  → esa cámara es A.
   La MISMA zona con tres cámaras        → cada una baja, porque hay respaldo.

   -----------------------------------------------------------------------------
   3. LOS EQUIPOS QUE NO VIGILAN NADA — LA REGLA DEL SOPORTE
   -----------------------------------------------------------------------------
   Un switch o un grabador **no ven ninguna zona**. Con la regla de arriba a
   secas saldrían C, que es exactamente al revés de la realidad: si se cae el
   grabador se pierden las dieciséis cámaras que cuelgan de él.

       Un equipo de soporte hereda LA PEOR letra de todo lo que depende de él.

   Esto no hay que inventarlo: el sistema ya sabe qué depende de qué
   (`network.service.ts`, la pantalla «De qué depende»). Aquí sólo se usa.

   -----------------------------------------------------------------------------
   4. LO QUE NO SE NEGOCIA CON UN PUNTAJE
   -----------------------------------------------------------------------------
   **Si el equipo vigila una zona donde una persona puede resultar herida, es
   A.** Punto. No se promedia con nada.

   Motivo: un puntaje es una herramienta para repartir esfuerzo, y repartir
   esfuerzo en seguridad no es una decisión que un promedio deba tomar. Si
   mañana alguien sube el peso del impacto operacional, la seguridad seguiría
   igual de protegida — porque no depende del peso.

   -----------------------------------------------------------------------------
   5. SIN DATOS, NUNCA C
   -----------------------------------------------------------------------------
   Un equipo sin clasificar **no es C**: es `SIN_CLASIFICAR`, y sale en una
   lista de pendientes. Ponerlo en C por defecto haría que cuatrocientas
   cámaras sin revisar parecieran poco importantes, y nadie las revisaría
   nunca. Es la misma regla del proyecto de siempre: *sin datos, nunca cero*.

   -----------------------------------------------------------------------------
   6. QUÉ SE GUARDA Y QUÉ SE CALCULA
   -----------------------------------------------------------------------------
   Regla del proyecto: *lo que se puede calcular, no se guarda*.

     SE GUARDA (lo declara una persona y no hay forma de deducirlo):
       · impacto operacional
       · si vigila un riesgo para personas

     SE CALCULA en cada consulta (el sistema ya tiene el dato):
       · cuántos equipos cubren el mismo sitio  → respaldo
       · cómo se llega al equipo                → dificultad
       · cuántas veces falló en 12 meses        → frecuencia
       · la letra y el porqué

   Guardar la letra significaría mantener dos verdades, y la segunda se queda
   vieja el día que alguien añada una cámara a la zona.

   -----------------------------------------------------------------------------
   7. LOS NÚMEROS SON DE LA PLANTA, NO MÍOS
   -----------------------------------------------------------------------------
   Los cortes de A/B/C y los días de cada letra vienen COMO PARÁMETRO, no
   escritos aquí. Los de abajo son sólo el punto de partida para que el módulo
   arranque, y están marcados como propuestos: el ingeniero los ajusta desde
   la pantalla sin tocar código.
============================================================================= */

/** Las cuatro letras. `SIN_CLASIFICAR` no es un fallo: es un pendiente. */
export type LetraABC = 'A' | 'B' | 'C' | 'SIN_CLASIFICAR';

/** Escala de 1 a 4 en todos los factores. Más alto = peor. */
export type Nivel = 1 | 2 | 3 | 4;

/**
 * Lo que hace falta para clasificar UN equipo.
 *
 * Los dos primeros los declara una persona; el resto los calcula el sistema.
 */
export interface EntradaCriticidad {
  /** Identificador, sólo para poder decir de quién se habla en el porqué. */
  codigo: string;

  // ---- LO QUE DECLARA UNA PERSONA -----------------------------------------
  /**
   * Si este equipo deja de ver, ¿qué le pasa a la producción?
   * 4 = hay que parar · 3 = se baja el ritmo · 2 = se opera con vigía · 1 = nada.
   * `null` = nadie lo ha declarado todavía.
   */
  impactoOperacional: Nivel | null;
  /**
   * ¿Vigila un sitio donde una persona puede resultar herida?
   * Barra caliente, paso de grúa, tránsito de vehículos.
   */
  riesgoPersonas: boolean | null;

  // ---- LO QUE CALCULA EL SISTEMA ------------------------------------------
  /**
   * Cuántos equipos MÁS cubren el mismo sitio. 0 = está solo.
   * Es la «flexibilidad operacional» del CTR, y aquí es literal.
   */
  equiposQueCubrenLoMismo: number;
  /**
   * Cómo se llega. 4 = hace falta parar el tren · 3 = manlift ·
   * 2 = andamio o escalera · 1 = a pie.
   */
  dificultadAcceso: Nivel;
  /** Veces que falló en los últimos 12 meses. */
  fallasUltimoAnio: number;

  // ---- SÓLO PARA EQUIPOS DE SOPORTE ---------------------------------------
  /**
   * Letras de los equipos que dependen de éste (un grabador, un switch).
   * Si viene con datos, se aplica la regla del soporte: hereda la peor.
   */
  letrasQueDependenDeEl?: LetraABC[];
}

/** Los números que pone la planta. Editables desde la interfaz. */
export interface ParametrosCriticidad {
  /** Puntaje mínimo para ser A. */
  corteA: number;
  /** Puntaje mínimo para ser B. Por debajo, C. */
  corteB: number;
  /** Cada cuántos días se revisa una A, una B y una C. */
  diasA: number;
  diasB: number;
  diasC: number;
}

/**
 * PUNTO DE PARTIDA, NO VERDAD DE PLANTA.
 *
 * Sirve para que el módulo arranque el primer día. En cuanto el ingeniero
 * entre a la pantalla y ponga los suyos, estos no se usan más. Están aquí y
 * no repartidos por el código para que se cambien en UN sitio.
 */
export const PARAMETROS_PROPUESTOS: ParametrosCriticidad = {
  corteA: 40,
  corteB: 18,
  diasA: 30,
  diasB: 60,
  diasC: 90,
};

/** El resultado, con todo lo que hace falta para explicarlo en pantalla. */
export interface Criticidad {
  letra: LetraABC;
  /** Null cuando no se puede calcular: falta lo que declara la persona. */
  puntaje: number | null;
  /** Cada cuánto se revisa, según la letra. Null si no hay letra. */
  diasEntreRevisiones: number | null;
  /** Las frases que se pintan en pantalla, en orden de importancia. */
  porque: string[];
  /** Qué falta declarar. Vacío si está completo. */
  faltaDeclarar: string[];
  /** True si la letra vino de la regla de seguridad y no del puntaje. */
  porSeguridad: boolean;
  /** True si la letra la heredó de los equipos que dependen de él. */
  porSoporte: boolean;
}

/* -----------------------------------------------------------------------------
   Las escalas. Cada una convierte un dato de planta en un número de 1 a 4.
----------------------------------------------------------------------------- */

/**
 * FALTA DE RESPALDO. Es lo contrario de la redundancia: cuanto MENOS respaldo,
 * más pesa el equipo.
 *
 * Nótese que baja rápido: con dos compañeros más ya se considera cubierto. En
 * CCTV, tres cámaras mirando lo mismo es mucho — si se cae una, la zona sigue
 * viéndose y el trabajo puede esperar a la próxima parada.
 */
export function faltaDeRespaldo(equiposQueCubrenLoMismo: number): Nivel {
  if (equiposQueCubrenLoMismo <= 0) return 4;   // está solo
  if (equiposQueCubrenLoMismo === 1) return 3;
  if (equiposQueCubrenLoMismo === 2) return 2;
  return 1;
}

/**
 * FRECUENCIA DE FALLA, de las veces que cayó en 12 meses.
 *
 * Los cortes salen de lo que se puede sostener: cuatro fallas al año es una
 * cada trimestre, y eso ya es un equipo que no está bien. Una sola falla al
 * año en una planta siderúrgica es normal y no debería mover la aguja.
 */
export function nivelDeFrecuencia(fallasUltimoAnio: number): Nivel {
  if (fallasUltimoAnio >= 4) return 4;
  if (fallasUltimoAnio === 3) return 3;
  if (fallasUltimoAnio === 2) return 2;
  return 1;                                     // 0 ó 1 falla al año
}

/** Orden de severidad, para poder comparar letras sin encadenar `if`. */
const PESO_LETRA: Record<LetraABC, number> = {
  A: 3, B: 2, C: 1, SIN_CLASIFICAR: 0,
};

/** La peor de una lista de letras. `SIN_CLASIFICAR` nunca gana. */
export function peorLetra(letras: LetraABC[]): LetraABC {
  let peor: LetraABC = 'SIN_CLASIFICAR';
  for (const l of letras) if (PESO_LETRA[l] > PESO_LETRA[peor]) peor = l;
  return peor;
}

/* -----------------------------------------------------------------------------
   EL CÁLCULO
----------------------------------------------------------------------------- */

export function clasificar(
  e: EntradaCriticidad,
  p: ParametrosCriticidad = PARAMETROS_PROPUESTOS,
): Criticidad {
  const diasDe = (l: LetraABC): number | null => (
    l === 'A' ? p.diasA : l === 'B' ? p.diasB : l === 'C' ? p.diasC : null
  );

  /* ---------------------------------------------------------------- SOPORTE
     Un grabador o un switch no vigilan nada por sí mismos. Se resuelve ANTES
     que nada: preguntarle a un switch «¿qué pasa si dejas de ver?» no tiene
     sentido, y si se dejara para después habría que declararle un impacto
     operacional que nadie sabe contestar. */
  if (e.letrasQueDependenDeEl && e.letrasQueDependenDeEl.length > 0) {
    const heredada = peorLetra(e.letrasQueDependenDeEl);
    if (heredada === 'SIN_CLASIFICAR') {
      return {
        letra: 'SIN_CLASIFICAR',
        puntaje: null,
        diasEntreRevisiones: null,
        porque: [`De ${e.codigo} dependen otros equipos, pero ninguno está clasificado todavía.`],
        faltaDeclarar: ['Clasificar primero los equipos que dependen de éste.'],
        porSeguridad: false,
        porSoporte: true,
      };
    }
    const cuantos = e.letrasQueDependenDeEl.length;
    return {
      letra: heredada,
      puntaje: null,
      diasEntreRevisiones: diasDe(heredada),
      porque: [
        `Es equipo de soporte: ${cuantos} equipo(s) dependen de él.`,
        `Hereda la letra ${heredada}, la más exigente de los que sostiene.`,
        'Si se cae éste, se caen todos ellos a la vez.',
      ],
      faltaDeclarar: [],
      porSeguridad: false,
      porSoporte: true,
    };
  }

  /* ------------------------------------------------------- ¿ESTÁ DECLARADO?
     Sin lo que pone la persona no hay letra. Y no se pone C: se dice que
     falta, y sale en la lista de pendientes. */
  const falta: string[] = [];
  if (e.impactoOperacional === null) falta.push('Falta declarar el impacto en producción.');
  if (e.riesgoPersonas === null) falta.push('Falta declarar si vigila un riesgo para personas.');
  if (falta.length) {
    return {
      letra: 'SIN_CLASIFICAR',
      puntaje: null,
      diasEntreRevisiones: null,
      porque: ['Todavía no se puede clasificar este equipo.'],
      faltaDeclarar: falta,
      porSeguridad: false,
      porSoporte: false,
    };
  }

  const respaldo = faltaDeRespaldo(e.equiposQueCubrenLoMismo);
  const frecuencia = nivelDeFrecuencia(e.fallasUltimoAnio);

  /* ------------------------------------------------- SEGURIDAD: NO SE PROMEDIA
     Se calcula igualmente el puntaje —para poder enseñarlo y para que el
     ingeniero vea que la regla se saltó a propósito— pero la letra es A. */
  const consecuencia =
    (e.impactoOperacional! * respaldo)
    + (e.riesgoPersonas ? 4 : 0)
    + e.dificultadAcceso;
  const puntaje = frecuencia * consecuencia;

  if (e.riesgoPersonas) {
    return {
      letra: 'A',
      puntaje,
      diasEntreRevisiones: p.diasA,
      porque: [
        'Vigila un sitio donde una persona puede resultar herida.',
        'Por esa sola razón es A: la seguridad no se promedia con nada.',
        `El puntaje calculado es ${puntaje}, pero aquí no decide.`,
      ],
      faltaDeclarar: [],
      porSeguridad: true,
      porSoporte: false,
    };
  }

  const letra: LetraABC = puntaje >= p.corteA ? 'A' : puntaje >= p.corteB ? 'B' : 'C';

  /* El porqué se escribe SIEMPRE, también cuando sale C. Un equipo que baja
     de categoría y no explica por qué es lo primero que alguien discute en
     una auditoría. */
  const porque: string[] = [
    `Puntaje ${puntaje} → letra ${letra}.`,
    `Falla ${e.fallasUltimoAnio} vez/veces al año (nivel ${frecuencia} de 4).`,
    `Si deja de ver, el impacto en producción es ${e.impactoOperacional} de 4.`,
    e.equiposQueCubrenLoMismo <= 0
      ? 'Está solo: nadie más cubre ese sitio.'
      : `Hay ${e.equiposQueCubrenLoMismo} equipo(s) más cubriendo lo mismo.`,
    `Llegar a él: dificultad ${e.dificultadAcceso} de 4.`,
  ];

  return {
    letra,
    puntaje,
    diasEntreRevisiones: diasDe(letra),
    porque,
    faltaDeclarar: [],
    porSeguridad: false,
    porSoporte: false,
  };
}

/* -----------------------------------------------------------------------------
   CÓMO SE JUNTA CON EL AMBIENTE, QUE YA EXISTÍA
----------------------------------------------------------------------------- */

/**
 * MANDA EL QUE MÁS EXIGE.
 *
 * El sistema ya calculaba un intervalo a partir del AMBIENTE —el calor del
 * horno destruye sellos aunque la cámara sea C— y ahora la letra propone otro.
 * No hay que elegir entre los dos: se toma el MENOR.
 *
 *   Cámara A en púlpito climatizado : letra 30 · ambiente 90 →  30 días
 *   Cámara C en calor radiante      : letra 90 · ambiente 30 →  30 días
 *
 * Así ninguna de las dos razones se pierde, y no hay que discutir cuál pesa
 * más — que es una discusión sin respuesta buena.
 *
 * Si la letra todavía no existe, manda el ambiente y no se rompe nada: es lo
 * que hace que el módulo se pueda encender sin haber clasificado nada.
 */
export function intervaloFinal(
  diasPorLetra: number | null,
  diasPorAmbiente: number,
): { dias: number; manda: 'LETRA' | 'AMBIENTE' | 'EMPATE' } {
  if (diasPorLetra === null) return { dias: diasPorAmbiente, manda: 'AMBIENTE' };
  if (diasPorLetra < diasPorAmbiente) return { dias: diasPorLetra, manda: 'LETRA' };
  if (diasPorAmbiente < diasPorLetra) return { dias: diasPorAmbiente, manda: 'AMBIENTE' };
  return { dias: diasPorLetra, manda: 'EMPATE' };
}
