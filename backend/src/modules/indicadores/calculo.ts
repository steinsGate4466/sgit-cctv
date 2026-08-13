/**
 * INDICADORES DE MANTENIMIENTO — la aritmética, aparte y probada
 * =============================================================================
 *
 *  POR QUÉ ESTO ES UNA FUNCIÓN PURA Y NO ESTÁ DENTRO DEL SERVICIO
 *  --------------------------------------------------------------------------
 *  Porque MTTR y MTBF son los números que se van a llevar a una reunión de
 *  gerencia, y ahí no se puede decir «creo que está bien». Separados de la
 *  base de datos se prueban caso por caso en milisegundos, con datos escritos
 *  a mano donde el resultado correcto se sabe de antemano.
 *
 *  Un indicador mal calculado es peor que no tenerlo: se toman decisiones de
 *  presupuesto con él.
 *
 * =============================================================================
 *  QUÉ SIGNIFICA CADA UNO, EN CASTELLANO
 * =============================================================================
 *
 *  MTTR — «cuánto tardamos en arreglarlo»
 *      Del momento en que se abre la orden al momento en que se cierra.
 *      OJO: se mide desde que se ABRE, no desde que el técnico llega. Si una
 *      cámara está tres días esperando repuesto, esos tres días cuentan.
 *      Medirlo sólo desde que se empieza a trabajar da un número bonito que
 *      no se parece a lo que sufre el operador del púlpito.
 *
 *  MTBF — «cuánto aguanta antes de volver a fallar»
 *      Tiempo del periodo dividido entre el número de fallos. Sube cuando el
 *      mantenimiento funciona.
 *
 *  DISPONIBILIDAD — MTBF / (MTBF + MTTR)
 *      El porcentaje del tiempo que el equipo sirve para algo. Es el número
 *      que entiende un gerente sin explicación.
 *
 *  CUMPLIMIENTO DEL PREVENTIVO — cuántas rutinas se hicieron a tiempo.
 *      Es el indicador que predice los demás: si baja, en dos meses sube el
 *      correctivo.
 *
 *  BACKLOG — el trabajo pendiente acumulado, y su antigüedad.
 *      Un backlog estable es normal. Uno que crece dice que el equipo no da
 *      abasto, y eso se ve antes en la antigüedad que en el número.
 */

export const HORA = 3600_000;

export interface OrdenParaCalculo {
  id: string;
  tipo: string;
  estado: string;
  assetId?: string | null;
  creada: Date;
  /** Cuándo se dio por terminada. */
  cerrada?: Date | null;
  programada?: Date | null;
}

export interface Resultado {
  /** Horas medias desde que se abre la orden hasta que se cierra. */
  mttrHoras: number | null;
  /** Horas medias entre fallo y fallo del mismo equipo. */
  mtbfHoras: number | null;
  /** Porcentaje del tiempo que el equipo está disponible. */
  disponibilidadPct: number | null;
  /** Cuántas órdenes correctivas cerradas entraron en el cálculo. */
  muestra: number;
}

/**
 * MTTR sobre las órdenes CORRECTIVAS cerradas.
 *
 * Sólo correctivas: meter el preventivo aquí hunde el número —una rutina
 * programada para dentro de un mes «tarda» un mes— y deja de significar
 * «cuánto tardamos en arreglar una avería», que es lo que se quiere saber.
 */
export function mttr(ordenes: OrdenParaCalculo[]): { horas: number | null; muestra: number } {
  const cerradas = ordenes.filter(
    (o) => o.tipo === 'CORRECTIVO' && o.cerrada && o.cerrada > o.creada,
  );
  if (cerradas.length === 0) return { horas: null, muestra: 0 };
  const total = cerradas.reduce((s, o) => s + (o.cerrada!.getTime() - o.creada.getTime()), 0);
  return {
    horas: Number((total / cerradas.length / HORA).toFixed(1)),
    muestra: cerradas.length,
  };
}

/**
 * MTBF: horas del periodo entre número de fallos.
 *
 * DEVUELVE null CON MENOS DE DOS FALLOS, y esto importa. Con un solo fallo la
 * cuenta daría «el equipo aguanta 720 horas», que suena a dato y es ruido: no
 * hay un intervalo entre fallos, hay un fallo suelto. Un indicador inventado
 * a partir de una muestra de uno es exactamente cómo se toman malas
 * decisiones con datos.
 */
