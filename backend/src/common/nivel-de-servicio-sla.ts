/* =============================================================================
   BLOQUE 98 · SATISFACCIÓN DEL SERVICIO — SLA por prioridad
   -----------------------------------------------------------------------------
   LO PIDIÓ EL USUARIO: «un tablero con métrica de satisfacción de servicio, y
   que cuando se abra se vean los problemas resueltos».

   Y tiene razón de fondo, con dos correcciones de método que vienen de norma:

   -----------------------------------------------------------------------------
   1 · SATISFACCIÓN NO ES UNA ENCUESTA

   Preguntar «¿estás contento?» se contesta según el humor del día, se
   responde con muestras de dos personas y no se puede auditar. La
   satisfacción de un servicio **se mide por promesas cumplidas**: es
   Service Level Management de ITIL, y en mantenimiento industrial son los
   indicadores organizativos de la EN 15341.

   Aquí el proveedor es Mantenimiento y el cliente es PRODUCCIÓN. La promesa
   es: «una cámara CRÍTICA se atiende en X horas y se restituye en Y».

   -----------------------------------------------------------------------------
   2 · SIN PROMESA NO HAY INCUMPLIMIENTO

   Hoy el sistema mide el MTTR pero no lo compara contra nada. Un MTTR de
   4 h no es bueno ni malo: depende de lo que se prometió. Por eso lo primero
   es DECLARAR el acuerdo, y mientras no esté declarado el tablero dice
   «SLA sin fijar» — no inventa un plazo razonable. Misma decisión que la meta
   del reparto (bloque 94) y que los cortes de criticidad (bloque 76).

   -----------------------------------------------------------------------------
   3 · DOS RELOJES, NO UNO

       reportedAt → primera atención   =  RESPUESTA    (¿alguien lo cogió?)
       reportedAt → resolvedAt         =  RESTITUCIÓN  (¿volvió a verse?)

   Se separan porque tienen dueños distintos. Una avería que se atiende en
   diez minutos y tarda dos días porque falta el repuesto NO es un problema
   de reacción: es de almacén. Con un solo número las dos se confunden y se
   presiona a quien no puede arreglarlo.

   -----------------------------------------------------------------------------
   4 · LO RESUELTO VA PRIMERO

   Un tablero que sólo enseña deuda se deja de mirar en dos semanas, y
   entonces no sirve el día que la deuda importa. Se abre con lo que se
   cumplió y debajo lo que falta. En ITIL eso es *value demonstration*; aquí
   es la misma regla del bloque 9 con otras palabras.
============================================================================= */

export type Prioridad = 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';

export const PRIORIDADES: Prioridad[] = ['CRITICA', 'ALTA', 'MEDIA', 'BAJA'];

/** Lo prometido para una prioridad, en horas. */
export interface PlazoSla {
  /** Desde que se reporta hasta que alguien la coge. */
  respuestaH: number;
  /** Desde que se reporta hasta que el servicio vuelve. */
  restitucionH: number;
}

export type AcuerdoSla = Record<Prioridad, PlazoSla>;

/**
 * PROPUESTA, no decisión. Es el punto de partida para que el tablero arranque
 * el primer día; la pantalla lo dice con esas palabras y la migración NO
 * inserta ninguna fila. Insertarla convertiría una propuesta en un compromiso
 * que nadie firmó — y este número es contra el que se juzga al área.
 */
export const SLA_PROPUESTO: AcuerdoSla = {
  CRITICA: { respuestaH: 1, restitucionH: 8 },
  ALTA: { respuestaH: 4, restitucionH: 24 },
  MEDIA: { respuestaH: 8, restitucionH: 72 },
  BAJA: { respuestaH: 24, restitucionH: 168 },
};

/** Una incidencia, con lo justo para medirla. */
export interface IncidenciaMedible {
  id: string;
  code: string;
  priority: Prioridad;
  reportedAt: Date;
  /** Cuándo se le abrió la primera orden. `null` = todavía nadie la cogió. */
  atendidaEn: Date | null;
  /** Cuándo volvió el servicio. `null` = sigue viva. */
  resolvedAt: Date | null;
}

const horas = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 3_600_000;

export interface Cumplimiento {
  prioridad: Prioridad;
  /** Cuántas entraron en el periodo. */
  total: number;
  /** De las resueltas, cuántas dentro del plazo de restitución. */
  enPlazo: number;
  fueraDePlazo: number;
  /** Resueltas en el periodo. El resto siguen vivas. */
  resueltas: number;
  /** `null` cuando no hubo ninguna: no se inventa un 100 %. */
  pct: number | null;
  plazo: PlazoSla;
}

