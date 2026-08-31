/* =============================================================================
   FIABILIDAD SOBRE EVENTOS DE FALLA — bloque 78
   =============================================================================

   QUÉ CAMBIA RESPECTO A LO QUE HABÍA

   `modules/indicadores/calculo.ts` mide el MTTR de «orden creada» a «orden
   cerrada». Eso mezcla tres cosas distintas en un solo número:

       la cámara se apagó a las 03:00
       alguien lo vio           a las 08:00   ← 5 h de DETECCIÓN
       el técnico subió         a las 10:00   ← 2 h de ORGANIZACIÓN
       volvió a funcionar       a las 11:00   ← 1 h de REPARACIÓN

   El MTTR viejo diría 8 horas y culparía a mantenimiento de 7 que no son
   suyas. El ingeniero lo va a picar en la primera revisión, y con razón.

   -----------------------------------------------------------------------------
   LOS TRES TRAMOS, CON SU DUEÑO

       DETECCIÓN      ocurrió → detectado      monitoreo / púlpito
       RESPUESTA      detectado → empieza      organización del trabajo
       REPARACIÓN     empieza → restablecido   mantenimiento  ← el MTTR de verdad
       ─────────────────────────────────────────────────────────────────
       INDISPONIBILIDAD  ocurrió → restablecido   lo que ve Producción

   Se dan los cuatro. Dar sólo el último es lo que hay hoy; dar sólo el tercero
   sería esconder que la mitad del problema es que nos enteramos tarde.

   -----------------------------------------------------------------------------
   DOS REGLAS QUE NO SE AFLOJAN

   1. **SIN DATOS, `null` — NUNCA CERO.** Un cero se pinta en el gráfico y se
      lee como «vamos perfectos». Un `null` se pinta como «no hay datos» y
      manda a alguien a averiguar por qué. Es la regla de siempre del proyecto.

   2. **LO ESTIMADO SE DICE.** Cuando `occurredAt` se rellenó con la hora del
      reporte —porque nadie sabía la real— el tramo de detección de ese evento
      sale CERO y no es verdad: es que no se sabe. Se cuentan aparte y se
      devuelve `estimados`, para que la pantalla pueda decir «de 40 averías, 31
      no tienen hora real de caída». Un indicador con la mitad de la muestra
      inventada y presentado como medido es peor que no tenerlo.
============================================================================= */

export const HORA = 3_600_000;

/** Un evento de falla, con lo justo para calcular. */
export interface FallaParaCalculo {
  assetId: string;
  occurredAt: Date;
  detectedAt: Date;
  repairStartedAt: Date | null;
  restoredAt: Date | null;
  /** `occurredAt` se rellenó con la hora del reporte: no es una medición. */
  ocurrioEsEstimado: boolean;
  esFalsaAlarma: boolean;
}

/** Un tramo medido, con su muestra y cuánto de ella es estimación. */
export interface Tramo {
  /** Horas de media. `null` cuando no hay ni un caso que medir. */
  horas: number | null;
  /** Cuántos eventos entraron en la media. */
  muestra: number;
  /** De esos, cuántos llevan una hora estimada y no medida. */
  estimados: number;
}

const vacio = (): Tramo => ({ horas: null, muestra: 0, estimados: 0 });

/**
 * Las falsas alarmas se descartan de TODO.
 *
 * No se borran —hay que poder auditar por qué no cuentan— pero un aviso que
 * resultó no ser una avería no puede hundir el MTBF de un equipo que no falló.
 */
export const cuentan = (fallas: FallaParaCalculo[]) =>
  fallas.filter((f) => !f.esFalsaAlarma);

/**
 * Media de horas entre dos marcas, saltándose los eventos a los que les falte
 * alguna. Si un evento sigue abierto, no se inventa un final: se deja fuera.
 */
