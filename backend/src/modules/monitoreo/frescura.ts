/**
 * ¿ESTA OBSERVACIÓN SIGUE VALIENDO? — lógica pura, probada aparte.
 *
 * EL ERROR QUE ESTO EVITA
 * Un dato de monitoreo viejo es PEOR que no tener dato. Si el agente lleva
 * dos horas caído y la pantalla sigue enseñando "responde", el sistema está
 * mintiendo con cara de estar informado. Y a un dato con aspecto de verdad
 * la gente le hace caso.
 *
 * Así que toda observación caduca. Pasado su tiempo deja de decir "responde"
 * y pasa a decir "no lo sé desde hace X" — que es la verdad.
 *
 * LA SEGUNDA REGLA: NO SE DA NADA POR CAÍDO AL PRIMER FALLO.
 * En una wifi industrial, con hornos y motores, una pérdida suelta es lo
 * normal. Avisar por cada una convierte el sistema en ruido y a la tercera
 * semana nadie mira las alertas. Hacen falta varios fallos seguidos.
 */

export type Resultado = 'RESPONDE' | 'NO_RESPONDE' | 'DEGRADADO' | 'DESCONOCIDO';

export interface Observacion {
  result: Resultado;
  checkedAt: Date | string | null;
  lastSeenAt?: Date | string | null;
  consecutiveFails?: number;
  latencyMs?: number | null;
}

/** Cuánto vale una observación antes de considerarse vieja. */
export const VIGENCIA_MIN = 15;

/** Fallos seguidos antes de dar un equipo por caído. */
export const FALLOS_PARA_CAIDO = 3;

/** Latencia a partir de la cual se considera degradado, en milisegundos. */
export const LATENCIA_DEGRADADO_MS = 400;

export interface Veredicto {
  /** Lo que se le enseña al usuario. */
  estado: 'RESPONDE' | 'CAIDO' | 'INESTABLE' | 'SIN_DATO';
  /** Frase corta, ya escrita para la pantalla. */
  texto: string;
  /** Minutos desde la última comprobación. null si nunca se comprobó. */
  antiguedadMin: number | null;
  /** true si el dato caducó: hay observación, pero ya no vale. */
  caducada: boolean;
}

function minutosDesde(v: Date | string | null | undefined, ahora: number): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  if (isNaN(t)) return null;
  return Math.max(0, Math.floor((ahora - t) / 60000));
}

export function evaluar(
  obs: Observacion | null | undefined,
  ahora: number = Date.now(),
  vigenciaMin: number = VIGENCIA_MIN,
): Veredicto {
  if (!obs || obs.result === 'DESCONOCIDO') {
    return {
      estado: 'SIN_DATO',
      // No se dice "sin datos" a secas: se dice por qué, porque lo primero
      // que piensa quien lo lee es que el sistema está roto.
      texto: 'Todavía no se comprueba automáticamente.',
      antiguedadMin: null,
      caducada: false,
    };
  }

  const antiguedad = minutosDesde(obs.checkedAt, ahora);

  if (antiguedad === null || antiguedad > vigenciaMin) {
    const desde = minutosDesde(obs.lastSeenAt, ahora);
    return {
      estado: 'SIN_DATO',
      texto: desde === null
        ? 'Sin comprobar. El agente de planta no está reportando.'
        : `Sin comprobar desde hace ${textoTiempo(antiguedad ?? desde)}. El agente no está reportando.`,
      antiguedadMin: antiguedad,
      caducada: true,
    };
  }

  if (obs.result === 'NO_RESPONDE') {
    const fallos = obs.consecutiveFails ?? 0;
    if (fallos < FALLOS_PARA_CAIDO) {
      // Todavía no se afirma que esté caído. Una pérdida suelta en una wifi
      // industrial es lo normal; llamarla avería es cómo se pierde la
      // confianza en el sistema de alertas.
      return {
        estado: 'INESTABLE',
        texto: `No respondió las últimas ${fallos} comprobación(es). Puede ser una pérdida puntual.`,
        antiguedadMin: antiguedad,
        caducada: false,
      };
    }
    const desde = minutosDesde(obs.lastSeenAt, ahora);
    return {
      estado: 'CAIDO',
      texto: desde === null
        ? 'No responde.'
        : `No responde desde hace ${textoTiempo(desde)}.`,
      antiguedadMin: antiguedad,
      caducada: false,
    };
  }

  if (obs.result === 'DEGRADADO') {
    return {
      estado: 'INESTABLE',
      texto: obs.latencyMs
        ? `Responde con retraso (${obs.latencyMs} ms). Suele anticipar una caída.`
        : 'Responde de forma intermitente.',
      antiguedadMin: antiguedad,
      caducada: false,
    };
  }

  return {
    estado: 'RESPONDE',
    texto: `Responde${obs.latencyMs ? ` (${obs.latencyMs} ms)` : ''}.`,
    antiguedadMin: antiguedad,
    caducada: false,
  };
}

/** "hace 3 minutos" se entiende; "hace 4.320 minutos" no. */
export function textoTiempo(min: number | null): string {
  if (min === null) return 'un tiempo';
  if (min < 1) return 'menos de un minuto';
  if (min < 60) return `${min} minuto(s)`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} hora(s)`;
  return `${Math.floor(h / 24)} día(s)`;
}

/**
 * Convierte lo que reporta el agente en lo que se guarda, arrastrando el
 * contador de fallos seguidos.
 */
export function siguienteEstado(
  anterior: Observacion | null | undefined,
  reporte: { responde: boolean; latencyMs?: number | null },
  ahora: Date = new Date(),
): {
  result: Resultado;
  latencyMs: number | null;
  lastSeenAt: Date | null;
  checkedAt: Date;
  consecutiveFails: number;
} {
  const antesFallos = anterior?.consecutiveFails ?? 0;
  const antesVisto = anterior?.lastSeenAt ? new Date(anterior.lastSeenAt) : null;

  if (!reporte.responde) {
    return {
      result: 'NO_RESPONDE',
      latencyMs: null,
      // lastSeenAt NO se toca al fallar: es la última vez que SÍ se vio, y
      // es justo el dato que permite decir "lleva 40 minutos caída".
      lastSeenAt: antesVisto,
      checkedAt: ahora,
      consecutiveFails: antesFallos + 1,
    };
  }

  const lat = reporte.latencyMs ?? null;
  return {
    result: lat !== null && lat > LATENCIA_DEGRADADO_MS ? 'DEGRADADO' : 'RESPONDE',
    latencyMs: lat,
    lastSeenAt: ahora,
    checkedAt: ahora,
    consecutiveFails: 0,
  };
}
