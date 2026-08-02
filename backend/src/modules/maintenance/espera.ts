/**
 * ÓRDENES PARADAS — lógica pura, probada aparte.
 *
 * LA FUGA MÁS CALLADA DEL SISTEMA
 *
 * Una orden EN ESPERA no le avisa a nadie. Se pone en espera porque falta un
 * repuesto, o un permiso, o una parada de línea, y ahí se queda. El trabajo
 * no se pierde: se OLVIDA, que es peor, porque nadie lo echa en falta.
 *
 * Las vencidas sí se ven —tienen fecha y la fecha pasa—. Una orden en espera
 * no tiene fecha que venza: está esperando, y esperar no es un error. Por eso
 * no aparece en ninguna lista de problemas hasta que alguien pregunta por ese
 * equipo, semanas después.
 *
 * ESTA ES LA REGLA QUE LO CIERRA:
 * esperar está bien; esperar SIN QUE NADIE LO MIRE, no.
 */

/** Cuántos días de espera se consideran normales según lo que se espera. */
export const PLAZO_ESPERA_DIAS: Record<string, number> = {
  // Un repuesto que hay que comprar tarda. Tres semanas es razonable.
  REPUESTO: 21,
  // Un permiso de trabajo depende de una firma: si tarda una semana, algo
  // está atascado en el circuito, no en la orden.
  PERMISO: 7,
  // Una parada de línea llega cuando llega. El horizonte es el mes.
  PARADA: 30,
  // Esperar a un tercero es lo que más se descontrola: nadie de la casa lo
  // tiene en su lista.
  TERCERO: 14,
};

/** Cuando no se declaró el motivo, o el motivo no está en la tabla. */
export const PLAZO_POR_DEFECTO = 10;

export interface OrdenEnEspera {
  id: string;
  code: string;
  activity?: string | null;
  /** Cuándo se puso EN ESPERA por última vez. */
  desde: Date | string | null;
  /** Código del catálogo MOTIVO_AVANCE, si se declaró. */
  motivo?: string | null;
  motivoTexto?: string | null;
}

export interface EsperaEvaluada extends OrdenEnEspera {
  dias: number;
  plazo: number;
  /** Pasó del plazo razonable para lo que está esperando. */
  excedida: boolean;
  /** Frase lista para la pantalla. */
  texto: string;
}

function diasDesde(v: Date | string | null, ahora: number): number {
  if (!v) return 0;
  const t = new Date(v).getTime();
  if (isNaN(t)) return 0;
  return Math.max(0, Math.floor((ahora - t) / 86_400_000));
}

/**
 * El plazo se busca por COINCIDENCIA dentro del código del motivo, no por
 * igualdad. Los códigos del catálogo los escribe el ingeniero desde la
 * pantalla —`FALTA_REPUESTO`, `ESPERA_REPUESTO`, `SIN_REPUESTO`— y exigir
 * una cadena exacta obligaría a adivinar cómo la va a escribir.
 */
export function plazoDe(motivo?: string | null): number {
  if (!motivo) return PLAZO_POR_DEFECTO;
  const m = motivo.toUpperCase();
  for (const [clave, dias] of Object.entries(PLAZO_ESPERA_DIAS)) {
    if (m.includes(clave)) return dias;
  }
  return PLAZO_POR_DEFECTO;
}

export function evaluarEspera(o: OrdenEnEspera, ahora: number = Date.now()): EsperaEvaluada {
  const dias = diasDesde(o.desde, ahora);
  const plazo = plazoDe(o.motivo);
  const excedida = dias > plazo;

  // El texto dice CUÁNTO lleva y QUÉ espera. "En espera" a secas no mueve a
  // nadie; "23 días esperando un repuesto" sí.
  const que = o.motivoTexto || legible(o.motivo);
  const texto = dias === 0
    ? `Puesta en espera hoy${que ? `: ${que}` : ''}.`
    : `${dias} día(s) esperando${que ? ` ${que}` : ''}.` + (excedida ? ` Lo normal serían ${plazo}.` : '');

  return { ...o, dias, plazo, excedida, texto };
}

function legible(motivo?: string | null): string {
  if (!motivo) return '';
  const m = motivo.toUpperCase();
  if (m.includes('REPUESTO')) return 'un repuesto';
  if (m.includes('PERMISO')) return 'un permiso';
  if (m.includes('PARADA')) return 'una parada de línea';
  if (m.includes('TERCERO')) return 'a un tercero';
  return '';
}

/**
 * Ordena lo que hay que mirar primero: lo que se pasó de plazo, y dentro de
 * eso lo que lleva más tiempo. Un listado por fecha de creación pondría
 * arriba las recién paradas, que son justo las que no hay que tocar.
 */
export function ordenarPorUrgencia(lista: EsperaEvaluada[]): EsperaEvaluada[] {
  return [...lista].sort((a, b) => {
    if (a.excedida !== b.excedida) return a.excedida ? -1 : 1;
    return b.dias - a.dias;
  });
}
