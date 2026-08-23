/**
 * DE QUÉ DEPENDE CADA CÁMARA — bloque 47.
 *
 * =============================================================================
 *  PARA QUIÉN SE ESCRIBE ESTO
 * =============================================================================
 *  Para un ingeniero de PRODUCCIÓN. No es de sistemas y no tiene por qué
 *  serlo: su carrera es otra. Sabe perfectamente qué es un tren de laminación
 *  y qué le cuesta un minuto de parada, y no tiene ninguna obligación de saber
 *  qué es un uplink o una VLAN.
 *
 *  Así que este módulo NO devuelve topología. Devuelve frases:
 *
 *      «Si esta antena se cae, el púlpito del Tren 2 deja de ver 6 cámaras.»
 *
 *  Todo lo que se calcula aquí existe ya en `impacto.ts`, que es el motor de
 *  grafo probado. Lo que añade este archivo es la TRADUCCIÓN: agrupar por el
 *  equipo del que cuelgan las cámaras y contarlo en castellano de planta.
 *
 * =============================================================================
 *  POR QUÉ «DEPENDE DE» NO ES LO MISMO QUE «ESTÁ CONECTADO A»
 * =============================================================================
 *  Es la trampa en la que cae cualquier inventario hecho en Excel.
 *
 *  Estar conectado es tener un cable. Depender es que, si el otro desaparece,
 *  TÚ DEJAS DE SERVIR PARA ALGO. Y una cámara sirve para algo cuando su imagen
 *  llega al grabador; si no llega, la cámara puede estar encendida, alimentada
 *  y con el led verde, y aun así nadie la está viendo.
 *
 *  Por eso una cámara «cuelga» de un equipo cuando pierde el camino hasta el
 *  grabador si ese equipo cae — no cuando comparte cable con él. La diferencia
 *  se ve en el anillo de fibra: contando cables, quitar un switch del anillo
 *  parece dejar sin imagen a media planta; contando dependencia real, sale
 *  cero, porque el tráfico da la vuelta. El anillo se pagó justo para eso.
 *
 * =============================================================================
 *  LOS COMPONENTES CUENTAN COMO PARTE DEL PADRE
 * =============================================================================
 *  La fuente PoE de 24 V vive DENTRO de la antena (`parteDeId`). No es un
 *  salto más de la cadena: es una pieza de la antena. Si la fuente muere, la
 *  antena muere, y con ella todo lo que colgaba.
 *
 *  Se enseña así —dentro, no al lado— porque es como está en la realidad y
 *  porque en la pantalla de un jefe de tren un recuadro «fuente» suelto entre
 *  la antena y el switch no significa nada.
 */

/** El tipo de equipo, ya traducido a lo que se dice en planta. */
export type Papel =
  | 'CAMARA' | 'ANTENA' | 'SWITCH' | 'GRABADOR' | 'FUENTE'
  | 'SERVIDOR' | 'PANTALLA' | 'OTRO';

/**
 * Cómo se llama cada cosa cuando la lee alguien que no es de sistemas.
 *
 * `WIRELESS` no significa nada fuera de TI; «antena» lo entiende cualquiera
 * que haya mirado hacia un mástil. El nombre técnico no se pierde: sigue en la
 * ficha del activo, que es donde lo busca el técnico de red.
 */
const PAPEL_DE: Record<string, Papel> = {
  CAMERA: 'CAMARA',
  WIRELESS: 'ANTENA',
  SWITCH: 'SWITCH',
  ROUTER: 'SWITCH',
  FIREWALL: 'SWITCH',
  NVR: 'GRABADOR',
  SERVER: 'SERVIDOR',
  PSU: 'FUENTE',
  PANTALLA: 'PANTALLA',
};

export function papelDe(tipo: string): Papel {
  return PAPEL_DE[tipo] ?? 'OTRO';
}

/** Cómo se nombra en singular, para meterlo en una frase. */
const NOMBRE: Record<Papel, string> = {
  CAMARA: 'cámara',
  ANTENA: 'antena',
  SWITCH: 'switch',
  GRABADOR: 'grabador',
  FUENTE: 'fuente de poder',
  SERVIDOR: 'servidor',
  PANTALLA: 'pantalla',
  OTRO: 'equipo',
};

