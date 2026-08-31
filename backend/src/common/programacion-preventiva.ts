/* =============================================================================
   PROGRAMACIÓN DEL PREVENTIVO — paso ③ del ingeniero · bloque 78
   =============================================================================

   QUÉ CIERRA

   El preventivo ya sabía CUÁNDO tocaba cada equipo (bloque F6.1) y desde el
   bloque 75 sabe QUÉ hacer (las hojas de ruta). Lo que faltaba era juntarlo
   con la tercera pieza:

       CUÁNDO TOCA  ×  QUÉ HACER  ×  CUÁNDO SE PUEDE ENTRAR

   La tercera es la que convierte una lista de vencimientos en un plan. Hoy el
   generador programa la orden para «hoy» y punto — y si esa cámara está en una
   zona que exige el tren parado, esa orden nace imposible: vence, entra en el
   backlog, hunde el cumplimiento, y nadie podía haberla hecho.

   -----------------------------------------------------------------------------
   LAS TRES REGLAS

   1. **LA FECHA LA MANDA LA LETRA, NO EL PLAN.**
      El intervalo del plan se escribió a mano en su día. La letra A/B/C sale
      del método CTR y del ambiente. Manda el que MÁS EXIGE —el menor de los
      dos— porque ninguna de las dos razones es descartable: una cámara C en
      calor radiante sigue necesitando revisión frecuente aunque no importe
      mucho, y una cámara A en un púlpito climatizado también.

   2. **LO QUE EXIGE PARADA SE PROGRAMA EN UNA PARADA.**
      Si la zona exige tren parado, la orden se programa para la próxima
      ventana ANUNCIADA o CONFIRMADA de ese tren. Si no hay ninguna, se
      programa igual y SE DICE que está esperando ventana: esconderla haría
      que el trabajo desapareciera del radar.

   3. **LA ORDEN NACE CON SUS PASOS.**
      La hoja de ruta del tipo de equipo se copia a la actividad de la orden.
      El técnico abre la orden y ve qué hacer, sin buscar el documento.

   -----------------------------------------------------------------------------
   POR QUÉ ES UNA FUNCIÓN PURA

   Porque la parte difícil es DECIDIR LA FECHA, y eso hay que poder probarlo
   con seis objetos escritos a mano: hoy vence, la zona exige parada, hay
   ventana el jueves → se programa el jueves. Montar eso en una base de pruebas
   sería una prueba lenta que acabaría desactivada.
============================================================================= */

/** Una ventana de parada, con lo justo para elegirla. */
export interface VentanaParaProgramar {
  id: string;
  tren: string;
  estado: string;
  inicioPrevisto: Date;
}

/** Lo que hace falta saber de un plan vencido para programarlo. */
export interface PlanParaProgramar {
  assetId: string;
  assetCode: string;
  tipoEquipo: string;
  /** Tren del activo, deducido del árbol. `null` si no cuelga de ninguno. */
  trenCode: string | null;
  /** Cuándo vencía según el plan. */
  vencePlan: Date | null;
  /** Días que pide el plan escrito a mano. */
  diasDelPlan: number;
  /** Días que pide la letra A/B/C. `null` si el equipo no está clasificado. */
  diasPorLetra: number | null;
  /** Días que pide el ambiente (calor, polvo). */
  diasPorAmbiente: number;
  /** Cómo se interviene esa zona. `EXIGE_PARADA` obliga a esperar ventana. */
  intervencionAplica: string;
}

/** El resultado: cuándo se programa y por qué. */
export interface Programacion {
  assetId: string;
  assetCode: string;
  /** Para cuándo se programa. */
  fecha: Date;
  /** Cada cuántos días toca, ya resuelto entre las tres fuentes. */
  cadaDias: number;
  /** Qué mandó en el intervalo. Se enseña para poder discutirlo. */
  mandaIntervalo: 'LETRA' | 'AMBIENTE' | 'PLAN';
  /** Si hubo que esperar a una ventana de parada, cuál. */
  ventanaId: string | null;
  /** TRUE cuando exige parada y NO hay ventana a la vista. */
  esperandoVentana: boolean;
  /** Frases para la actividad de la orden. */
  porque: string[];
}

