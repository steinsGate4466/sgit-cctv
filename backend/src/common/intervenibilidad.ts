/* =============================================================================
   ¿SE PUEDE INTERVENIR CON EL TREN EN MARCHA? — bloque 28
   -----------------------------------------------------------------------------
   EL PROBLEMA
   Hoy toda orden espera a una ventana de parada, y muchas no lo necesitan.
   Revisar la configuración de un grabador en el púlpito es trabajo de oficina:
   una cabina cerrada, lejos de la barra caliente. Hacerle esperar tres semanas
   a una parada es tiempo tirado, y encima llena la ventana de trabajos que no
   deberían estar compitiendo con los que sí exigen que el tren se detenga.

   -----------------------------------------------------------------------------
   POR QUÉ SE DERIVA Y NO SE PREGUNTA
   Si se pregunta en cada aviso, el que abre la orden a las tres de la mañana
   marca lo que le suene y se acabó la clasificación. El dato que decide ya
   está en el sistema: el AMBIENTE de la zona, que se hereda del árbol de
   planta. El púlpito es CLIMATIZADO; la salida del horno es CALOR_RADIANTE.
   No hace falta un campo nuevo ni una pregunta más.

   =============================================================================
    LA REGLA QUE HACE QUE ESTO NO MATE A NADIE
   =============================================================================
    LA PROPUESTA NO HABILITA. SÓLO HABILITA LA FIRMA.

    El sistema PROPONE una clasificación a partir del ambiente. Esa propuesta
    no autoriza nada. Mientras una zona no esté FIRMADA por el Supervisor
    Operativo de Tercería o por el Jefe de Mantenimiento, el sistema trata sus
    órdenes como si exigieran parada.

    Es decir: FALLA HACIA EL LADO SEGURO. Un error del sistema hace esperar a
    alguien; nunca hace subir a alguien a una zona caliente creyendo que puede.

    Y por eso la firma queda con nombre, fecha y motivo en la auditoría: si
    algún día pasa algo, se sabe quién dijo que ahí se podía trabajar con el
    tren produciendo. No es burocracia — es que esa decisión tiene dueño.
============================================================================= */

export type Ambiente =
  | 'CALOR_RADIANTE' | 'VAPOR_AGUA' | 'POLVO_METALICO'
  | 'INTEMPERIE_SALINA' | 'EMI_ALTA' | 'CLIMATIZADO';

export type Intervencion =
  /** Cabina o púlpito: se trabaja con el tren produciendo. */
  | 'EN_MARCHA'
  /** Sala eléctrica / MCC: hace falta permiso y bloqueo eléctrico. */
  | 'CON_PERMISO_ELECTRICO'
  /** Hay que subir: exige permiso de altura (PETAR) y personal acreditado. */
  | 'CON_PERMISO_ALTURA'
  /** Barra caliente, vapor, rodillos: el tren tiene que estar detenido. */
  | 'EXIGE_PARADA'
  /** No hay ambiente declarado. Se trata como EXIGE_PARADA hasta que lo haya. */
  | 'SIN_CLASIFICAR';

export const ETIQUETA: Record<Intervencion, string> = {
  EN_MARCHA: 'Se puede intervenir en marcha',
  CON_PERMISO_ELECTRICO: 'En marcha, con permiso y bloqueo eléctrico',
  CON_PERMISO_ALTURA: 'En marcha, con permiso de altura',
  EXIGE_PARADA: 'Exige parada del tren',
  SIN_CLASIFICAR: 'Sin clasificar',
};

/** Severidad. Mayor = más restrictivo. Sirve para no bajar nunca la guardia. */
const ORDEN: Record<Intervencion, number> = {
  EN_MARCHA: 0,
  CON_PERMISO_ELECTRICO: 1,
  CON_PERMISO_ALTURA: 2,
  EXIGE_PARADA: 3,
  SIN_CLASIFICAR: 4,
};

/** Devuelve la más restrictiva de dos clasificaciones. */
export function masRestrictiva(a: Intervencion, b: Intervencion): Intervencion {
  return ORDEN[a] >= ORDEN[b] ? a : b;
}

