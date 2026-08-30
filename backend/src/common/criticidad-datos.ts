import {
  clasificar, peorLetra, intervaloFinal,
  type Criticidad, type EntradaCriticidad, type LetraABC, type Nivel,
  type ParametrosCriticidad,
} from './criticidad-abc';

/* =============================================================================
   DE LOS DATOS DE PLANTA A LA LETRA — bloque 76
   =============================================================================

   QUÉ CIERRA ESTE ARCHIVO

   `criticidad-abc.ts` (bloque 73) sabe calcular la letra, pero hay que darle
   los cinco factores ya masticados. Nadie se los daba: el cálculo llevaba
   semanas escrito, con sus 26 pruebas en verde, y **no lo llamaba ni un solo
   archivo del sistema**.

   Es el error que este proyecto tiene escrito cuatro veces con otras palabras:
   *modelo + cálculo ≠ función. Sin pantalla, no existe.* Aquí es la pieza que
   faltaba en medio: sin esto no hay pantalla posible, porque no hay nada que
   pintar.

   -----------------------------------------------------------------------------
   POR QUÉ ES UNA FUNCIÓN PURA Y NO ESTÁ DENTRO DEL SERVICIO

   Porque la parte difícil no es leer de la base: es la CASCADA. Un tablero
   hereda del switch, que hereda de sus cámaras. Eso hay que poder probarlo con
   cuatro objetos escritos a mano, no montando media planta en una base de
   pruebas — que es lo que hace que una prueba así se acabe borrando.

   Aquí no entra Prisma. Entran listas y sale un mapa.

   -----------------------------------------------------------------------------
   DE DÓNDE SALE CADA FACTOR, Y QUÉ SE PREGUNTA Y QUÉ NO

     IMPACTO OPERACIONAL   se hereda de la ZONA (lo declaró Producción en el
                           bloque 26) y el activo puede anularlo.
     RIESGO PARA PERSONAS  se hereda de la ZONA y el activo puede anularlo.
     RESPALDO              se CALCULA: cuántos equipos más cubren el mismo sitio.
     DIFICULTAD DE ACCESO  se CALCULA: del medio de acceso ya declarado (b41).
     FRECUENCIA DE FALLA   se CALCULA: incidencias de los últimos 12 meses.
     SOPORTE               se CALCULA: quién cuelga de quién.

   Sólo se le pregunta a una persona lo que de verdad no se puede deducir. Un
   formulario que pide un dato que el sistema ya tiene es un formulario que se
   rellena mal, porque quien lo rellena sabe que es redundante.
============================================================================= */

/** Lo que se hereda hacia abajo por el árbol de ubicaciones. */
export interface UbicacionCrit {
  id: string;
  parentId: string | null;
  /** Lo que declaró Producción en el bloque 26. */
  criticidadProduccion: 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA' | null;
  /** Bloque 76: ¿aquí puede resultar herida una persona? */
  riesgoPersonas: boolean | null;
  riesgoPersonasMotivo: string | null;
  name?: string | null;
}

/** Un equipo, con lo justo para clasificarlo. */
export interface ActivoCrit {
  id: string;
  assetCode: string;
  type: string;
  locationId: string | null;
  /** Bloque 41. `null` NO es «a pie»: es «nadie lo ha declarado». */
  medioAcceso: string | null;
  /** Anulaciones del activo. `null` = vale lo de la zona. */
  impactoOperacional: number | null;
  riesgoPersonas: boolean | null;
}

/** Todo lo que hace falta para resolver la planta entera de una vez. */
export interface EntradaDePlanta {
  activos: ActivoCrit[];
  ubicaciones: UbicacionCrit[];
  /** assetId → cuántas incidencias tuvo en los últimos 12 meses. */
  fallasPorActivo: Map<string, number>;
  /**
   * QUIÉN CUELGA DE QUIÉN: sostenedor → los que dependen de él.
   * Se arma con los puertos del switch, el grabador de cada cámara, los
   * circuitos eléctricos y los componentes. Todo eso ya existe en el sistema.
   */
  dependientes: Map<string, string[]>;
}

/** El resultado por equipo, con de dónde salió cada dato para poder explicarlo. */
export interface CriticidadDeActivo {
  criticidad: Criticidad;
  /** De dónde salió el impacto: del propio equipo, de su zona, o de ningún sitio. */
  origenImpacto: 'ACTIVO' | 'ZONA' | 'SIN_DECLARAR';
  origenRiesgo: 'ACTIVO' | 'ZONA' | 'SIN_DECLARAR';
  /** Los números que se le pasaron al cálculo, para poder enseñarlos. */
  entrada: EntradaCriticidad;
  /** Nombre de la zona de la que heredó, si heredó. */
  zonaNombre: string | null;
  riesgoMotivo: string | null;
}

/* -----------------------------------------------------------------------------
   LAS TRADUCCIONES — cada una convierte un dato que ya existe en un nivel 1-4
----------------------------------------------------------------------------- */