export function nombreDePapel(p: Papel): string {
  return NOMBRE[p];
}

// ============================================================ lo que entra

export interface EquipoParaDependencias {
  id: string;
  codigo: string;
  tipo: string;
  /** Estado ya derivado: OPERATIVO, FUERA_SERVICIO, CON_INCIDENCIA… */
  estado: string;
  /** Sigla del sector: T1, T2, OFI, GRU… `null` si el árbol no lo resuelve. */
  sector: string | null;
  lugar?: string | null;
  /** Si es componente de otro activo (la fuente dentro de la antena). */
  parteDeId?: string | null;
  /**
   * En qué red vive, ya resuelto por `segmentos.ts` contra las subredes
   * registradas. Opcional: sin él todo sale SIN_DETERMINAR, que es lo
   * honesto mientras no haya plan de direcciones cargado.
   */
  segmento?: string | null;
}

export interface EnlaceParaDependencias {
  a: string;
  b: string;
  esAnillo?: boolean;
}

// ============================================================ lo que sale

export interface CamaraQueCuelga {
  id: string;
  codigo: string;
  lugar: string | null;
  sector: string | null;
  /** Si ahora mismo su imagen llega al grabador. */
  viendo: boolean;
}

export interface PiezaInterna {
  id: string;
  codigo: string;
  papel: Papel;
  estado: string;
  /** Frase corta: qué pasa si esta pieza falla. */
  siFalla: string;
}

/**
 * QUÉ SE PIERDE CUANDO ESTE EQUIPO CAE — bloque 49.
 *
 * La planta tiene DOS redes y el grabador es la frontera entre ellas, así que
 * una caída no siempre significa lo mismo:
 *
 *   NI_GRABA_NI_SE_VE  el equipo está del lado de las cámaras. La imagen no
 *                      llega al grabador: no se guarda y no se ve.
 *   GRABA_PERO_NO_SE_VE  el equipo está del lado del púlpito. La cámara sigue
 *                      grabando; lo que se pierde es poder mirarla en vivo.
 *   SIN_DETERMINAR     no hay plan de direcciones cargado o el equipo no tiene
 *                      IP. NO se supone lo peor ni lo mejor: se dice que no
 *                      se sabe.
 *
 * La segunda es la que el sistema no sabía distinguir, y es la que más
 * confunde en planta: el operador reporta «no veo la zona» y la grabación
 * está intacta. Quién lo atiende y con qué urgencia cambia por completo.
 */
export type EfectoDeCaida =
  | 'NI_GRABA_NI_SE_VE'
  | 'GRABA_PERO_NO_SE_VE'
  | 'SIN_DETERMINAR';

export interface Soporte {
  id: string;
  codigo: string;
  papel: Papel;
  sector: string | null;
  lugar: string | null;
  estado: string;
  /** Las cámaras que se quedan sin llegar al grabador si este equipo cae. */
  camaras: CamaraQueCuelga[];
  /** Piezas que lleva dentro (la fuente de la antena). */
  piezas: PiezaInterna[];
  /** Está en el anillo y por eso su caída no rompe nada. */
  salvadoPorAnillo: boolean;
  /** La frase para Producción. Es el producto de este módulo. */
  siCae: string;
  /** Cómo viaja la imagen, explicado sin jerga. */
  comoFunciona: string;
  /** De qué lado de la frontera está, y por tanto qué se pierde. */
  efecto: EfectoDeCaida;
  /** La segunda pregunta, en una frase. */
  queSePierde: string;
}

// ============================================================ el cálculo

/** Vecinos, saltándose lo excluido. Igual que en `impacto.ts`, a propósito. */
function adyacencia(
  nodos: string[], enlaces: EnlaceParaDependencias[], fuera: Set<string>,
): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const n of nodos) if (!fuera.has(n)) m.set(n, []);
  for (const e of enlaces) {
    if (fuera.has(e.a) || fuera.has(e.b)) continue;
    if (!m.has(e.a) || !m.has(e.b)) continue;
    m.get(e.a)!.push(e.b);
    m.get(e.b)!.push(e.a);
  }
  return m;
}