export function mtbf(fallos: number, horasDelPeriodo: number): number | null {
  if (fallos < 2 || horasDelPeriodo <= 0) return null;
  return Number((horasDelPeriodo / fallos).toFixed(1));
}

/** Disponibilidad clásica. Si falta cualquiera de los dos, no se inventa. */
export function disponibilidad(mttrH: number | null, mtbfH: number | null): number | null {
  if (mttrH === null || mtbfH === null) return null;
  if (mtbfH + mttrH <= 0) return null;
  return Number(((mtbfH / (mtbfH + mttrH)) * 100).toFixed(1));
}

/**
 * CUMPLIMIENTO DEL PREVENTIVO.
 *
 * «A tiempo» = cerrada antes de su fecha programada. Una rutina cerrada tres
 * semanas tarde está hecha, pero NO cumplió: contarla como cumplida
 * convertiría el indicador en un contador de trabajo, que ya existe.
 */
export function cumplimientoPreventivo(ordenes: OrdenParaCalculo[]): {
  pct: number | null; aTiempo: number; tarde: number; pendientesVencidas: number;
} {
  const preventivas = ordenes.filter((o) => o.tipo === 'PREVENTIVO' && o.programada);
  const cerradas = preventivas.filter((o) => o.cerrada);
  const aTiempo = cerradas.filter((o) => o.cerrada! <= o.programada!).length;
  const tarde = cerradas.length - aTiempo;
  const ahora = new Date();
  const pendientesVencidas = preventivas.filter((o) => !o.cerrada && o.programada! < ahora).length;

  return {
    pct: cerradas.length ? Number(((aTiempo / cerradas.length) * 100).toFixed(1)) : null,
    aTiempo, tarde, pendientesVencidas,
  };
}

/**
 * BACKLOG por antigüedad.
 *
 * Los tramos no son arbitrarios: una orden de menos de una semana es trabajo
 * normal; de más de un mes es trabajo que ya nadie recuerda por qué se abrió,
 * y a los tres meses es basura que infla el número y esconde lo urgente.
 * Separarlo así hace visible eso.
 */
export function backlog(ordenes: OrdenParaCalculo[], ahora = new Date()) {
  const abiertas = ordenes.filter((o) => !o.cerrada && o.estado !== 'CANCELADA');
  const dias = (o: OrdenParaCalculo) => (ahora.getTime() - o.creada.getTime()) / (24 * HORA);

  const tramos = {
    hasta7: abiertas.filter((o) => dias(o) <= 7).length,
    de8a30: abiertas.filter((o) => dias(o) > 7 && dias(o) <= 30).length,
    de31a90: abiertas.filter((o) => dias(o) > 30 && dias(o) <= 90).length,
    masDe90: abiertas.filter((o) => dias(o) > 90).length,
  };
  const antiguedades = abiertas.map(dias);

  return {
    total: abiertas.length,
    ...tramos,
    antiguedadMediaDias: antiguedades.length
      ? Number((antiguedades.reduce((s, d) => s + d, 0) / antiguedades.length).toFixed(1))
      : 0,
    masAntiguaDias: antiguedades.length ? Number(Math.max(...antiguedades).toFixed(0)) : 0,
  };
}

/**
 * Los equipos que más problemas dan. La lista de «esto ya cuesta más
 * arreglarlo que cambiarlo», que es la conversación de presupuesto.
 */
export function peoresEquipos(ordenes: OrdenParaCalculo[], top = 10) {
  const porActivo = new Map<string, { fallos: number; horas: number; conCierre: number }>();
  for (const o of ordenes) {
    if (o.tipo !== 'CORRECTIVO' || !o.assetId) continue;
    const a = porActivo.get(o.assetId) ?? { fallos: 0, horas: 0, conCierre: 0 };
    a.fallos++;
    if (o.cerrada && o.cerrada > o.creada) {
      a.horas += (o.cerrada.getTime() - o.creada.getTime()) / HORA;
      a.conCierre++;
    }
    porActivo.set(o.assetId, a);
  }
  return [...porActivo.entries()]
    .map(([assetId, a]) => ({
      assetId,
      fallos: a.fallos,
      // Se promedia sólo sobre las CERRADAS: una abierta no tiene duración
      // todavía, y meterla como cero bajaría el MTTR de los peores equipos,
      // que es justo al revés de lo que pasa.
      mttrHoras: a.conCierre ? Number((a.horas / a.conCierre).toFixed(1)) : null,
    }))
    .sort((x, y) => y.fallos - x.fallos)
    .slice(0, top);
}