/**
 * LO QUE DIJO PRODUCCIÓN → IMPACTO OPERACIONAL.
 *
 * No se inventa una escala nueva: `criticidadProduccion` ya responde
 * exactamente a «qué le pasa a la producción si esta zona se queda a ciegas»,
 * que es la misma pregunta. Pedirla otra vez con otras palabras daría dos
 * respuestas distintas para el mismo hecho, y a los tres meses nadie sabría
 * cuál mirar.
 */
export function impactoDeLaZona(c: UbicacionCrit['criticidadProduccion']): Nivel | null {
  if (c === 'CRITICA') return 4;   // se para la línea
  if (c === 'ALTA') return 3;      // se baja el ritmo
  if (c === 'MEDIA') return 2;     // se opera con vigía
  if (c === 'BAJA') return 1;      // no pasa nada
  return null;                     // nadie lo ha declarado
}

/**
 * CÓMO SE LLEGA → DIFICULTAD DE ACCESO.
 *
 * Sale de `Asset.medioAcceso`, que se declara desde el bloque 41 y ya se usa
 * para costear el manlift.
 *
 * `null` y `OTRO` valen 2 y NO 1, a propósito. `OTRO` está descrito en el
 * esquema como «válvula de escape; cuenta como no resuelto, no como a pie», y
 * un equipo sin declarar tampoco es un equipo al que se llegue andando. Poner
 * 1 sería suponer lo más cómodo justo donde falta información, y este proyecto
 * falla siempre hacia el lado seguro.
 */
export function dificultadDelAcceso(medio: string | null): Nivel {
  switch (medio) {
    case 'A_PIE': return 1;
    case 'ESCALERA': return 2;
    case 'ANDAMIO': return 3;
    case 'LINEA_VIDA': return 3;
    case 'MANLIFT': return 3;
    case 'GRUA': return 4;          // además del equipo, hay que parar la grúa
    default: return 2;              // OTRO y sin declarar
  }
}

/**
 * QUÉ EQUIPOS SOSTIENEN A OTROS.
 *
 * Es la cadena de planta escrita en `docs/ESTANDAR_ACTIVOS.md`:
 *
 *     220 V (tablero + circuito) → SWITCH PoE → cámaras · antenas · NVR
 *
 * Un equipo de esta lista no vigila nada por sí mismo: preguntarle «¿qué pasa
 * si dejas de ver?» no tiene respuesta. Su letra sale de lo que sostiene.
 */
export const TIPOS_DE_SOPORTE = new Set([
  'SWITCH', 'NVR', 'ROUTER', 'FIREWALL', 'SERVER', 'UPS', 'PSU',
  'TABLERO_ELECTRICO', 'CABINET',
]);

/**
 * QUÉ EQUIPOS VIGILAN UN SITIO.
 *
 * Sólo entre éstos tiene sentido contar respaldo: dos cámaras mirando lo mismo
 * se cubren la una a la otra. Dos switches en la misma sala NO se cubren —
 * cada uno tiene enchufadas sus propias cámaras.
 */
export const TIPOS_QUE_VIGILAN = new Set(['CAMERA']);

/* -----------------------------------------------------------------------------
   EL RECORRIDO
----------------------------------------------------------------------------- */

/**
 * Sube por el árbol de ubicaciones hasta encontrar quien haya declarado algo.
 *
 * El corte a 20 saltos no es paranoia gratuita: si alguien crea un ciclo desde
 * la pantalla de Ubicaciones —A padre de B y B padre de A— sin esto el
 * servidor se queda girando y la pantalla nunca responde. El árbol real de
 * planta tiene seis niveles.
 */
function heredarDeLaZona(
  locationId: string | null,
  porId: Map<string, UbicacionCrit>,
): { impacto: Nivel | null; riesgo: boolean | null; motivo: string | null; nombre: string | null } {
  let impacto: Nivel | null = null;
  let riesgo: boolean | null = null;
  let motivo: string | null = null;
  let nombre: string | null = null;

  let actual = locationId ? porId.get(locationId) : undefined;
  let saltos = 0;
  while (actual && saltos < 20) {
    if (impacto === null) {
      const i = impactoDeLaZona(actual.criticidadProduccion);
      if (i !== null) { impacto = i; nombre = actual.name ?? null; }
    }
    if (riesgo === null && actual.riesgoPersonas !== null && actual.riesgoPersonas !== undefined) {
      riesgo = actual.riesgoPersonas;
      motivo = actual.riesgoPersonasMotivo ?? null;
      if (!nombre) nombre = actual.name ?? null;
    }
    if (impacto !== null && riesgo !== null) break;
    actual = actual.parentId ? porId.get(actual.parentId) : undefined;
    saltos++;
  }
  return { impacto, riesgo, motivo, nombre };
}

/**
 * CLASIFICA LA PLANTA ENTERA.
 *
 * Devuelve un mapa `assetId → resultado`. Se hace de una vez y no equipo por
 * equipo porque el respaldo de una cámara depende de sus vecinas y la letra de
 * un switch depende de sus cámaras: resolverlos por separado obligaría a
 * recorrer la planta una vez por equipo.
 *
 * LA CASCADA SE RESUELVE CON MEMORIA Y CON GUARDA DE CICLO. Un tablero hereda
 * del switch, que hereda de sus cámaras. Si alguien declarara por error que A
 * cuelga de B y B de A, la recursión no terminaría; el conjunto `enCurso` lo
 * corta devolviendo `SIN_CLASIFICAR` para ese equipo en vez de tumbar el
 * servidor. Un fallo de datos no puede dejar la pantalla en blanco.
 */