function alcanzanElGrabador(
  nodos: string[], enlaces: EnlaceParaDependencias[],
  raices: string[], excluir: string[] = [],
): Set<string> {
  const fuera = new Set(excluir);
  const ady = adyacencia(nodos, enlaces, fuera);
  const vistos = new Set<string>();
  const cola: string[] = [];
  for (const r of raices) {
    if (fuera.has(r) || !ady.has(r)) continue;
    vistos.add(r);
    cola.push(r);
  }
  // Índice en vez de shift(): con dos mil cámaras, shift() es cuadrático.
  for (let i = 0; i < cola.length; i++) {
    for (const v of ady.get(cola[i]) || []) {
      if (!vistos.has(v)) { vistos.add(v); cola.push(v); }
    }
  }
  return vistos;
}

/** Plural sin el «(s)» que afea las pantallas. */
function nCosas(n: number, sing: string, plur: string): string {
  return `${n} ${n === 1 ? sing : plur}`;
}

/** «Tren 2» a partir de «T2»; los sectores que no son tren van tal cual. */
export function nombreDeSector(sigla: string | null): string {
  if (!sigla) return 'sin sector asignado';
  const m = /^T(\d+)$/.exec(sigla);
  if (m) return `Tren ${m[1]}`;
  if (sigla === 'OFI') return 'Oficinas';
  if (sigla === 'GRU') return 'Grúas';
  return sigla;
}

/**
 * La frase que lee Producción. Es lo único que se lleva de esta pantalla
 * quien la mira cinco segundos, así que se construye con cuidado:
 * PRIMERO el efecto, DESPUÉS el equipo. «Deja de verse X» pesa más que
 * «el equipo Y está caído», que es la frase que hoy no le dice nada a nadie.
 */
function fraseSiCae(
  papel: Papel, camaras: CamaraQueCuelga[], salvadoPorAnillo: boolean,
): string {
  if (!camaras.length) {
    if (salvadoPorAnillo) {
      return 'Si se cae, no se deja de ver ninguna cámara: la red da la vuelta '
        + 'por el otro lado del anillo de fibra. Para eso se puso el anillo.';
    }
    return `Ahora mismo no hay ninguna cámara que dependa de este ${NOMBRE[papel]}.`;
  }

  /* Se agrupa por sector porque es la unidad con la que piensa Producción:
     «seis cámaras» no dice si el problema es suyo; «seis del Tren 2» sí. */
  const porSector = new Map<string | null, number>();
  for (const c of camaras) porSector.set(c.sector, (porSector.get(c.sector) ?? 0) + 1);

  const trozos = [...porSector.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([s, n]) => `${nCosas(n, 'cámara', 'cámaras')} de ${nombreDeSector(s)}`);

  const lista = trozos.length === 1
    ? trozos[0]
    : `${trozos.slice(0, -1).join(', ')} y ${trozos[trozos.length - 1]}`;

  return `Si se cae este ${NOMBRE[papel]}, se dejan de ver ${lista}.`;
}

/** Cómo viaja la imagen. Una frase, sin siglas. */
function fraseComoFunciona(papel: Papel, cuantas: number): string {
  if (!cuantas) return 'Todavía no hay cámaras enlazadas a este equipo en el sistema.';
  const c = nCosas(cuantas, 'cámara manda su imagen', 'cámaras mandan su imagen');
  switch (papel) {
    case 'ANTENA':
      return `${c} por el aire hasta esta antena. De la antena baja por cable `
        + 'hasta el switch, y del switch llega al grabador. Si la antena se queda '
        + 'sin señal o sin corriente, esa imagen no llega, aunque las cámaras estén encendidas.';
    case 'SWITCH':
      return `${c} por cable a este switch, que es el que la reparte hacia el `
        + 'grabador. Sin él, la imagen se queda a medio camino.';
    case 'GRABADOR':
      return `${c} a este grabador, que es donde se guarda. Si el grabador se `
        + 'cae, se sigue viendo en vivo lo que pase por otra ruta, pero no queda grabado.';
    default:
      return `${c} pasando por este equipo antes de llegar al grabador.`;
  }
}

