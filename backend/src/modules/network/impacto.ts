/**
 * ANÁLISIS DE IMPACTO — qué se deja de ver si esto cae.
 *
 * LA PREGUNTA QUE RESUELVE
 * Hoy, cuando cae un switch, la frase que llega a Producción es "el switch
 * del púlpito está caído". Eso no le dice nada a nadie. Lo que necesita oír
 * es: "el Tren 2 se quedó sin ver la zona de enfriamiento, 8 cámaras".
 *
 * CÓMO SE MODELA, Y POR QUÉ ASÍ
 *
 * Una cámara sirve para algo si su imagen LLEGA AL GRABADOR. Así que no se
 * pregunta "qué cuelga de este switch" —que sería contar vecinos— sino:
 *
 *     ¿qué equipos dejan de tener camino hasta un NVR si quito éste?
 *
 * La diferencia es TODA, y se ve en el anillo de fibra del core:
 *
 *   - Contando vecinos, quitar un switch del anillo "deja sin servicio" a
 *     todo lo que sigue. FALSO: el anillo existe precisamente para que el
 *     tráfico dé la vuelta por el otro lado.
 *   - Calculando alcanzabilidad, ese mismo switch sale con impacto CERO, y
 *     el sistema informa además de que hay camino alternativo.
 *
 * Un análisis que grita cuando no pasa nada es peor que no tener análisis:
 * a la tercera falsa alarma, nadie vuelve a mirarlo.
 *
 * El grafo es NO DIRIGIDO: un cable de red se usa en los dos sentidos.
 */

export interface Enlace {
  a: string;
  b: string;
  /** Sólo informativo: sirve para explicar por qué no hubo impacto. */
  esAnillo?: boolean;
  /** La cámara va DIRECTA a su grabador sin que nadie haya declarado por dónde
   *  (ni puerto ni enlace). Vale para una analógica por coaxial; en una IP es
   *  un dato que falta. Se usa para poder decirlo, no cambia el cálculo. */
  supuesto?: boolean;
}

/* =============================================================================
   LOS ENLACES DEL GRAFO — bloque 185
   -----------------------------------------------------------------------------
   EL FALLO: «SI CAE ESTE SWITCH, 0 CÁMARAS»
   Aquí se metían TRES fuentes como si fueran cable: los puertos, los enlaces
   declarados y «esta cámara graba en tal grabador». La tercera NO es un cable:
   es una asignación. Con ella, toda cámara tenía un camino directo a su
   grabador y quitar el switch del medio no rompía nada: el impacto de un
   switch con dieciséis cámaras detrás salía CERO. Afectaba a «Impacto de una
   caída», a los puntos críticos y a la capa Impacto del mapa.

   LA REGLA
   La cámara va directa al grabador SÓLO si nadie declaró por dónde sale: sin
   puerto de switch y sin enlace. Es el caso real de una analógica (coaxial al
   grabador) y el de una IP todavía sin cablear en el sistema; esa unión se
   marca `supuesto`. En cuanto la cámara tiene un puerto o un enlace, su camino
   es ÉSE y se cae con él.
============================================================================= */
export interface DatosDeEnlaces {
  puertos: { switchId: string; connectedAssetId: string | null }[];
  enlaces: { endpointAId: string; endpointBId: string; isRing?: boolean | null }[];
  camaras: { assetId: string; nvrId?: string | null; nvrName?: string | null }[];
  idsDeNvr: Set<string>;
  /** Código del grabador en MAYÚSCULAS → id. Sólo para datos viejos sin `nvrId`. */
  nvrPorCodigo: Map<string, string>;
}

export function enlacesDelGrafo(d: DatosDeEnlaces): Enlace[] {
  const lista: Enlace[] = [];
  const conCable = new Set<string>();
  for (const p of d.puertos) {
    if (!p.connectedAssetId) continue;
    lista.push({ a: p.switchId, b: p.connectedAssetId });
    conCable.add(p.connectedAssetId);
  }
  for (const e of d.enlaces) {
    lista.push({ a: e.endpointAId, b: e.endpointBId, esAnillo: !!e.isRing });
    conCable.add(e.endpointAId); conCable.add(e.endpointBId);
  }
  for (const c of d.camaras) {
    if (conCable.has(c.assetId)) continue;
    // 1) El campo bueno: la referencia al grabador.
    let nvr = c.nvrId && d.idsDeNvr.has(c.nvrId) ? c.nvrId : null;
    // 2) Sólo si no hay referencia, el nombre (datos de antes de que existiera el campo).
    if (!nvr) nvr = d.nvrPorCodigo.get((c.nvrName || '').trim().toUpperCase()) ?? null;
    if (nvr) lista.push({ a: c.assetId, b: nvr, supuesto: true });
  }
  return lista;
}

export interface GrafoRed {
  /** Todos los equipos que participan en la red. */
  nodos: string[];
  enlaces: Enlace[];
  /** Dónde tiene que llegar la imagen: NVR y servidores de grabación. */
  raices: string[];
}

