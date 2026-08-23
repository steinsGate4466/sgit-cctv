/**
 * LOS DOS SEGMENTOS DE RED, Y EL GRABADOR COMO FRONTERA — bloque 48.
 *
 * =============================================================================
 *  LA PLANTA TIENE DOS REDES, NO UNA. ANTES SE MODELABA COMO UNA.
 * =============================================================================
 *  Éste es el error de fondo que corrige este archivo. El cálculo anterior
 *  trataba el NVR como el DESTINO de la imagen, y no lo es: el NVR es la
 *  FRONTERA entre dos redes que no se hablan directamente.
 *
 *      CÁMARA ──192.168.1.x──► switch de campo ──► NVR ──10.1.x.x──► FortiSwitch ──► púlpito
 *              LAN de cámaras   (Hikvision, TP-Link,      ▲            red CCTV
 *                                dentro de un tablero)    │
 *                                        aquí cambia de red
 *
 *  El switch de campo va atornillado DENTRO DE UN TABLERO ELÉCTRICO, junto al
 *  supresor de pico que cuelga directo de los 220 V. Por eso `montajeDe()`
 *  distingue TABLERO de GABINETE: no es una etiqueta, es que abrir un tablero
 *  exige bloqueo eléctrico y abrir un gabinete no.
 *
 * =============================================================================
 *  POR QUÉ ESTO IMPORTA: SON DOS FALLAS DISTINTAS Y ANTES ERAN UNA
 * =============================================================================
 *  Modelando una sola red, el sistema no podía distinguir:
 *
 *    · Cae el switch de campo  -> la cámara NI GRABA NI SE VE.
 *    · Cae el FortiSwitch      -> la cámara SIGUE GRABANDO, pero el púlpito
 *                                 no la ve. La imagen existe; nadie la mira.
 *
 *  La segunda es la que sufre Producción y la que el sistema no sabía decir.
 *  Un operador que reporta «no veo la zona de enfriamiento» puede estar
 *  describiendo cualquiera de las dos, y la respuesta —y quién la atiende— es
 *  completamente distinta.
 *
 * =============================================================================
 *  EL SEGMENTO SE DEDUCE, NO SE ESCRIBE
 * =============================================================================
 *  Nadie teclea «esta cámara es de la red de cámaras». Se compara su IP contra
 *  las subredes YA REGISTRADAS en el módulo de direccionamiento, que es donde
 *  esa información vive de verdad.
 *
 *  Si se pidiera a mano, tendríamos dos verdades —la IP y la etiqueta— y se
 *  contradirían el día que alguien cambie una sin la otra. Es la misma regla
 *  que el tren, la criticidad y el estado efectivo: se calcula.
 */

/** El papel de cada red en la planta. */
export type Segmento =
  /** 192.168.1.x — donde viven las cámaras y los switches de campo. */
  | 'LAN_CAMARAS'
  /** 10.1.x.x — donde viven los FortiSwitch y el púlpito. */
  | 'RED_CCTV'
  /** Registrada pero con otro propósito (gestión, corporativa, proceso). */
  | 'OTRA'
  /** Tiene IP, pero no cae dentro de ninguna subred registrada. */
  | 'FUERA_DE_PLAN'
  /** No tiene IP declarada. NO es lo mismo que «fuera de plan». */
  | 'SIN_IP';

export const NOMBRE_SEGMENTO: Record<Segmento, string> = {
  LAN_CAMARAS: 'Red de cámaras',
  RED_CCTV: 'Red CCTV',
  OTRA: 'Otra red',
  FUERA_DE_PLAN: 'Fuera del plan de direcciones',
  SIN_IP: 'Sin dirección declarada',
};

export interface SubredRegistrada {
  cidr: string;
  nombre: string;
  /** El propósito que ya declara el módulo de direccionamiento. */
  proposito: string;
  vlan?: number | null;
}

// ============================================================ direcciones

/**
 * Convierte una IPv4 a número. Devuelve `null` si no es una IPv4 válida.
 *
 * Se valida de verdad en vez de confiar en un `split`: una cadena como
 * «192.168.1.300» o «10.1.2» pasaría un `split` y daría una comparación
 * silenciosamente equivocada, que es peor que un error.
 */
