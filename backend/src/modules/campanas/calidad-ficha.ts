/**
 * QUÉ HACE QUE UNA FICHA ESTÉ MAL CARGADA
 * =============================================================================
 *
 * Ésta es la pieza que de verdad importa del bloque 12.5, y conviene decir por
 * qué está separada del servicio: es una función **pura**. Recibe un activo,
 * devuelve sus defectos. Sin base de datos, sin red, sin estado.
 *
 * Eso permite dos cosas que valen mucho:
 *   · Probarla de verdad, caso por caso, en milisegundos.
 *   · Enseñarle al técnico los mismos defectos EN CAMPO, antes de guardar,
 *     con las mismas reglas exactas que usará el revisor. Si las reglas
 *     vivieran dentro del servicio, la pantalla tendría su propia copia y el
 *     día que se cambie una, el técnico vería una cosa y el revisor otra.
 *
 * =============================================================================
 *  BLOQUEANTE vs AVISO — la distinción que hace esto usable
 * =============================================================================
 *
 *  BLOQUEANTE es lo que hace que el registro **no sirva para nada**:
 *  un activo sin ubicación no se puede encontrar, uno con la ficha a medias
 *  no se puede mantener, un código repetido corrompe el inventario entero.
 *  Con un solo bloqueante, la zona NO se aprueba. No hay "aprobar igual".
 *
 *  AVISO es lo que se puede completar después sin que el dato mienta: falta
 *  la marca, falta el número de serie, falta cómo llegar.
 *
 *  Si todo fuera bloqueante, nadie aprobaría ninguna zona y el control se
 *  saltaría por la vía rápida: dejar de usarlo. Un control que nadie pasa no
 *  protege, estorba.
 *
 * =============================================================================
 *  LO QUE ESTA FUNCIÓN **NO** HACE
 * =============================================================================
 *  No inventa datos de planta ni exige valores que el técnico no pueda saber
 *  en el sitio. Comprueba que el registro esté COMPLETO y sea COHERENTE, no
 *  que diga lo que a alguien le gustaría. La diferencia importa: exigir un
 *  campo que no se puede saber en campo hace que el técnico escriba
 *  cualquier cosa para poder guardar, y eso es peor que dejarlo vacío.
 */

export type Gravedad = 'BLOQUEANTE' | 'AVISO';

export interface Defecto {
  campo: string;
  gravedad: Gravedad;
  /** Qué pasa, en la voz de quien va a tener que arreglarlo. */
  texto: string;
}

/** Lo mínimo que hace falta saber de un activo para juzgarlo. */
export interface ActivoParaRevisar {
  id: string;
  assetCode: string;
  type: string;
  brand?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  locationId?: string | null;
  cabinetId?: string | null;
  referencePlace?: string | null;
  isDraft?: boolean | null;
  ipAddress?: string | null;
  /** Cuántas fotos tiene cargadas. */
  fotos: number;
}

/** Tipos que van montados en rack: sin gabinete no se sabe dónde buscarlos. */
const EN_RACK = new Set(['NVR', 'SWITCH', 'SERVER', 'DECODER', 'ROUTER', 'FIREWALL']);

/** Tipos de los que una foto vale más que tres campos de texto. */
const EXIGEN_FOTO = new Set(['CAMERA', 'WIRELESS', 'PANTALLA']);

/**
 * El patrón de código de Aceros Arequipa: AA-<TIPO>-<resto>.
 * No se exige el formato completo a propósito — la numeración por tren y
 * etapa la fija la planta y no la inventa este código. Sólo se comprueba que
 * el código NO sea un tecleo suelto tipo `camara1` o `zzz`.
 */
const PATRON_CODIGO = /^AA-[A-Z]{2,5}-[A-Z0-9-]{2,}$/i;