const DIA = 86_400_000;

/**
 * EL INTERVALO: manda el que más exige, de las tres fuentes.
 *
 * No se promedian ni se elige «la más fiable»: se toma el menor. Promediar
 * daría un número que no defiende nadie —ni el del método, ni el del ambiente,
 * ni el que escribió el ingeniero— y elegir una descartaría información que
 * alguien se molestó en meter.
 */
export function intervaloQueManda(p: PlanParaProgramar): {
  dias: number; manda: Programacion['mandaIntervalo'];
} {
  const opciones: [number, Programacion['mandaIntervalo']][] = [
    [p.diasDelPlan, 'PLAN'],
    [p.diasPorAmbiente, 'AMBIENTE'],
  ];
  if (p.diasPorLetra !== null) opciones.push([p.diasPorLetra, 'LETRA']);

  // Sólo cuentan los positivos: un intervalo de cero o negativo es un dato mal
  // metido y usarlo generaría una orden por segundo.
  const validas = opciones.filter(([d]) => d > 0);
  if (!validas.length) return { dias: 90, manda: 'PLAN' };

  /* En caso de EMPATE gana la LETRA, luego el ambiente, y el plan el último.
     No es un desempate arbitrario: se pinta en pantalla «manda la letra A», y
     eso es lo que explica la frecuencia a quien pregunte. Decir «manda el
     plan» cuando la letra pedía lo mismo escondería el criterio bueno. */
  const orden: Record<Programacion['mandaIntervalo'], number> = { LETRA: 0, AMBIENTE: 1, PLAN: 2 };
  validas.sort((a, b) => a[0] - b[0] || orden[a[1]] - orden[b[1]]);
  return { dias: validas[0][0], manda: validas[0][1] };
}

/**
 * LA PRÓXIMA VENTANA ÚTIL de ese tren.
 *
 * Sólo ANUNCIADA y CONFIRMADA. Una EN_CURSO ya empezó —programar dentro de
 * ella no da tiempo a movilizar a nadie— y TERMINADA o CANCELADA no existen.
 *
 * Se devuelve la MÁS PRÓXIMA, no la más segura. Una CONFIRMADA dentro de tres
 * semanas no vale más que una ANUNCIADA de mañana: la hora de las paradas se
 * mueve constantemente en esta planta (bloque 16), y esperar a la «buena»
 * significa no hacer el trabajo.
 */
export function proximaVentana(
  trenCode: string | null,
  ventanas: VentanaParaProgramar[],
  desde: Date,
): VentanaParaProgramar | null {
  const n = numeroDeTren(trenCode);
  if (n === null) return null;
  const utiles = ventanas
    .filter((v) => v.estado === 'ANUNCIADA' || v.estado === 'CONFIRMADA')
    .filter((v) => numeroDeTren(v.tren) === n)
    .filter((v) => v.inicioPrevisto >= desde)
    .sort((a, b) => a.inicioPrevisto.getTime() - b.inicioPrevisto.getTime());
  return utiles[0] ?? null;
}

/**
 * EL NÚMERO DEL TREN, venga como venga escrito.
 *
 * Hacía falta porque las dos partes lo escriben distinto y NO se pueden
 * comparar por texto:
 *
 *     la ventana guarda el enum   → `TREN_1`
 *     el árbol de planta da       → `AASA-PISCO-T1`
 *
 * `'TREN_1'.includes('T1')` es FALSO, así que una comparación de texto
 * —que es lo primero que sale— haría que NINGUNA orden encontrara su ventana.
 * Y no rompería nada: todas saldrían «esperando parada», que es un resultado
 * plausible. Ese es el tipo de fallo que se queda meses.
 *
 * Se compara por el número, que es lo único que las dos formas comparten.
 */
export function numeroDeTren(v: string | null | undefined): number | null {
  if (!v) return null;
  // El ÚLTIMO número de la cadena: en `AASA-PISCO-T1` hay que saltarse todo lo
  // demás, y en `TREN_1` es el único que hay.
  const m = String(v).match(/(\d+)(?!.*\d)/);
  return m ? Number(m[1]) : null;
}

