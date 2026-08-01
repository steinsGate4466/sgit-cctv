// ============================================================================
//  RUTINA PREVENTIVA — lógica pura.
//
//  Se separa para poder probarla sin base de datos. Lo que decide si una
//  rutina está completa y si hay que proponer un correctivo tiene que ser
//  comprobable: de eso depende que una orden se pueda cerrar o no.
// ============================================================================

export type Resultado = 'OK' | 'NO_OK' | 'NO_APLICA';

export interface PuntoRutina {
  id: string;
  text: string;
  critical: boolean;
  sequence?: number;
}

export interface RespuestaRutina {
  itemId: string;
  result: Resultado;
  note?: string | null;
}

export interface EstadoRutina {
  total: number;
  respondidos: number;
  ok: number;
  noOk: number;
  noAplica: number;
  /** Puntos sin responder. Son los que impiden cerrar. */
  faltan: PuntoRutina[];
  /** NO OK sin explicación. Un "no conforme" mudo no sirve para nada. */
  sinExplicar: PuntoRutina[];
  /** NO OK en puntos marcados como críticos: candidatos a correctivo. */
  paraCorrectivo: PuntoRutina[];
  completa: boolean;
  porcentaje: number;
}

/**
 * Estado de la rutina a partir de sus puntos y lo respondido.
 *
 * REGLAS, Y POR QUÉ
 *  - "No aplica" CUENTA como respondido: que un punto no aplique a este equipo
 *    concreto es una respuesta legítima, no una omisión.
 *  - Un NO OK exige nota. Sin ella no se puede cerrar: "no conforme" a secas
 *    no le dice nada a quien lea la orden dentro de seis meses.
 *  - Solo los puntos CRÍTICOS proponen correctivo. Si todo hallazgo generara
 *    una orden, una tarde de preventivos llenaría el tablero de trabajo que
 *    nadie pidió y dejaría de ser creíble.
 */
export function estadoRutina(
  puntos: PuntoRutina[],
  respuestas: RespuestaRutina[],
): EstadoRutina {
  const porItem = new Map(respuestas.map((r) => [r.itemId, r] as const));

  let ok = 0, noOk = 0, noAplica = 0;
  const faltan: PuntoRutina[] = [];
  const sinExplicar: PuntoRutina[] = [];
  const paraCorrectivo: PuntoRutina[] = [];

  for (const p of puntos) {
    const r = porItem.get(p.id);
    if (!r) { faltan.push(p); continue; }

    if (r.result === 'OK') ok++;
    else if (r.result === 'NO_APLICA') noAplica++;
    else {
      noOk++;
      if (!r.note || !r.note.trim()) sinExplicar.push(p);
      if (p.critical) paraCorrectivo.push(p);
    }
  }

  const respondidos = puntos.length - faltan.length;
  return {
    total: puntos.length,
    respondidos,
    ok, noOk, noAplica,
    faltan, sinExplicar, paraCorrectivo,
    completa: faltan.length === 0 && sinExplicar.length === 0,
    // Sin puntos, 100: una rutina vacía no está "a medias", es que no hay
    // rutina. Poner 0 haría parecer que falta trabajo que nadie definió.
    porcentaje: puntos.length ? Math.round((respondidos / puntos.length) * 100) : 100,
  };
}

/**
 * Motivo por el que la rutina no deja cerrar, en una frase para el técnico.
 * Devuelve null si se puede cerrar.
 */
export function motivoBloqueo(e: EstadoRutina): string | null {
  if (e.faltan.length) {
    const nombres = e.faltan.slice(0, 3).map((p) => `"${p.text}"`).join(', ');
    return e.faltan.length <= 3
      ? `Falta responder: ${nombres}.`
      : `Faltan ${e.faltan.length} puntos por responder, entre ellos ${nombres}.`;
  }
  if (e.sinExplicar.length) {
    const nombres = e.sinExplicar.slice(0, 3).map((p) => `"${p.text}"`).join(', ');
    return `Marcaste como NO conforme sin explicar: ${nombres}. Di qué encontraste.`;
  }
  return null;
}

/** Texto de la actividad del correctivo que se propone desde un hallazgo. */
export function actividadDesdeHallazgo(
  punto: PuntoRutina,
  nota: string | null | undefined,
  codigoActivo?: string | null,
): string {
  const base = `Hallazgo en preventivo${codigoActivo ? ' de ' + codigoActivo : ''}: ${punto.text}.`;
  return nota?.trim() ? `${base} ${nota.trim()}` : base;
}
