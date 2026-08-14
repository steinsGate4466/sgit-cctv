/* =============================================================================
   QUÉ PROCEDIMIENTO LE TOCA A ESTE EQUIPO — bloque 29
   -----------------------------------------------------------------------------
   Un procedimiento se escribe para un MODELO («DS-2CD2143 de Hikvision»), pero
   también vale escribir uno genérico para todas las cámaras. Cuando hay varios
   que encajan hay que elegir uno, y elegir mal significa enseñarle al técnico
   una instrucción que no corresponde a lo que tiene delante.

   La regla es la misma que en el resto del proyecto: GANA LO MÁS ESPECÍFICO.
   Marca y modelo > marca > tipo. Y si no hay ninguno, se dice que no hay —
   nunca se enseña el de otro modelo «porque se parece».
============================================================================= */

export interface ProcedimientoLike {
  id: string;
  tipoActivo: string;
  marca?: string | null;
  modelo?: string | null;
  activo?: boolean;
}

export interface EquipoLike {
  type: string;
  brand?: string | null;
  model?: string | null;
}

/** Normaliza para comparar: la marca se escribe «HIKVISION», «Hikvision»… */
const norm = (v?: string | null) => (v ?? '').trim().toLowerCase();

/**
 * Puntuación de encaje. -1 = no aplica.
 *   3 = marca y modelo coinciden
 *   2 = coincide la marca, el procedimiento no fija modelo
 *   1 = sólo el tipo de equipo
 */
export function puntuar(p: ProcedimientoLike, e: EquipoLike): number {
  if (p.activo === false) return -1;
  if (norm(p.tipoActivo) !== norm(e.type)) return -1;

  const pm = norm(p.marca);
  const pmo = norm(p.modelo);

  // Si el procedimiento fija marca, la del equipo tiene que ser ésa.
  if (pm && pm !== norm(e.brand)) return -1;
  // Idem con el modelo. Un procedimiento de un modelo concreto NO se enseña
  // para otro modelo aunque sea de la misma marca: los pasos cambian.
  if (pmo && pmo !== norm(e.model)) return -1;

  if (pm && pmo) return 3;
  if (pm) return 2;
  return 1;
}

/**
 * El que se le enseña al técnico. `null` si no hay ninguno: es preferible
 * decir «todavía nadie ha escrito cómo se restaura esto» que enseñar los
 * pasos de otro equipo.
 */
export function elegir<T extends ProcedimientoLike>(
  procedimientos: T[], equipo: EquipoLike,
): T | null {
  let mejor: T | null = null;
  let mejorPunto = 0;
  for (const p of procedimientos) {
    const punto = puntuar(p, equipo);
    // `>` y no `>=`: a igualdad gana el PRIMERO de la lista. Quien llama
    // ordena por fecha, así que a igual especificidad gana el más antiguo,
    // que es el que la gente ya conoce. Un empate no debe cambiar de
    // resultado según cómo venga ordenada la consulta.
    if (punto > mejorPunto) { mejor = p; mejorPunto = punto; }
  }
  return mejor;
}

/** Todos los que encajan, del más específico al más general. Para la pantalla
 *  de administración: enseña que hay un genérico y uno de modelo. */
export function aplicables<T extends ProcedimientoLike>(
  procedimientos: T[], equipo: EquipoLike,
): T[] {
  return procedimientos
    .map((p) => ({ p, punto: puntuar(p, equipo) }))
    .filter((x) => x.punto > 0)
    .sort((a, b) => b.punto - a.punto)
    .map((x) => x.p);
}