/**
 * EL CÁLCULO PRINCIPAL.
 *
 * Devuelve un «soporte» por cada equipo del que cuelgue alguna cámara,
 * ordenado por cuántas se lleva por delante. El primero de la lista es, por
 * definición, el equipo más importante de la planta — y esa lista no la sabe
 * nadie de memoria, ni el que instaló la red.
 */
/**
 * De qué lado de la frontera está un equipo, y qué se pierde si cae.
 *
 * El GRABADOR es la frontera, así que su caída se lleva las dos cosas. Del
 * lado de las cámaras se pierde grabar Y ver; del lado del púlpito sólo ver.
 *
 * Sin segmento conocido devuelve SIN_DETERMINAR en vez de adivinar. Suponer
 * lo peor llenaría la pantalla de alarmas falsas el primer día; suponer lo
 * mejor escondería una caída real. Las dos suposiciones son mentiras, y la
 * verdad —«no lo sé todavía»— es información útil: dice que falta cargar el
 * plan de direcciones.
 */
function efectoDe(papel: Papel, segmento?: string | null): EfectoDeCaida {
  if (papel === 'GRABADOR') return 'NI_GRABA_NI_SE_VE';
  if (segmento === 'LAN_CAMARAS') return 'NI_GRABA_NI_SE_VE';
  if (segmento === 'RED_CCTV') return 'GRABA_PERO_NO_SE_VE';
  return 'SIN_DETERMINAR';
}

const QUE_SE_PIERDE: Record<EfectoDeCaida, string> = {
  NI_GRABA_NI_SE_VE:
    'No se graba ni se ve: la imagen no llega al grabador.',
  GRABA_PERO_NO_SE_VE:
    'Se sigue grabando, pero el púlpito deja de verlo en vivo. La imagen '
    + 'queda guardada y se puede revisar después.',
  SIN_DETERMINAR:
    'No se puede decir si se dejaría de grabar o sólo de ver: a este equipo '
    + 'le falta la dirección, o falta registrar su subred.',
};