/**
 * Cumplimiento por prioridad.
 *
 * **Se mide sobre las RESUELTAS, y las vivas se cuentan aparte.** Meter las
 * vivas como incumplidas castigaría dos veces a la que lleva una hora abierta
 * dentro de su plazo; ignorarlas escondería la que lleva tres semanas. Salen
 * en su propio bloque, que es `enRiesgo()`.
 */
export function cumplimientoPorPrioridad(
  incidencias: IncidenciaMedible[],
  sla: AcuerdoSla,
): Cumplimiento[] {
  return PRIORIDADES.map((p) => {
    const suyas = incidencias.filter((i) => i.priority === p);
    const resueltas = suyas.filter((i) => i.resolvedAt);
    const plazo = sla[p];
    const enPlazo = resueltas.filter(
      (i) => horas(i.reportedAt, i.resolvedAt!) <= plazo.restitucionH,
    ).length;
    return {
      prioridad: p,
      total: suyas.length,
      resueltas: resueltas.length,
      enPlazo,
      fueraDePlazo: resueltas.length - enPlazo,
      /* `null` y no 0 cuando no hubo ninguna. Un 0 % en una prioridad sin
         incidencias diría que se falló en todas — la peor mentira posible en
         un tablero que va a un comité. */
      pct: resueltas.length ? Math.round((enPlazo / resueltas.length) * 100) : null,
      plazo,
    };
  });
}

export interface EnRiesgo {
  id: string;
  code: string;
  prioridad: Prioridad;
  horasAbierta: number;
  /** Ya se pasó del plazo prometido. */
  vencida: boolean;
  /** Todavía nadie le abrió una orden. */
  sinAtender: boolean;
}

/**
 * Las que siguen vivas, con su reloj corriendo.
 *
 * Es lo ACCIONABLE del tablero: sobre lo ya resuelto no se puede hacer nada,
 * sobre esto sí. Van ordenadas por lo que peor está, no por fecha.
 */
export function enRiesgo(
  vivas: IncidenciaMedible[],
  sla: AcuerdoSla,
  ahora = new Date(),
): EnRiesgo[] {
  return vivas
    .map((i) => {
      const h = horas(i.reportedAt, ahora);
      return {
        id: i.id,
        code: i.code,
        prioridad: i.priority,
        horasAbierta: Math.round(h * 10) / 10,
        vencida: h > sla[i.priority].restitucionH,
        sinAtender: !i.atendidaEn,
      };
    })
    /* Lo peor arriba: primero lo vencido, luego lo que nadie ha cogido, luego
       lo que lleva más tiempo. Ordenar por fecha dejaría una crítica de hoy
       debajo de una baja de hace un mes. */
    .sort((a, b) =>
      Number(b.vencida) - Number(a.vencida)
      || Number(b.sinAtender) - Number(a.sinAtender)
      || b.horasAbierta - a.horasAbierta);
}

/**
 * Motivo por el que NO se puede guardar el acuerdo, o `null`.
 *
 * Dos comprobaciones que no son burocracia:
 *  · Restituir no puede ser ANTES que responder: el servicio no vuelve antes
 *    de que alguien lo mire. Un acuerdo así no se puede cumplir nunca.
 *  · Una prioridad más alta no puede tener un plazo más largo que una más
 *    baja: diría que lo crítico corre menos prisa, y entonces el reparto de
 *    prioridades deja de significar nada.
 */
export function motivoParaNoGuardarSla(a: Partial<AcuerdoSla>): string | null {
  for (const p of PRIORIDADES) {
    const v = a[p];
    if (!v) return `Falta el plazo de la prioridad ${p}.`;
    if (!Number.isFinite(v.respuestaH) || !Number.isFinite(v.restitucionH)) {
      return `Los plazos de ${p} tienen que ser números de horas.`;
    }
    if (v.respuestaH <= 0 || v.restitucionH <= 0) {
      return `Los plazos de ${p} tienen que ser mayores que cero.`;
    }
    if (v.restitucionH < v.respuestaH) {
      return `En ${p}, restituir (${v.restitucionH} h) no puede ser antes que responder `
        + `(${v.respuestaH} h): el servicio no vuelve antes de que alguien lo mire.`;
    }
  }
  for (let i = 0; i < PRIORIDADES.length - 1; i++) {
    const alta = a[PRIORIDADES[i]]!;
    const baja = a[PRIORIDADES[i + 1]]!;
    if (alta.restitucionH > baja.restitucionH) {
      return `${PRIORIDADES[i]} tiene un plazo mayor que ${PRIORIDADES[i + 1]}. `
        + 'Lo más crítico no puede correr menos prisa.';
    }
  }
  return null;
}