/**
 * PROPUESTA del sistema. No autoriza: sugiere.
 *
 * @param ambiente     el de la zona, heredado del árbol de planta.
 * @param requiereAltura  si llegar al equipo exige manlift o escalera.
 */
export function proponer(
  ambiente: Ambiente | null | undefined,
  requiereAltura = false,
): Intervencion {
  if (!ambiente) return 'SIN_CLASIFICAR';

  // La altura manda sobre casi todo: da igual lo fresco que esté el sitio,
  // subir es subir. Sólo no manda cuando además hay barra caliente, porque
  // entonces el problema mayor es el otro.
  const base: Intervencion = (() => {
    switch (ambiente) {
      // Púlpito de control: cabina cerrada, lejos de la línea.
      case 'CLIMATIZADO': return 'EN_MARCHA';
      // Sala eléctrica y MCC: no hay acero caliente, hay tensión.
      case 'EMI_ALTA': return 'CON_PERMISO_ELECTRICO';
      // Horno y refrigeración de rodillos: aquí no se entra con el tren vivo.
      case 'CALOR_RADIANTE':
      case 'VAPOR_AGUA': return 'EXIGE_PARADA';
      // Cascarilla, cizalla, patios: el riesgo depende de si hay que subir.
      case 'POLVO_METALICO':
      case 'INTEMPERIE_SALINA': return 'EN_MARCHA';
      default: return 'SIN_CLASIFICAR';
    }
  })();

  if (requiereAltura) return masRestrictiva(base, 'CON_PERMISO_ALTURA');
  return base;
}

/**
 * Lo que el sistema APLICA de verdad.
 *
 * Aquí está la red de seguridad completa:
 *   · Si hay firma, manda la firma.
 *   · Si NO hay firma, se aplica EXIGE_PARADA, diga lo que diga la propuesta.
 *   · Y si la firma dice algo MENOS restrictivo que la propuesta actual, se
 *     avisa: significa que el ambiente de la zona cambió después de firmar
 *     —se instaló un horno al lado, se movió la línea— y esa firma se hizo
 *     sobre una planta que ya no es la de hoy.
 */
export function resolver(
  propuesta: Intervencion,
  firmada: Intervencion | null | undefined,
): {
  aplica: Intervencion;
  estaFirmada: boolean;
  /** true si la firma permite más de lo que hoy propondría el sistema. */
  firmaDesactualizada: boolean;
  motivo: string;
} {
  if (!firmada) {
    return {
      aplica: 'EXIGE_PARADA',
      estaFirmada: false,
      firmaDesactualizada: false,
      motivo:
        propuesta === 'SIN_CLASIFICAR'
          ? 'La zona no tiene ambiente declarado y nadie ha firmado cómo se interviene. ' +
            'Hasta que se firme se pide parada, que es lo seguro.'
          : `El sistema propondría «${ETIQUETA[propuesta].toLowerCase()}», pero nadie lo ha ` +
            'firmado todavía. Una propuesta no autoriza a nadie a acercarse a la línea.',
    };
  }

  const desactualizada = ORDEN[firmada] < ORDEN[propuesta];
  return {
    aplica: firmada,
    estaFirmada: true,
    firmaDesactualizada: desactualizada,
    motivo: desactualizada
      ? `Firmado como «${ETIQUETA[firmada].toLowerCase()}», pero por el ambiente de la zona hoy ` +
        `correspondería «${ETIQUETA[propuesta].toLowerCase()}». Algo cambió en planta desde que se ` +
        'firmó: hay que revisarlo antes de mandar a nadie.'
      : `Firmado: ${ETIQUETA[firmada].toLowerCase()}.`,
  };
}

/** ¿Esta orden tiene que esperar a una ventana de parada? */
export function esperaVentana(aplica: Intervencion): boolean {
  return aplica === 'EXIGE_PARADA' || aplica === 'SIN_CLASIFICAR';
}
