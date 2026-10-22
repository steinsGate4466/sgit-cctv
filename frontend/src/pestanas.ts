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

type Can = (permiso: string) => boolean;
type PuedePestana = (can: Can, user: { ambitoTrenes?: unknown[] | null } | null | undefined) => boolean;

export interface Pestana {
  ruta: string;
  texto: string;
  /** Permiso que hace falta para verla. Sin él, la pestaña no se pinta. */
  permiso?: string;
  /** Optimización 21/10 · la regla completa cuando un permiso solo no basta
   *  (las pantallas que pasaron de entrada de menú a pestaña conservan la suya). */
  puede?: PuedePestana;
}

const alguno = (...ps: string[]): PuedePestana => (can) => ps.some((p) => can(p));

/** ruta del padre -> sus pestañas, en el orden en que se leen. */
export const PESTANAS: Record<string, Pestana[]> = {
  /* EL CICLO DE UNA ORDEN, EN EL ORDEN EN QUE OCURRE: primero todas, después
     las que nacen de un plan, las que nacen de una avería y las de mejora.
     Optimización 21/10: Avance y Campañas eran entradas de menú aparte y son
     las MISMAS órdenes vistas de otra forma. */
  '/maintenance': [
    { ruta: '/maintenance', texto: 'Todas' },
    { ruta: '/preventive', texto: 'Preventivo', permiso: 'wo.read' },
    { ruta: '/corrective', texto: 'Correctivo', permiso: 'wo.read' },
    { ruta: '/improvements', texto: 'Mejora', permiso: 'wo.read' },
    { ruta: '/tablero-om', texto: 'Avance', permiso: 'om.mirar' },
    { ruta: '/campanas', texto: 'Campañas', puede: alguno('asset.read', 'wo.read') },
  ],
  /* ANÁLISIS primero, INDICADORES después, y el Excel al final. */
  '/dashboard': [
    { ruta: '/dashboard', texto: 'Análisis' },
    { ruta: '/indicadores', texto: 'Indicadores', permiso: 'dashboard.read' },
    { ruta: '/exportar', texto: 'Exportar a Excel', permiso: 'wo.read' },
  ],
  /* «¿Cómo está el tren?» — lo mío, toda la planta, o comparar. */
  '/por-tren': [
    { ruta: '/mi-tren', texto: 'Mi tren',
      puede: (can, u) => (u?.ambitoTrenes?.length ?? 0) > 0 && can('dashboard.read') },
    { ruta: '/vista-general', texto: 'Toda la planta', permiso: 'om.mirar' },
    { ruta: '/por-tren', texto: 'Comparar trenes' },
  ],
  /* «Cómo se hace el trabajo»: el recorrido de una OM, las hojas de ruta del
     preventivo, el vocabulario para cerrar y las mejoras que propone campo. */
  '/guia': [
    { ruta: '/guia', texto: 'Cómo se trabaja' },
    { ruta: '/hojas-de-ruta', texto: 'Hojas de ruta', permiso: 'wo.read' },
    { ruta: '/catalogos', texto: 'Catálogo de fallas', permiso: 'location.manage' },
    { ruta: '/mejoras-procedimiento', texto: 'Mejoras propuestas', puede: alguno('procedimiento.manage', 'wo.update') },
  ],
  '/assets': [
    { ruta: '/assets', texto: 'En planta' },
    { ruta: '/retirados', texto: 'Retirados' },
  ],
  /* Las dos miden qué le falta a la información: huecos y datos que no cuadran. */
  '/mapeo': [
    { ruta: '/mapeo', texto: 'Fichas por completar' },
    { ruta: '/salud-de-datos', texto: 'Datos que no cuadran', permiso: 'asset.update' },
  ],
  '/capacidad': [
    { ruta: '/capacidad', texto: 'Puertos libres' },
    { ruta: '/conexiones', texto: 'Qué está conectado', permiso: 'red.read' },
  ],
  '/mapa-de-red': [
    { ruta: '/mapa-de-red', texto: 'Mapa de red' },
    { ruta: '/topologia', texto: 'Puntos críticos' },
  ],
  '/inventory': [
    { ruta: '/inventory', texto: 'Repuestos' },
    { ruta: '/riesgo', texto: 'Obsolescencia', permiso: 'infra.read' },
  ],
  /* «Quién entra y con qué»: las personas, sus roles, sus sesiones y los aparatos. */
  '/users': [
    { ruta: '/users', texto: 'Usuarios' },
    { ruta: '/roles', texto: 'Roles', permiso: 'role.manage' },
    { ruta: '/sesiones', texto: 'Quién está dentro' },
    { ruta: '/equipos', texto: 'Equipos conocidos' },
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