export function clasificarPlanta(
  datos: EntradaDePlanta,
  parametros: ParametrosCriticidad,
): Map<string, CriticidadDeActivo> {
  const ubicPorId = new Map(datos.ubicaciones.map((u) => [u.id, u]));
  const activoPorId = new Map(datos.activos.map((a) => [a.id, a]));

  /* Cuántos equipos VIGILANTES hay en cada sitio. Se cuenta una vez y se
     consulta, en vez de recorrer la lista por cada cámara. */
  const vigilantesPorSitio = new Map<string, number>();
  for (const a of datos.activos) {
    if (!a.locationId || !TIPOS_QUE_VIGILAN.has(a.type)) continue;
    vigilantesPorSitio.set(a.locationId, (vigilantesPorSitio.get(a.locationId) ?? 0) + 1);
  }

  const resultado = new Map<string, CriticidadDeActivo>();
  const enCurso = new Set<string>();

  const resolver = (id: string): CriticidadDeActivo | null => {
    const ya = resultado.get(id);
    if (ya) return ya;
    const a = activoPorId.get(id);
    if (!a) return null;

    const zona = heredarDeLaZona(a.locationId, ubicPorId);

    // Manda lo del activo si lo hay; si no, lo de la zona.
    const impacto = (a.impactoOperacional ?? zona.impacto) as Nivel | null;
    const riesgo = a.riesgoPersonas ?? zona.riesgo;

    const origenImpacto: CriticidadDeActivo['origenImpacto'] =
      a.impactoOperacional !== null && a.impactoOperacional !== undefined ? 'ACTIVO'
        : zona.impacto !== null ? 'ZONA' : 'SIN_DECLARAR';
    const origenRiesgo: CriticidadDeActivo['origenRiesgo'] =
      a.riesgoPersonas !== null && a.riesgoPersonas !== undefined ? 'ACTIVO'
        : zona.riesgo !== null ? 'ZONA' : 'SIN_DECLARAR';

    /* -------------------------------------------------------- LOS QUE SOSTIENEN
       Sólo cuenta como soporte si de verdad hay algo colgando. Un switch
       declarado y sin nada enchufado todavía no sostiene nada: tratarlo como
       soporte lo dejaría en `SIN_CLASIFICAR` para siempre, cuando lo que pasa
       es que aún no se ha declarado qué tiene conectado. */
    let letrasQueDependenDeEl: LetraABC[] | undefined;
    const hijos = datos.dependientes.get(id) ?? [];
    if (TIPOS_DE_SOPORTE.has(a.type) && hijos.length > 0) {
      if (enCurso.has(id)) {
        // Ciclo declarado por error. Se corta aquí, no se cuelga el servidor.
        return null;
      }
      enCurso.add(id);
      letrasQueDependenDeEl = [];
      for (const hijo of hijos) {
        const r = resolver(hijo);
        letrasQueDependenDeEl.push(r ? r.criticidad.letra : 'SIN_CLASIFICAR');
      }
      enCurso.delete(id);
    }

    const entrada: EntradaCriticidad = {
      codigo: a.assetCode,
      impactoOperacional: impacto,
      riesgoPersonas: riesgo,
      // El propio equipo no se cuenta a sí mismo como respaldo.
      equiposQueCubrenLoMismo: a.locationId && TIPOS_QUE_VIGILAN.has(a.type)
        ? Math.max(0, (vigilantesPorSitio.get(a.locationId) ?? 1) - 1)
        : 0,
      dificultadAcceso: dificultadDelAcceso(a.medioAcceso),
      fallasUltimoAnio: datos.fallasPorActivo.get(a.id) ?? 0,
      ...(letrasQueDependenDeEl ? { letrasQueDependenDeEl } : {}),
    };

    const salida: CriticidadDeActivo = {
      criticidad: clasificar(entrada, parametros),
      origenImpacto,
      origenRiesgo,
      entrada,
      zonaNombre: zona.nombre,
      riesgoMotivo: a.riesgoPersonas !== null && a.riesgoPersonas !== undefined ? null : zona.motivo,
    };
    resultado.set(id, salida);
    return salida;
  };

  for (const a of datos.activos) resolver(a.id);
  return resultado;
}

/** Reparto por letra, para la cabecera de la pantalla de Gestión. */
export function repartoPorLetra(
  m: Map<string, CriticidadDeActivo>,
): Record<LetraABC, number> {
  const r: Record<LetraABC, number> = { A: 0, B: 0, C: 0, SIN_CLASIFICAR: 0 };
  for (const v of m.values()) r[v.criticidad.letra]++;
  return r;
}

export { peorLetra, intervaloFinal };
export type { Criticidad, LetraABC, ParametrosCriticidad };
