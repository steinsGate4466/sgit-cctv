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