export interface Impacto {
  /** Equipos que se quedan sin camino al grabador. */
  pierden: string[];
  /** Cuántos de los que pierden son cámaras (lo que ve Producción). */
  camarasAfectadas: number;
  /** true si el equipo estaba en un anillo y por eso no rompe nada. */
  salvadoPorAnillo: boolean;
  /** Equipos que YA estaban aislados antes de la caída. No se le imputan. */
  yaAislados: string[];
}

/** Lista de vecinos, saltándose los nodos excluidos. */
function vecinos(g: GrafoRed, fuera: Set<string>): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const n of g.nodos) if (!fuera.has(n)) m.set(n, []);
  for (const e of g.enlaces) {
    if (fuera.has(e.a) || fuera.has(e.b)) continue;
    if (!m.has(e.a) || !m.has(e.b)) continue;
    m.get(e.a)!.push(e.b);
    m.get(e.b)!.push(e.a);
  }
  return m;
}

/**
 * Equipos que alcanzan alguna raíz. Recorrido en anchura desde las raíces,
 * que es lo mismo y se hace una sola vez en lugar de una por nodo.
 */
export function alcanzables(g: GrafoRed, excluir: string[] = []): Set<string> {
  const fuera = new Set(excluir);
  const ady = vecinos(g, fuera);
  const vistos = new Set<string>();
  const cola: string[] = [];

  for (const r of g.raices) {
    if (fuera.has(r) || !ady.has(r)) continue;
    vistos.add(r);
    cola.push(r);
  }
  // Anchura con índice en lugar de shift(): con 2.000 cámaras, shift() sobre
  // un array es cuadrático y la consulta se va a segundos.
  for (let i = 0; i < cola.length; i++) {
    for (const v of ady.get(cola[i]) || []) {
      if (!vistos.has(v)) {
        vistos.add(v);
        cola.push(v);
      }
    }
  }
  return vistos;
}

/**
 * Qué pasa si cae este equipo.
 *
 * Se resta lo que YA estaba aislado antes: si una cámara lleva un mes sin
 * cable, no es culpa del switch que se acaba de caer. Imputársela infla el
 * número y hace que nadie se lo crea.
 */
export function impactoDeCaida(
  g: GrafoRed,
  equipoId: string,
  esCamara: (id: string) => boolean = () => true,
): Impacto {
  const antes = alcanzables(g);
  const despues = alcanzables(g, [equipoId]);

  const yaAislados = g.nodos.filter((n) => n !== equipoId && !antes.has(n));
  const pierden = g.nodos.filter(
    (n) => n !== equipoId && antes.has(n) && !despues.has(n),
  );

  // ¿Estaba en un anillo y aun así no rompió nada? Merece decirse: es la
  // prueba de que la inversión en redundancia sirve para algo.
  const enAnillo = g.enlaces.some(
    (e) => e.esAnillo && (e.a === equipoId || e.b === equipoId),
  );

  return {
    pierden,
    camarasAfectadas: pierden.filter(esCamara).length,
    salvadoPorAnillo: enAnillo && pierden.length === 0,
    yaAislados,
  };
}

/** Lo mismo, pero al cortar un enlace: un tramo de fibra, un radioenlace. */
export function impactoDeCorte(
  g: GrafoRed,
  enlace: Enlace,
  esCamara: (id: string) => boolean = () => true,
): Impacto {
  const sinEse: GrafoRed = {
    ...g,
    enlaces: g.enlaces.filter(
      (e) => !((e.a === enlace.a && e.b === enlace.b) || (e.a === enlace.b && e.b === enlace.a)),
    ),
  };
  const antes = alcanzables(g);
  const despues = alcanzables(sinEse);
  const pierden = g.nodos.filter((n) => antes.has(n) && !despues.has(n));
  return {
    pierden,
    camarasAfectadas: pierden.filter(esCamara).length,
    salvadoPorAnillo: !!enlace.esAnillo && pierden.length === 0,
    yaAislados: g.nodos.filter((n) => !antes.has(n)),
  };
}

/**
 * Ranking de equipos por daño potencial. Es lo que de verdad sirve para
 * decidir dónde poner el repuesto en caliente y qué revisar primero en la
 * parada: no el más caro, sino el que se lleva más cámaras por delante.
 */
export function porDanoPotencial(
  g: GrafoRed,
  esCamara: (id: string) => boolean = () => true,
): { id: string; camarasAfectadas: number; salvadoPorAnillo: boolean }[] {
  return g.nodos
    .filter((n) => !esCamara(n)) // una cámara sólo se afecta a sí misma
    .map((id) => {
      const i = impactoDeCaida(g, id, esCamara);
      return { id, camarasAfectadas: i.camarasAfectadas, salvadoPorAnillo: i.salvadoPorAnillo };
    })
    .sort((a, b) => b.camarasAfectadas - a.camarasAfectadas);
}