export function soportesDeCamaras(
  equipos: EquipoParaDependencias[],
  enlaces: EnlaceParaDependencias[],
): Soporte[] {
  const porId = new Map(equipos.map((e) => [e.id, e]));
  const nodos = equipos.map((e) => e.id);
  const raices = equipos
    .filter((e) => papelDe(e.tipo) === 'GRABADOR' || papelDe(e.tipo) === 'SERVIDOR')
    .map((e) => e.id);

  /* Sin grabadores no hay a dónde llegar, así que TODO saldría «caído» y la
     pantalla sería una alarma roja falsa. Se devuelve vacío y la pantalla
     explica que falta cargar el grabador: sin datos, nunca cero. */
  if (!raices.length) return [];

  const antes = alcanzanElGrabador(nodos, enlaces, raices);

  /* Las piezas internas se agrupan por su padre una sola vez. */
  const piezasDe = new Map<string, EquipoParaDependencias[]>();
  for (const e of equipos) {
    if (!e.parteDeId) continue;
    const l = piezasDe.get(e.parteDeId) ?? [];
    l.push(e);
    piezasDe.set(e.parteDeId, l);
  }

  const salida: Soporte[] = [];

  for (const eq of equipos) {
    const papel = papelDe(eq.tipo);
    // Una cámara sólo se afecta a sí misma: no es soporte de nadie.
    if (papel === 'CAMARA') continue;
    // Las piezas internas no son un salto: se muestran dentro de su padre.
    if (eq.parteDeId) continue;

    const despues = alcanzanElGrabador(nodos, enlaces, raices, [eq.id]);

    /* Se restan las que YA estaban sin llegar antes de la caída. Si una
       cámara lleva un mes sin cable, no es culpa de este switch. Imputársela
       infla el número, y un número inflado deja de creerse a la tercera vez. */
    const camaras: CamaraQueCuelga[] = equipos
      .filter((c) => papelDe(c.tipo) === 'CAMARA'
        && c.id !== eq.id
        && antes.has(c.id)
        && !despues.has(c.id))
      .map((c) => ({
        id: c.id,
        codigo: c.codigo,
        lugar: c.lugar ?? null,
        sector: c.sector,
        viendo: c.estado === 'OPERATIVO',
      }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo, 'es'));

    const enAnillo = enlaces.some((l) => l.esAnillo && (l.a === eq.id || l.b === eq.id));
    const salvadoPorAnillo = enAnillo && camaras.length === 0;

    const piezas: PiezaInterna[] = (piezasDe.get(eq.id) ?? []).map((p) => ({
      id: p.id,
      codigo: p.codigo,
      papel: papelDe(p.tipo),
      estado: p.estado,
      siFalla: papelDe(p.tipo) === 'FUENTE'
        ? `Alimenta a ${eq.codigo}. Si esta fuente falla, la ${NOMBRE[papel]} `
          + 'se apaga entera, aunque no tenga nada roto.'
        : `Es parte de ${eq.codigo}. Si falla, la ${NOMBRE[papel]} deja de funcionar bien.`,
    }));

    /* Sólo se listan los equipos que sostienen algo, o que llevan piezas
       dentro, o que están en el anillo. Un switch de escritorio sin nada
       colgado no aporta nada a esta pantalla y sí ruido. */
    if (!camaras.length && !piezas.length && !salvadoPorAnillo) continue;

    salida.push({
      id: eq.id,
      codigo: eq.codigo,
      papel,
      sector: eq.sector,
      lugar: eq.lugar ?? null,
      estado: eq.estado,
      camaras,
      piezas,
      salvadoPorAnillo,
      siCae: fraseSiCae(papel, camaras, salvadoPorAnillo),
      comoFunciona: fraseComoFunciona(papel, camaras.length),
      efecto: efectoDe(papel, eq.segmento),
      queSePierde: QUE_SE_PIERDE[efectoDe(papel, eq.segmento)],
    });
  }

  /* De más grave a menos. Con el mismo número de cámaras, primero el que ya
     está caído: es el que hay que mirar hoy, no mañana. */
  return salida.sort((a, b) => {
    if (b.camaras.length !== a.camaras.length) return b.camaras.length - a.camaras.length;
    const roto = (s: Soporte) => (s.estado === 'OPERATIVO' ? 1 : 0);
    if (roto(a) !== roto(b)) return roto(a) - roto(b);
    return a.codigo.localeCompare(b.codigo, 'es');
  });
}

// ============================================================ la cadena

export interface EslabonDeCadena {
  id: string;
  codigo: string;
  papel: Papel;
  estado: string;
  /** Qué hace este eslabón, en una línea. */
  que: string;
  piezas: PiezaInterna[];
}

export interface CadenaDeCamara {
  camaraId: string;
  /** De la cámara al grabador, en orden. Vacío si no hay camino. */
  eslabones: EslabonDeCadena[];
  llegaAlGrabador: boolean;
  /** La explicación completa, para leerla de corrido. */
  resumen: string;
}

const QUE_HACE: Record<Papel, string> = {
  CAMARA: 'Toma la imagen.',
  ANTENA: 'Lleva la imagen por el aire hasta el otro extremo.',
  SWITCH: 'Reparte la imagen hacia el grabador.',
  GRABADOR: 'Guarda la imagen y la muestra en el púlpito.',
  FUENTE: 'Da corriente al equipo.',
  SERVIDOR: 'Guarda y procesa la imagen.',
  PANTALLA: 'Muestra la imagen.',
  OTRO: 'Forma parte del camino de la imagen.',
};

/**
 * El camino de UNA cámara hasta el grabador, paso a paso.
 *
 * Se usa el camino MÁS CORTO. Puede haber varios —para eso está el anillo—
 * pero enseñar todos convierte una explicación en un diagrama, y el diagrama
 * es justo lo que no se entiende sin ser de sistemas. Si hay ruta alternativa,
 * el análisis de impacto ya lo dice por su cuenta.
 */