function media(
  fallas: FallaParaCalculo[],
  desde: (f: FallaParaCalculo) => Date | null,
  hasta: (f: FallaParaCalculo) => Date | null,
): Tramo {
  let suma = 0;
  let n = 0;
  let est = 0;
  for (const f of fallas) {
    const a = desde(f);
    const b = hasta(f);
    if (!a || !b) continue;
    const ms = b.getTime() - a.getTime();
    /* Un tramo NEGATIVO es un dato mal metido —alguien puso la hora de
       restablecimiento antes que la de caída—. Se salta en vez de restar: un
       número negativo dentro de una media la envenena sin que se note. */
    if (ms < 0) continue;
    suma += ms;
    n++;
    if (f.ocurrioEsEstimado) est++;
  }
  if (n === 0) return vacio();
  return { horas: Number((suma / n / HORA).toFixed(1)), muestra: n, estimados: est };
}

/** Cuánto tardamos en ENTERARNOS. Dueño: el monitoreo y el púlpito. */
export function tiempoDeDeteccion(fallas: FallaParaCalculo[]): Tramo {
  /* Sólo los que tienen hora REAL de caída. Con los estimados el tramo saldría
     cero por construcción y diría que nos enteramos al instante — que es
     exactamente la mentira que este módulo viene a quitar. */
  const medidos = cuentan(fallas).filter((f) => !f.ocurrioEsEstimado);
  return media(medidos, (f) => f.occurredAt, (f) => f.detectedAt);
}

/** Cuánto tardamos en IR. Dueño: quien reparte el trabajo. */
export function tiempoDeRespuesta(fallas: FallaParaCalculo[]): Tramo {
  return media(cuentan(fallas), (f) => f.detectedAt, (f) => f.repairStartedAt);
}

/**
 * MTTR DE VERDAD: sólo el tiempo de trabajo.
 *
 * Si nadie apuntó cuándo empezó la reparación, se mide desde que se detectó —
 * es lo mejor disponible— pero ese caso NO es lo mismo, así que la pantalla
 * enseña la muestra al lado. Un indicador sin su muestra se cree a ciegas.
 */
export function tiempoDeReparacion(fallas: FallaParaCalculo[]): Tramo {
  return media(
    cuentan(fallas),
    (f) => f.repairStartedAt ?? f.detectedAt,
    (f) => f.restoredAt,
  );
}

/**
 * INDISPONIBILIDAD: lo que de verdad sufrió Producción.
 *
 * Es el número que hay que llevar a una reunión con ellos. Los otros tres son
 * para repartir responsabilidad dentro de mantenimiento.
 */
export function tiempoSinServicio(fallas: FallaParaCalculo[]): Tramo {
  return media(cuentan(fallas), (f) => f.occurredAt, (f) => f.restoredAt);
}

/**
 * MTBF: horas del periodo entre número de fallos.
 *
 * DEVUELVE null CON MENOS DE DOS FALLOS. Con uno solo no hay un intervalo
 * entre fallos: hay un fallo suelto. «El equipo aguanta 720 horas» sacado de
 * una muestra de uno suena a dato y es ruido.
 */
export function mtbfReal(fallas: FallaParaCalculo[], horasDelPeriodo: number): number | null {
  const n = cuentan(fallas).length;
  if (n < 2 || horasDelPeriodo <= 0) return null;
  return Number((horasDelPeriodo / n).toFixed(1));
}

/**
 * DISPONIBILIDAD sobre horas reales, no sobre medias.
 *
 *     disponibilidad = (horas del periodo − horas caído) / horas del periodo
 *
 * Se calcula así y NO con la fórmula `MTBF / (MTBF + MTTR)` porque esa
 * segunda es una aproximación que sólo vale si los fallos se reparten
 * uniformemente. Aquí se tienen las horas de verdad: usar la aproximación
 * teniendo el dato sería tirarlo.
 */