export function aNumero(ip: string | null | undefined): number | null {
  if (!ip) return null;
  const partes = ip.trim().split('.');
  if (partes.length !== 4) return null;
  let n = 0;
  for (const t of partes) {
    if (!/^\d{1,3}$/.test(t)) return null;
    const v = Number(t);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

/** ¿Cae `ip` dentro de `cidr`? Falso ante cualquier dato malformado. */
export function dentroDe(ip: string | null | undefined, cidr: string): boolean {
  const n = aNumero(ip);
  if (n === null) return false;
  const [base, bitsTxt] = cidr.trim().split('/');
  const b = aNumero(base);
  const bits = Number(bitsTxt);
  if (b === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  /* Con /0 el desplazamiento de 32 bits en JavaScript NO da 0: da el propio
     número, porque el operador usa los 5 bits bajos del corrimiento. Es un
     clásico que produce una máscara equivocada sin avisar. */
  const mascara = bits === 0 ? 0 : (0xFFFFFFFF << (32 - bits)) >>> 0;
  return (n & mascara) === (b & mascara);
}

/**
 * De qué propósito es una subred, traducido a nuestro vocabulario.
 *
 * `PropositoSubred` ya distingue CCTV de GESTION y del resto. Lo que este
 * módulo añade es separar las DOS redes de vídeo entre sí, que el propósito
 * por sí solo no distingue: las dos son «CCTV».
 */
function papelDeSubred(s: SubredRegistrada): Segmento {
  const p = (s.proposito || '').toUpperCase();
  if (p !== 'CCTV') return 'OTRA';
  /* La distinción entre las dos redes de vídeo se hace por el rango, que es lo
     único objetivo que hay: 192.168.x es la LAN de cámaras y 10.x es la red
     CCTV troncal. No se usa el NOMBRE de la subred: un nombre es texto que
     alguien escribió y cambia sin avisar. */
  const base = s.cidr.split('/')[0];
  if (base.startsWith('192.168.')) return 'LAN_CAMARAS';
  if (base.startsWith('10.')) return 'RED_CCTV';
  return 'OTRA';
}

/** En qué segmento está una dirección, según las subredes registradas. */
export function segmentoDe(
  ip: string | null | undefined,
  subredes: SubredRegistrada[],
): { segmento: Segmento; subred: SubredRegistrada | null } {
  if (!ip || !ip.trim()) return { segmento: 'SIN_IP', subred: null };

  /* Se elige la coincidencia MÁS ESPECÍFICA, igual que una tabla de rutas.
     Si alguien registra 10.0.0.0/8 y también 10.1.5.0/24, una dirección de
     esa última tiene que resolver contra la /24, no contra la /8. */
  let mejor: SubredRegistrada | null = null;
  let mejorBits = -1;
  for (const s of subredes) {
    if (!dentroDe(ip, s.cidr)) continue;
    const bits = Number(s.cidr.split('/')[1]);
    if (bits > mejorBits) { mejor = s; mejorBits = bits; }
  }
  if (!mejor) return { segmento: 'FUERA_DE_PLAN', subred: null };
  return { segmento: papelDeSubred(mejor), subred: mejor };
}

// ============================================================ la frontera

export interface EquipoDeRed {
  id: string;
  codigo: string;
  tipo: string;
  /** IP principal del activo. */
  ip?: string | null;
  /** Sólo los grabadores: sus dos patas. */
  nicPrimary?: string | null;
  nicSecondary?: string | null;
}

export interface Frontera {
  id: string;
  codigo: string;
  /** La pata que mira a las cámaras. */
  ladoCamaras: string | null;
  /** La pata que mira al púlpito. */
  ladoCCTV: string | null;
  /** true sólo si las dos patas están declaradas y en segmentos distintos. */
  completo: boolean;
  motivo: string | null;
}

/**
 * Un grabador es frontera cuando tiene UNA PATA EN CADA RED.
 *
 * Se comprueba, no se supone. Un NVR con las dos direcciones en el mismo
 * segmento no está haciendo de puente —está mal configurado o mal
 * registrado— y decir que sí lo hace produciría un análisis de impacto que
 * miente en la dirección peligrosa: diría que el púlpito ve algo que no ve.
 */
export function fronteraDe(
  nvr: EquipoDeRed,
  subredes: SubredRegistrada[],
): Frontera {
  /* Las tres direcciones posibles de un grabador. `ipAddress` cuenta como
     candidata porque en los equipos viejos es la única que se cargó. */
  const candidatas = [nvr.nicPrimary, nvr.nicSecondary, nvr.ip]
    .filter((x): x is string => !!x && !!x.trim());

  let camaras: string | null = null;
  let cctv: string | null = null;
  for (const ip of candidatas) {
    const { segmento } = segmentoDe(ip, subredes);
    if (segmento === 'LAN_CAMARAS' && !camaras) camaras = ip;
    if (segmento === 'RED_CCTV' && !cctv) cctv = ip;
  }

  let motivo: string | null = null;
  if (!candidatas.length) {
    motivo = 'No tiene ninguna dirección declarada, así que no se puede saber '
      + 'si el púlpito llega a él.';
  } else if (!camaras && !cctv) {
    motivo = 'Sus direcciones no caen en ninguna de las dos redes de vídeo '
      + 'registradas. Revisa el plan de direcciones.';
  } else if (!camaras) {
    motivo = 'Le falta la pata de la red de cámaras: sólo se conoce su lado '
      + 'del púlpito.';
  } else if (!cctv) {
    motivo = 'Le falta la pata de la red CCTV. Las cámaras llegan a él, pero '
      + 'no consta cómo lo alcanza el púlpito.';
  }

  return {
    id: nvr.id,
    codigo: nvr.codigo,
    ladoCamaras: camaras,
    ladoCCTV: cctv,
    completo: !!camaras && !!cctv,
    motivo,
  };
}

// ============================================================ incoherencias

export type ClaveHallazgo =
  | 'CAMARA_EN_RED_CCTV'
  | 'SWITCH_CAMPO_EN_RED_CCTV'
  | 'FORTI_EN_LAN_CAMARAS'
  | 'FUERA_DE_PLAN'
  | 'SIN_IP'
  | 'GRABADOR_SIN_PUENTE'
  | 'SIN_SUBREDES';

export interface Hallazgo {
  clave: ClaveHallazgo;
  gravedad: 'ERROR' | 'AVISO';
  equipoId: string | null;
  equipo: string;
  que: string;
  queHacer: string;
}

/** Los que se consideran «de campo»: alimentan cámaras por PoE. */
const MARCAS_DE_CAMPO = ['HIKVISION', 'TP-LINK', 'TPLINK', 'DAHUA'];
const MARCAS_DE_TRONCAL = ['FORTINET', 'FORTISWITCH', 'FORTIGATE'];

export interface EquipoParaRevision extends EquipoDeRed {
  /** Marca declarada, para saber si es de campo o troncal. */
  marca?: string | null;
  /** Si está montado en un tablero eléctrico. */
  enTablero?: boolean;
}

/**
 * Revisa que cada equipo esté en la red que le toca.
 *
 * NO CORRIGE NADA. Enseña la discrepancia y deja que la resuelva quien va al
 * sitio: puede que la IP esté mal registrada y el equipo bien, o al revés, y
 * desde una pantalla no hay forma de saberlo. Corregir automáticamente un dato
 * de planta es inventarlo.
 */
export function revisarSegmentos(
  equipos: EquipoParaRevision[],
  subredes: SubredRegistrada[],
): Hallazgo[] {
  const out: Hallazgo[] = [];

  /* Sin plan de direcciones cargado, TODO saldría «fuera de plan» y la
     pantalla sería una alarma roja falsa el primer día. Se dice una sola vez
     lo que falta, en vez de repetir el mismo error por cada equipo. */
  if (!subredes.length) {
    return [{
      clave: 'SIN_SUBREDES', gravedad: 'AVISO', equipoId: null, equipo: '—',
      que: 'Todavía no hay ninguna subred registrada.',
      queHacer: 'Carga las dos redes en Direccionamiento IP (la de cámaras '
        + '192.168.1.x y la CCTV 10.1.x.x). Hasta entonces no se puede saber '
        + 'si un equipo está en la red que le toca.',
    }];
  }

  const marca = (e: EquipoParaRevision) => (e.marca || '').toUpperCase();
  const esDeCampo = (e: EquipoParaRevision) =>
    MARCAS_DE_CAMPO.some((m) => marca(e).includes(m)) || !!e.enTablero;
  const esTroncal = (e: EquipoParaRevision) =>
    MARCAS_DE_TRONCAL.some((m) => marca(e).includes(m));

  for (const e of equipos) {
    const { segmento } = segmentoDe(e.ip, subredes);

    if (segmento === 'SIN_IP') {
      out.push({
        clave: 'SIN_IP', gravedad: 'AVISO', equipoId: e.id, equipo: e.codigo,
        que: 'No tiene dirección declarada.',
        queHacer: 'Sin IP no se puede comprobar en qué red está ni monitorearlo. '
          + 'Se completa en la ficha del equipo.',
      });
      continue;
    }

    if (segmento === 'FUERA_DE_PLAN') {
      out.push({
        clave: 'FUERA_DE_PLAN', gravedad: 'ERROR', equipoId: e.id, equipo: e.codigo,
        que: `Su dirección ${e.ip} no cae en ninguna subred registrada.`,
        queHacer: 'O la IP está mal, o falta registrar esa subred en '
          + 'Direccionamiento IP. Las dos cosas hay que arreglarlas.',
      });
      continue;
    }

    if (e.tipo === 'CAMERA' && segmento === 'RED_CCTV') {
      out.push({
        clave: 'CAMARA_EN_RED_CCTV', gravedad: 'ERROR', equipoId: e.id, equipo: e.codigo,
        que: 'Es una cámara y está en la red CCTV, no en la de cámaras.',
        queHacer: 'Las cámaras van en la red de cámaras y llegan al púlpito a '
          + 'través del grabador. Una cámara colgada directamente de la red '
          + 'troncal se salta esa frontera.',
      });
    }

    if (e.tipo === 'SWITCH' && esDeCampo(e) && segmento === 'RED_CCTV') {
      out.push({
        clave: 'SWITCH_CAMPO_EN_RED_CCTV', gravedad: 'AVISO', equipoId: e.id, equipo: e.codigo,
        que: 'Es un switch de campo y está direccionado en la red CCTV.',
        queHacer: 'Comprueba si es un caso justificado o un error de registro. '
          + 'Los switches de campo suelen ir en la red de cámaras.',
      });
    }

    if (e.tipo === 'SWITCH' && esTroncal(e) && segmento === 'LAN_CAMARAS') {
      out.push({
        clave: 'FORTI_EN_LAN_CAMARAS', gravedad: 'AVISO', equipoId: e.id, equipo: e.codigo,
        que: 'Es un switch troncal y está direccionado en la red de cámaras.',
        queHacer: 'Comprueba el registro: lo habitual es que el troncal viva en '
          + 'la red CCTV.',
      });
    }

    if (e.tipo === 'NVR') {
      const f = fronteraDe(e, subredes);
      if (!f.completo) {
        out.push({
          clave: 'GRABADOR_SIN_PUENTE', gravedad: 'ERROR', equipoId: e.id, equipo: e.codigo,
          que: f.motivo || 'No hace de puente entre las dos redes.',
          queHacer: 'Declara sus dos direcciones en la ficha del grabador: la '
            + 'de la red de cámaras y la de la red CCTV. Sin las dos, el sistema '
            + 'no puede decir si el púlpito llega a verlo.',
        });
      }
    }
  }

  /* Los errores primero. Un aviso encima de un error hace que el error se lea
     como uno más de la lista y se posponga. */
  return out.sort((a, b) => {
    if (a.gravedad !== b.gravedad) return a.gravedad === 'ERROR' ? -1 : 1;
    return a.equipo.localeCompare(b.equipo, 'es');
  });
}

/** Una línea para la cabecera de la pantalla. */
export function resumirSegmentos(h: Hallazgo[]): string {
  if (!h.length) return 'Todos los equipos están en la red que les corresponde.';
  const errores = h.filter((x) => x.gravedad === 'ERROR').length;
  const avisos = h.length - errores;
  if (!errores) {
    return `${avisos} ${avisos === 1 ? 'equipo' : 'equipos'} sin dirección o `
      + 'con un detalle que revisar.';
  }
  return `${errores} ${errores === 1 ? 'equipo está' : 'equipos están'} en la red `
    + `equivocada o sin plan de direcciones${avisos ? `, y ${avisos} más por revisar` : ''}.`;
}