export function cadenaDeCamara(
  camaraId: string,
  equipos: EquipoParaDependencias[],
  enlaces: EnlaceParaDependencias[],
): CadenaDeCamara {
  const porId = new Map(equipos.map((e) => [e.id, e]));
  const nodos = equipos.map((e) => e.id);
  const raices = new Set(equipos
    .filter((e) => papelDe(e.tipo) === 'GRABADOR' || papelDe(e.tipo) === 'SERVIDOR')
    .map((e) => e.id));

  const piezasDe = new Map<string, EquipoParaDependencias[]>();
  for (const e of equipos) {
    if (!e.parteDeId) continue;
    const l = piezasDe.get(e.parteDeId) ?? [];
    l.push(e);
    piezasDe.set(e.parteDeId, l);
  }

  const vacio = (motivo: string): CadenaDeCamara => ({
    camaraId, eslabones: [], llegaAlGrabador: false, resumen: motivo,
  });

  if (!porId.has(camaraId)) return vacio('Esa cámara no está en el sistema.');
  if (!raices.size) {
    return vacio('Todavía no hay ningún grabador cargado, así que no se puede '
      + 'saber por dónde viaja la imagen.');
  }

  // Anchura desde la cámara: el primer grabador que se toca da el camino corto.
  const ady = adyacencia(nodos, enlaces, new Set());
  const previo = new Map<string, string | null>([[camaraId, null]]);
  const cola = [camaraId];
  let destino: string | null = null;

  for (let i = 0; i < cola.length && !destino; i++) {
    for (const v of ady.get(cola[i]) || []) {
      if (previo.has(v)) continue;
      previo.set(v, cola[i]);
      if (raices.has(v)) { destino = v; break; }
      cola.push(v);
    }
  }

  if (!destino) {
    return vacio('Esta cámara no tiene camino hasta ningún grabador. O le falta '
      + 'el enlace en el sistema, o de verdad no está llegando su imagen.');
  }

  const camino: string[] = [];
  for (let n: string | null = destino; n; n = previo.get(n) ?? null) camino.push(n);
  camino.reverse(); // de la cámara al grabador

  const eslabones: EslabonDeCadena[] = camino.map((id) => {
    const e = porId.get(id)!;
    const papel = papelDe(e.tipo);
    return {
      id,
      codigo: e.codigo,
      papel,
      estado: e.estado,
      que: QUE_HACE[papel],
      piezas: (piezasDe.get(id) ?? []).map((p) => ({
        id: p.id,
        codigo: p.codigo,
        papel: papelDe(p.tipo),
        estado: p.estado,
        siFalla: `Si falla, ${e.codigo} deja de funcionar.`,
      })),
    };
  });

  const ruta = eslabones.map((e) => NOMBRE[e.papel]).join(' → ');
  return {
    camaraId,
    eslabones,
    llegaAlGrabador: true,
    resumen: `La imagen va así: ${ruta}. Si falla cualquiera de esos pasos, `
      + 'la cámara deja de verse.',
  };
}

/** Titular de la pantalla: una línea que se lee desde la puerta. */
export function resumirDependencias(soportes: Soporte[]): string {
  if (!soportes.length) {
    return 'Todavía no hay enlaces de red cargados, así que no se puede decir '
      + 'de qué depende cada cámara.';
  }
  const caidos = soportes.filter((s) => s.estado !== 'OPERATIVO' && s.camaras.length > 0);
  if (caidos.length) {
    const cams = caidos.reduce((n, s) => n + s.camaras.length, 0);
    return `${nCosas(caidos.length, 'equipo está fallando', 'equipos están fallando')} `
      + `y de ${caidos.length === 1 ? 'él' : 'ellos'} ${
        nCosas(cams, 'cámara depende', 'cámaras dependen')}.`;
  }
  const top = soportes[0];
  if (!top.camaras.length) {
    return 'Todo en orden. Ningún equipo de red tiene cámaras dependiendo de él '
      + 'ahora mismo.';
  }
  return `Todo en orden. El equipo más crítico es ${top.codigo}: `
    + `${nCosas(top.camaras.length, 'cámara depende', 'cámaras dependen')} de él.`;
}
