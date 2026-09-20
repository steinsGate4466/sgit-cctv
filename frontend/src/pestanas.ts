/**
 * PANTALLAS QUE SON PESTAÑAS DE OTRA — bloque 118.
 *
 * =============================================================================
 *  DE DÓNDE SALE
 * =============================================================================
 *  La auditoría de estructura del bloque 117 encontró **cuatro entradas de menú
 *  para un solo objeto**: «Órdenes (OM)», «Preventivo», «Correctivo» y
 *  «Órdenes de mejora» — las tres últimas filtran las mismas órdenes por tipo.
 *
 *  En ISO 14224 preventivo y correctivo NO son módulos: son **clases del mismo
 *  evento de mantenimiento**. Tratarlas como pantallas separadas obliga a quien
 *  busca una orden a mirar en cuatro sitios, y ninguno de los cuatro contiene
 *  todas.
 *
 *  Lo mismo con «Dashboard» e «Indicadores»: dos pantallas de cifras, el mismo
 *  permiso, la misma audiencia. «¿Dónde miro los números?» tenía dos
 *  respuestas, que es lo mismo que no tener ninguna.
 *
 * =============================================================================
 *  LO QUE **NO** SE JUNTÓ, Y POR QUÉ
 * =============================================================================
 *  «Resumen de planta» y «Estado por Tren» parecían el tercer solapamiento.
 *  Al mirar los permisos NO lo son: la primera abre con `om.mirar` —Producción—
 *  y la segunda con `dashboard.read` —Mantenimiento—. Es la misma información
 *  para **dos audiencias distintas**, y juntarlas dejaría a Producción sin su
 *  pantalla.
 *
 *  > Dos pantallas parecidas con audiencias distintas no son un duplicado.
 *  > Mirar sólo el contenido lo habría dado por bueno; lo que lo decidió fue
 *  > mirar QUIÉN entra.
 *
 * =============================================================================
 *  POR QUÉ NO SE BORRAN LAS PANTALLAS
 * =============================================================================
 *  Las rutas siguen existiendo y las pantallas siguen enteras: sólo dejan de
 *  tener entrada propia en el menú y se alcanzan por la pestaña de su padre.
 *  Borrar cuatro pantallas que funcionan para simplificar un menú sería
 *  cambiar un problema pequeño por uno grande.
 */

export interface Pestana {
  ruta: string;
  texto: string;
  /** Permiso que hace falta para verla. Sin él, la pestaña no se pinta. */
  permiso?: string;
}

/** ruta del padre -> sus pestañas, en el orden en que se leen. */
export const PESTANAS: Record<string, Pestana[]> = {
  /* EL CICLO DE UNA ORDEN, EN EL ORDEN EN QUE OCURRE: primero todas, después
     las que nacen de un plan, las que nacen de una avería y las de mejora. */
  '/maintenance': [
    { ruta: '/maintenance', texto: 'Todas' },
    { ruta: '/preventive', texto: 'Preventivo', permiso: 'wo.read' },
    { ruta: '/corrective', texto: 'Correctivo', permiso: 'wo.read' },
    { ruta: '/improvements', texto: 'Mejora', permiso: 'wo.read' },
  ],
  /* ANÁLISIS primero, INDICADORES después: el tablero explica qué está
     pasando; los indicadores dicen si se cumple la meta. Ese es el orden en
     que se usan, no al revés. */
  '/dashboard': [
    { ruta: '/dashboard', texto: 'Análisis' },
    { ruta: '/indicadores', texto: 'Indicadores', permiso: 'dashboard.read' },
  ],
};

/** El padre de una pantalla, si es pestaña de alguien. */
export function padreDe(ruta: string): string | null {
  for (const [padre, hijas] of Object.entries(PESTANAS)) {
    if (padre === ruta) return null;              // el padre no es hija de sí mismo
    if (hijas.some((h) => h.ruta === ruta)) return padre;
  }
  return null;
}

/** Las pestañas que tocan a una pantalla, sea padre o hija. */
export function pestanasDe(ruta: string): Pestana[] {
  if (PESTANAS[ruta]) return PESTANAS[ruta];
  const padre = padreDe(ruta);
  return padre ? PESTANAS[padre] : [];
}
