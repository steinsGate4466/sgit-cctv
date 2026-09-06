/* =============================================================================
   BLOQUE 96 · LOS ROLES QUE SE DESVÍAN DE SU PLANTILLA
   -----------------------------------------------------------------------------
   DE DÓNDE SALE. El usuario entró con «Jefe de línea (Producción)» y le salía
   media gestión del mantenimiento: Hojas de ruta, Preventivo, Correctivo,
   Dashboard, Indicadores, Exportar… Y a la vez NO podía abrir una orden.

   La causa, ya escrita en el bloque 90 y nunca cerrada:

   > **Las plantillas sólo se aplican AL CREAR un rol.** A los ya creados no
   > les llega nada, así que un rol viejo deriva de su plantilla en silencio:
   > no lo ve el compilador, ni las pruebas, ni los verificadores.

   Es la misma familia que el selector de CSS muerto del bloque 89: nada se
   rompe, nada sale en rojo, y lo que se ve es un comportamiento raro que nadie
   sabe explicar. Aquí además **falla ABRIENDO**, que es el peor modo: el rol
   se queda con permisos de más.

   -----------------------------------------------------------------------------
   POR QUÉ ESTO ES UN CÁLCULO PURO Y NO UNA CONSULTA

   Para poder probarlo sin base de datos, y sobre todo para que la MISMA
   función conteste las dos preguntas: «¿qué le sobra y qué le falta?» —lo que
   se enseña— y «¿qué hay que guardar?» —lo que se aplica—. Si fueran dos
   cálculos, un día enseñaría una cosa y guardaría otra, que es exactamente la
   forma de que nadie se fíe del botón.
============================================================================= */

export interface DesfaseDeRol {
  rolId: string;
  nombre: string;
  /** `null` cuando ningún nombre de plantilla coincide. */
  plantilla: string | null;
  /** Está en la plantilla y el rol NO lo tiene. */
  faltan: string[];
  /** El rol lo tiene y la plantilla NO. */
  sobran: string[];
  /** Cuántas personas usan este rol. Cambiarlo les afecta a todas. */
  usuarios: number;
  /** Un rol de sistema no se toca desde aquí. */
  sistema: boolean;
}

export interface RolParaComparar {
  id: string;
  nombre: string;
  permisos: string[];
  usuarios: number;
  sistema: boolean;
}

export interface PlantillaParaComparar {
  nombre: string;
  permisos: string[];
}

/**
 * Compara un rol con su plantilla, emparejando POR NOMBRE.
 *
 * Y sí, el nombre es un dato de usuario que se puede editar — la regla del
 * bloque 62 dice que una MIGRACIÓN nunca reparte permisos por nombre. Esto no
 * es una migración: es una comparación que se le ENSEÑA a una persona para que
 * decida. Si el nombre no coincide, no se inventa nada: se devuelve
 * `plantilla: null` y se dice en pantalla. Fallar diciendo «no sé» es
 * aceptable; fallar aplicando la plantilla equivocada, no.
 */
export function compararConPlantilla(
  rol: RolParaComparar,
  plantillas: PlantillaParaComparar[],
): DesfaseDeRol {
  const p = plantillas.find((x) => x.nombre === rol.nombre);
  if (!p) {
    return {
      rolId: rol.id, nombre: rol.nombre, plantilla: null,
      faltan: [], sobran: [], usuarios: rol.usuarios, sistema: rol.sistema,
    };
  }
  const tiene = new Set(rol.permisos);
  const debe = new Set(p.permisos);
  return {
    rolId: rol.id,
    nombre: rol.nombre,
    plantilla: p.nombre,
    faltan: p.permisos.filter((c) => !tiene.has(c)).sort(),
    sobran: rol.permisos.filter((c) => !debe.has(c)).sort(),
    usuarios: rol.usuarios,
    sistema: rol.sistema,
  };
}

/** ¿Este rol está desviado de su plantilla? */
export const estaDesfasado = (d: DesfaseDeRol): boolean =>
  d.plantilla !== null && (d.faltan.length > 0 || d.sobran.length > 0);

/**
 * El informe completo.
 *
 * **Se devuelven TODOS los roles, no sólo los desviados.** Una lista que sólo
 * enseña problemas no deja ver los que están bien ni los que no tienen
 * plantilla — y esos son justo los que hay que revisar a mano. La pantalla
 * separa los tres montones; el servidor no decide por ella.
 */
export function informeDeDesfase(
  roles: RolParaComparar[],
  plantillas: PlantillaParaComparar[],
): DesfaseDeRol[] {
  return roles.map((r) => compararConPlantilla(r, plantillas));
}

/**
 * Motivo por el que NO se puede poner al día este rol, o `null`.
 *
 * Devuelve el MOTIVO y no un booleano por la razón de siempre: un botón
 * apagado sin explicación se lee como software roto (bloque 67).
 */
export function motivoParaNoPonerAlDia(d: DesfaseDeRol): string | null {
  if (d.plantilla === null) {
    return `«${d.nombre}» no coincide con ninguna plantilla, así que no hay con qué compararlo. `
      + 'Puede ser un rol hecho a medida —y entonces está bien— o un rol renombrado. '
      + 'Se revisa a mano: el sistema no adivina cuál era su plantilla.';
  }
  if (!estaDesfasado(d)) {
    return `«${d.nombre}» ya coincide con su plantilla. No hay nada que poner al día.`;
  }
  return null;
}