/**
 * PROGRAMA UN PLAN VENCIDO.
 *
 * Devuelve la fecha, el porqué, y si se quedó esperando ventana.
 */
export function programar(
  p: PlanParaProgramar,
  ventanas: VentanaParaProgramar[],
  ahora: Date,
): Programacion {
  const { dias, manda } = intervaloQueManda(p);
  const porque: string[] = [];

  /* La fecha base es cuando VENCÍA, no hoy. Si un preventivo lleva tres
     semanas vencido y se programa para hoy, el indicador de cumplimiento diría
     que va a tiempo — y lleva tres semanas de retraso. La deuda se ve o no se
     paga. */
  let fecha = p.vencePlan && p.vencePlan < ahora ? p.vencePlan : ahora;

  const etiqueta: Record<Programacion['mandaIntervalo'], string> = {
    LETRA: 'la criticidad A/B/C del equipo',
    AMBIENTE: 'el ambiente donde está montado',
    PLAN: 'el plan escrito para este equipo',
  };
  porque.push(`Se revisa cada ${dias} días; lo marca ${etiqueta[manda]}.`);

  if (p.vencePlan && p.vencePlan < ahora) {
    const atraso = Math.floor((ahora.getTime() - p.vencePlan.getTime()) / DIA);
    if (atraso > 0) porque.push(`Venció hace ${atraso} día(s): se programa con su fecha original.`);
  }

  /* ------------------------------------------------ ¿HACE FALTA TREN PARADO?
     `intervencionAplica` es lo FIRMADO, no la propuesta (bloque 28). Sin firma
     vale EXIGE_PARADA, así que un equipo sin declarar espera ventana — falla
     hacia el lado seguro, que es como falla este proyecto. */
  let ventanaId: string | null = null;
  let esperandoVentana = false;

  if (p.intervencionAplica === 'EXIGE_PARADA') {
    const v = proximaVentana(p.trenCode, ventanas, ahora);
    if (v) {
      ventanaId = v.id;
      fecha = v.inicioPrevisto;
      porque.push('Esta zona exige el tren parado: se programa para la próxima ventana.');
    } else {
      esperandoVentana = true;
      /* Se programa IGUAL, con su fecha. Dejarla sin programar la sacaría del
         backlog y del indicador, y entonces un trabajo que nadie puede hacer
         tampoco lo vería nadie. Que se vea vencida es la señal de que hace
         falta pedir una parada. */
      porque.push('Esta zona exige tren parado y NO hay ninguna ventana anunciada. Hay que pedirla.');
    }
  }

  return {
    assetId: p.assetId,
    assetCode: p.assetCode,
    fecha,
    cadaDias: dias,
    mandaIntervalo: manda,
    ventanaId,
    esperandoVentana,
    porque,
  };
}

/**
 * LA ACTIVIDAD DE LA ORDEN, con los pasos de la hoja de ruta.
 *
 * El técnico abre la orden y ve QUÉ hacer. Antes recibía «toca revisar
 * AA-CAM-T1-001» y el detalle vivía en un Excel en el PC de alguien.
 *
 * Los pasos se COPIAN, no se enlazan. Es deliberado: la orden es el papel de
 * ese trabajo concreto y tiene que decir lo que se pidió ESE DÍA. Si mañana
 * cambia la hoja de ruta, las órdenes ya emitidas no pueden cambiar solas —
 * quedarían firmadas diciendo que se hizo algo que no se pidió.
 */
export function actividadDeLaOrden(
  pr: Programacion,
  pasos: { op: number; sub: number | null; texto: string }[],
): string {
  const cabecera = [
    `Mantenimiento preventivo de ${pr.assetCode}.`,
    ...pr.porque,
  ].join(' ');

  if (!pasos.length) {
    return `${cabecera}\n\nNo hay hoja de ruta para este tipo de equipo todavía.`;
  }

  const lista = pasos
    .slice()
    .sort((a, b) => a.op - b.op || (a.sub ?? 0) - (b.sub ?? 0))
    .map((x) => `  ${x.op}${x.sub !== null ? `.${x.sub}` : ''}  ${x.texto}`)
    .join('\n');

  return `${cabecera}\n\nPASOS (hoja de ruta):\n${lista}`;
}