export function disponibilidadReal(
  fallas: FallaParaCalculo[],
  horasDelPeriodo: number,
): { pct: number | null; horasCaido: number; sinCerrar: number } {
  if (horasDelPeriodo <= 0) return { pct: null, horasCaido: 0, sinCerrar: 0 };
  const vivas = cuentan(fallas);
  let ms = 0;
  let sinCerrar = 0;
  for (const f of vivas) {
    if (!f.restoredAt) { sinCerrar++; continue; }
    const d = f.restoredAt.getTime() - f.occurredAt.getTime();
    if (d > 0) ms += d;
  }
  if (!vivas.length) return { pct: null, horasCaido: 0, sinCerrar: 0 };
  const horasCaido = ms / HORA;
  const pct = Math.max(0, ((horasDelPeriodo - horasCaido) / horasDelPeriodo) * 100);
  return {
    pct: Number(pct.toFixed(2)),
    horasCaido: Number(horasCaido.toFixed(1)),
    sinCerrar,
  };
}

/**
 * NIVEL DE SERVICIO — indicador ④ del ingeniero.
 *
 * QUÉ CONTESTA: de todas las horas del periodo, ¿qué porcentaje del parque
 * estuvo viendo?
 *
 *     nivel = 1 − (horas-equipo caídas / (equipos × horas del periodo))
 *
 * Se pondera POR EQUIPO y no se promedian porcentajes: si una cámara de
 * cuatrocientas estuvo caída un mes, promediar disponibilidades daría 99,75 %
 * — que es cierto y no dice nada—, mientras que esto responde a «cuánta
 * vigilancia hubo», que es la pregunta.
 *
 * `equiposEnServicio` NO puede ser cero: sin parque no hay nivel de servicio,
 * y devolver 100 % con cero equipos sería el peor de los datos posibles.
 */
export function nivelDeServicio(
  fallas: FallaParaCalculo[],
  equiposEnServicio: number,
  horasDelPeriodo: number,
): { pct: number | null; horasEquipoCaidas: number; equipos: number } {
  if (equiposEnServicio <= 0 || horasDelPeriodo <= 0) {
    return { pct: null, horasEquipoCaidas: 0, equipos: equiposEnServicio };
  }
  let ms = 0;
  for (const f of cuentan(fallas)) {
    if (!f.restoredAt) continue;
    const d = f.restoredAt.getTime() - f.occurredAt.getTime();
    if (d > 0) ms += d;
  }
  const horasEquipoCaidas = ms / HORA;
  const disponibles = equiposEnServicio * horasDelPeriodo;
  const pct = Math.max(0, ((disponibles - horasEquipoCaidas) / disponibles) * 100);
  return {
    pct: Number(pct.toFixed(2)),
    horasEquipoCaidas: Number(horasEquipoCaidas.toFixed(1)),
    equipos: equiposEnServicio,
  };
}

/**
 * LOS EQUIPOS QUE MÁS FALLAN, por número de averías reales.
 *
 * Se cuenta sobre eventos y no sobre órdenes: dos órdenes de la misma avería
 * —porque se reabrió— señalarían al equipo como el que más falla cuando falló
 * una vez.
 */
export function peoresPorFallas(
  fallas: FallaParaCalculo[],
  tope = 10,
): { assetId: string; fallas: number; horasCaido: number }[] {
  const m = new Map<string, { fallas: number; ms: number }>();
  for (const f of cuentan(fallas)) {
    const e = m.get(f.assetId) ?? { fallas: 0, ms: 0 };
    e.fallas++;
    if (f.restoredAt) {
      const d = f.restoredAt.getTime() - f.occurredAt.getTime();
      if (d > 0) e.ms += d;
    }
    m.set(f.assetId, e);
  }
  return [...m.entries()]
    .map(([assetId, v]) => ({
      assetId,
      fallas: v.fallas,
      horasCaido: Number((v.ms / HORA).toFixed(1)),
    }))
    .sort((a, b) => b.fallas - a.fallas || b.horasCaido - a.horasCaido)
    .slice(0, tope);
}