export function revisarFicha(a: ActivoParaRevisar): Defecto[] {
  const d: Defecto[] = [];
  const b = (campo: string, texto: string) => d.push({ campo, gravedad: 'BLOQUEANTE', texto });
  const v = (campo: string, texto: string) => d.push({ campo, gravedad: 'AVISO', texto });

  // ---- BLOQUEANTES ----

  // Una ficha marcada como borrador es, literalmente, el técnico diciendo
  // "esto no está terminado". Aprobarla sería contradecirle.
  if (a.isDraft) {
    b('isDraft', 'La ficha está marcada como incompleta. El propio técnico dijo que falta terminarla.');
  }

  // Sin ubicación no se puede ir a buscarlo. Es el defecto que convierte un
  // registro en un número de inventario sin equipo detrás.
  if (!a.locationId) {
    b('locationId', 'No tiene ubicación. Nadie va a poder encontrarlo en planta.');
  }

  if (!a.assetCode || a.assetCode.trim().length < 4) {
    b('assetCode', 'El código está vacío o es demasiado corto.');
  } else if (!PATRON_CODIGO.test(a.assetCode.trim())) {
    b('assetCode', `El código "${a.assetCode}" no sigue el patrón AA-TIPO-...  Suele ser un tecleo de prueba.`);
  }

  if (EN_RACK.has(a.type) && !a.cabinetId) {
    b('cabinetId', `Un ${a.type} va montado en rack: sin gabinete no se sabe en cuál está.`);
  }

  if (EXIGEN_FOTO.has(a.type) && a.fotos === 0) {
    // La foto es lo que permite reconocer el equipo sin volver a subir.
    b('fotos', 'No tiene ninguna foto. En este tipo de equipo la foto es lo que evita la segunda visita.');
  }

  // ---- AVISOS ----

  if (!a.brand && !a.model) {
    v('marca', 'Sin marca ni modelo. Se puede completar después mirando la etiqueta del equipo.');
  }
  if (!a.serialNumber) {
    v('serialNumber', 'Sin número de serie. Hace falta para la garantía y para el reclamo al proveedor.');
  }
  if (!a.referencePlace || a.referencePlace.trim().length < 8) {
    v('referencePlace', 'Sin referencia de dónde está exactamente. El personal nuevo va a dar vueltas.');
  }

  return d;
}

/** ¿Se puede aprobar? Basta un bloqueante para que no. */
export const tieneBloqueantes = (d: Defecto[]) => d.some((x) => x.gravedad === 'BLOQUEANTE');

/**
 * Defectos que sólo se ven mirando el CONJUNTO, no una ficha suelta.
 * El más caro de todos: dos equipos con el mismo código o la misma IP.
 * Uno solo no se puede detectar; los dos juntos, sí.
 */
export function defectosDeConjunto(activos: ActivoParaRevisar[]): Map<string, Defecto[]> {
  const porActivo = new Map<string, Defecto[]>();
  const anotar = (id: string, def: Defecto) => {
    if (!porActivo.has(id)) porActivo.set(id, []);
    porActivo.get(id)!.push(def);
  };

  const porCodigo = new Map<string, string[]>();
  const porIp = new Map<string, string[]>();

  for (const a of activos) {
    const c = (a.assetCode || '').trim().toUpperCase();
    if (c) porCodigo.set(c, [...(porCodigo.get(c) ?? []), a.id]);
    const ip = (a.ipAddress || '').trim();
    if (ip) porIp.set(ip, [...(porIp.get(ip) ?? []), a.id]);
  }

  for (const [codigo, ids] of porCodigo) {
    if (ids.length < 2) continue;
    for (const id of ids) {
      anotar(id, {
        campo: 'assetCode', gravedad: 'BLOQUEANTE',
        texto: `El código ${codigo} está repetido en ${ids.length} equipos de esta zona. Uno de los dos está mal.`,
      });
    }
  }

  for (const [ip, ids] of porIp) {
    if (ids.length < 2) continue;
    for (const id of ids) {
      anotar(id, {
        campo: 'ipAddress', gravedad: 'BLOQUEANTE',
        texto: `La IP ${ip} está repetida en ${ids.length} equipos. Dos equipos con la misma IP se tumban entre ellos.`,
      });
    }
  }

  return porActivo;
}
