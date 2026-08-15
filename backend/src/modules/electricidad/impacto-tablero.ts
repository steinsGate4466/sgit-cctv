/* =============================================================================
   SI SE CAE ESTE TABLERO, ¿QUÉ SE APAGA? — bloque 31
   -----------------------------------------------------------------------------
   EL HUECO QUE TAPA
   El sistema ya contesta «si salta ESTE TÉRMICO, qué se apaga» (impacto por
   circuito, con la cascada del switch incluida). Lo que no contestaba es la
   pregunta que se hace de verdad a las tres de la mañana:

       «Se fue el TAB-T2-MCC-01 entero. ¿Qué acabo de perder?»

   Y esa es peor, porque un tablero alimenta a otros tableros. El modelo ya
   guardaba la cadena (`alimentadoDe` / `alimenta`) desde el bloque 18 y NADIE
   la usaba: estaba el dato y no la respuesta.

   -----------------------------------------------------------------------------
   LAS TRES CAPAS QUE HAY QUE SUMAR
   Un tablero de planta no alimenta sólo cámaras. Dentro suele haber un switch
   pequeño, y de ese switch cuelgan más cámaras que ni siquiera están
   conectadas a ese tablero. Perder el tablero las apaga igual.

     1. DIRECTO   — lo que cuelga de sus circuitos.
     2. EN CASCADA ELÉCTRICA — lo que cuelga de los tableros que él alimenta,
        y de los que alimentan ésos, hacia abajo.
     3. EN CASCADA DE RED — lo que cuelga de un switch que se quedó sin luz
        por 1 o por 2. Esto es lo que casi siempre se subestima.

   -----------------------------------------------------------------------------
   Y EL NÚMERO QUE IMPORTA NO ES CUÁNTOS SON
   Son cuántas ZONAS VITALES se quedan a ciegas. Veinte cámaras del
   estacionamiento y una de la salida del horno no son el mismo apagón. Por eso
   el resultado cruza con lo que declaró Producción.
============================================================================= */

export interface TableroNodo {
  id: string;
  codigo: string;
  nombre: string;
  alimentadoDeId?: string | null;
}

export interface EquipoAlimentado {
  id: string;
  assetCode: string;
  tipo: string;
  /** Del tablero del que cuelga eléctricamente. */
  tableroId: string;
  /** Zona vital a la que pertenece, si Producción la declaró. */
  zonaVital?: boolean;
  zonaNombre?: string | null;
}

/** switchId -> equipos conectados a sus puertos. */
export type ColgadosDeSwitch = Map<string, EquipoAlimentado[]>;

/**
 * Todos los tableros que se quedan sin luz, empezando por el que cae.
 *
 * El tope de 20 saltos protege ante un ciclo por dato corrupto: si alguien
 * grabara que A alimenta a B y B alimenta a A, sin el tope esto colgaría el
 * servidor. Con él devuelve un resultado incompleto, que es recuperable.
 */
export function tablerosAfectados(
  raizId: string, todos: TableroNodo[],
): TableroNodo[] {
  const hijosDe = new Map<string, TableroNodo[]>();
  for (const t of todos) {
    if (!t.alimentadoDeId) continue;
    if (!hijosDe.has(t.alimentadoDeId)) hijosDe.set(t.alimentadoDeId, []);
    hijosDe.get(t.alimentadoDeId)!.push(t);
  }

  const raiz = todos.find((t) => t.id === raizId);
  if (!raiz) return [];

  const vistos = new Set<string>([raizId]);
  const salida: TableroNodo[] = [raiz];
  let frente = [raiz];
  let nivel = 0;

  while (frente.length && nivel < 20) {
    const siguiente: TableroNodo[] = [];
    for (const t of frente) {
      for (const h of hijosDe.get(t.id) ?? []) {
        if (vistos.has(h.id)) continue;   // corta el ciclo
        vistos.add(h.id);
        salida.push(h);
        siguiente.push(h);
      }
    }
    frente = siguiente;
    nivel++;
  }
  return salida;
}

export interface ImpactoCalculado {
  directos: EquipoAlimentado[];
  /** Los que se apagan porque su switch se quedó sin luz. */
  porRed: EquipoAlimentado[];
  total: number;
  camaras: number;
  /** Zonas vitales que se quedan a ciegas, con nombre. */
  zonasVitalesAfectadas: string[];
  titular: string;
}

/**
 * Junta las tres capas y saca la frase.
 *
 * Puro: recibe los datos ya cargados. La regla de «qué se apaga» decide si
 * alguien coge el manlift a las tres de la mañana, y una regla así hay que
 * poder probarla con datos escritos a mano.
 */
export function calcularImpacto(
  idsTableros: string[],
  alimentados: EquipoAlimentado[],
  colgadosDeSwitch: ColgadosDeSwitch,
): ImpactoCalculado {
  const enElApagon = new Set(idsTableros);
  const directos = alimentados.filter((e) => enElApagon.has(e.tableroId));

  // Capa 3: lo que cuelga de un switch que se quedó sin luz.
  const yaContados = new Set(directos.map((d) => d.id));
  const porRed: EquipoAlimentado[] = [];
  for (const sw of directos.filter((d) => d.tipo === 'SWITCH')) {
    for (const eq of colgadosDeSwitch.get(sw.id) ?? []) {
      // Un equipo puede estar alimentado por el tablero Y colgar del switch.
      // Sin este control saldría dos veces y el número asustaría de más.
      if (yaContados.has(eq.id)) continue;
      yaContados.add(eq.id);
      porRed.push(eq);
    }
  }

  const todos = [...directos, ...porRed];
  const camaras = todos.filter((e) => e.tipo === 'CAMERA').length;
  const zonas = [...new Set(
    todos.filter((e) => e.zonaVital && e.zonaNombre).map((e) => e.zonaNombre as string),
  )].sort();

  return {
    directos, porRed,
    total: todos.length,
    camaras,
    zonasVitalesAfectadas: zonas,
    titular: armarTitular(todos.length, camaras, zonas, porRed.length, idsTableros.length),
  };
}

function armarTitular(
  total: number, camaras: number, zonas: string[], porRed: number, nTableros: number,
): string {
  if (!total) {
    return nTableros > 1
      ? 'No hay ningún equipo colgado de este tablero ni de los que alimenta. Puede que falte cargar los circuitos.'
      : 'No hay ningún equipo colgado de este tablero. Puede que falte cargar los circuitos.';
  }

  const partes: string[] = [];
  partes.push(`Se apagan ${total} equipo(s)${camaras ? `, ${camaras} de ellos cámaras` : ''}.`);

  if (nTableros > 1) {
    partes.push(`Arrastra ${nTableros - 1} tablero(s) aguas abajo.`);
  }
  if (porRed) {
    // El que más sorprende, y por eso va con nombre propio.
    partes.push(`${porRed} se van por quedarse sin switch, no por falta de alimentación propia.`);
  }
  if (zonas.length) {
    partes.push(`Y deja a ciegas ${zonas.length} zona(s) declarada(s) vital(es): ${zonas.join(', ')}.`);
  }
  return partes.join(' ');
}
