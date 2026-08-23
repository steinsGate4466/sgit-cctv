/**
 * SALUD DE LOS DATOS — bloque 50.
 *
 * =============================================================================
 *  POR QUÉ ESTA PANTALLA ES LA MÁS IMPORTANTE QUE FALTABA
 * =============================================================================
 *  Las implantaciones de sistemas de mantenimiento no fracasan por el código:
 *  fracasan por los datos. La causa citada una y otra vez en la literatura del
 *  sector es la misma — el registro de activos se carga incompleto, nadie lo
 *  nota hasta meses después, y para entonces el sistema ya perdió la confianza
 *  de quien tenía que usarlo.
 *
 *  Aquí el riesgo es exactamente ése. El código está probado; lo que puede
 *  hundir el proyecto es que la planta cargue treinta cámaras a medias.
 *
 *  Esta pantalla convierte «el sistema está mal» en una lista de trabajo con
 *  nombre y apellido: qué falta, dónde, y quién lo carga.
 *
 * =============================================================================
 *  LAS SEIS DIMENSIONES, Y CUÁLES SE PUEDEN MEDIR HOY
 * =============================================================================
 *  El marco estándar de calidad de datos usa seis dimensiones. No todas se
 *  pueden medir desde dentro del sistema, y decirlo es parte de ser honesto:
 *
 *    COMPLETITUD  sí — ¿están rellenos los campos que hacen falta?
 *    VALIDEZ      sí — ¿tienen la forma correcta? (IP, altura, código)
 *    UNICIDAD     sí — ¿hay dos activos con la misma IP o el mismo código?
 *    CONSISTENCIA sí — ¿se contradicen entre sí? (cámara sin grabador)
 *    VIGENCIA     parcial — se sabe cuándo se editó, no cuándo se verificó
 *                 en campo. Son cosas distintas y no se disimula.
 *    EXACTITUD    NO — que la IP registrada sea la real sólo lo puede decir
 *                 el agente de monitoreo. Se declara «sin medir» en vez de
 *                 inventar un número.
 *
 *  Una puntuación que incluyera exactitud sin poder medirla sería más alta y
 *  más falsa. Se prefiere un 62 % honesto a un 90 % inventado.
 */

export type Dimension =
  | 'COMPLETITUD' | 'VALIDEZ' | 'UNICIDAD' | 'CONSISTENCIA'
  | 'VIGENCIA' | 'EXACTITUD';

export const NOMBRE_DIMENSION: Record<Dimension, string> = {
  COMPLETITUD: 'Completitud',
  VALIDEZ: 'Validez',
  UNICIDAD: 'Unicidad',
  CONSISTENCIA: 'Consistencia',
  VIGENCIA: 'Vigencia',
  EXACTITUD: 'Exactitud',
};

export const QUE_MIDE: Record<Dimension, string> = {
  COMPLETITUD: 'Si están rellenos los campos que hacen falta para trabajar.',
  VALIDEZ: 'Si lo que está escrito tiene la forma correcta.',
  UNICIDAD: 'Si no hay dos equipos con el mismo código o la misma dirección.',
  CONSISTENCIA: 'Si los datos no se contradicen entre sí.',
  VIGENCIA: 'Cuándo se tocó por última vez cada ficha.',
  EXACTITUD: 'Si lo registrado coincide con la realidad de la planta.',
};

/** Un activo, con lo justo para poder puntuarlo. */
export interface ActivoParaSalud {
  id: string;
  codigo: string;
  tipo: string;
  tren: string | null;
  /** Ubicación resuelta del árbol. */
  tieneUbicacion: boolean;
  ip: string | null;
  /** Sólo las cámaras: a qué grabador entra. */
  nvrId?: string | null;
  /** Declarado en el bloque 41: cómo se llega al equipo. */
  medioAcceso?: string | null;
  alturaMetros?: number | null;
  marca?: string | null;
  modelo?: string | null;
  serie?: string | null;
  /** Última edición de la ficha. NO es lo mismo que verificación en campo. */
  editadoEn?: Date | string | null;
}

export interface Hueco {
  /** Qué falta, dicho como una tarea. */
  falta: string;
  dimension: Dimension;
  /** Cuántos activos lo tienen. */
  cuantos: number;
  /** Hasta 5 códigos, para poder empezar por algún sitio. */
  ejemplos: string[];
  /** Quién lo carga. Sin esto, la lista no la coge nadie. */
  quien: string;
}

export interface PuntajeDimension {
  dimension: Dimension;
  nombre: string;
  queMide: string;
  /** 0-100, o `null` cuando la dimensión no se puede medir todavía. */
  puntos: number | null;
  /** Por qué no se puede medir, si es el caso. */
  porQueNo: string | null;
}

export interface SaludDeDatos {
  /** Nota global, 0-100. `null` si no hay ni un activo. */
  puntos: number | null;
  total: number;
  dimensiones: PuntajeDimension[];
  huecos: Hueco[];
  titular: string;
}

// ============================================================ auxiliares

const RE_IP = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** ¿Es una IPv4 con los cuatro octetos en rango? */
export function ipValida(ip: string | null | undefined): boolean {
  if (!ip) return false;
  const m = RE_IP.exec(ip.trim());
  if (!m) return false;
  return m.slice(1).every((o) => Number(o) <= 255);
}

/** Porcentaje entero. Sin activos devuelve `null`, nunca 100. */
function pct(bien: number, total: number): number | null {
  if (!total) return null;
  return Math.round((bien / total) * 100);
}

function nCosas(n: number, sing: string, plur: string): string {
  return `${n} ${n === 1 ? sing : plur}`;
}

/** Hasta cinco códigos: los suficientes para empezar, no para abrumar. */
function muestra(lista: ActivoParaSalud[]): string[] {
  return lista.slice(0, 5).map((a) => a.codigo);
}

// ============================================================ el cálculo

/**
 * Puntúa el estado de los datos.
 *
 * NO PENALIZA LO QUE NO APLICA. Un switch no necesita grabador y una cámara de
 * pared no necesita altura de manlift. Contar como «incompleto» un campo que
 * ese tipo de equipo no lleva daría una nota falsa hacia abajo, y una nota que
 * no se puede subir se deja de mirar igual que una que siempre está en verde.
 */
export function saludDeDatos(activos: ActivoParaSalud[]): SaludDeDatos {
  const total = activos.length;
  const huecos: Hueco[] = [];

  if (!total) {
    return {
      puntos: null,
      total: 0,
      dimensiones: (Object.keys(NOMBRE_DIMENSION) as Dimension[]).map((d) => ({
        dimension: d,
        nombre: NOMBRE_DIMENSION[d],
        queMide: QUE_MIDE[d],
        puntos: null,
        porQueNo: 'Todavía no hay activos cargados.',
      })),
      huecos: [],
      titular: 'Todavía no hay ningún activo cargado, así que no hay nada que medir.',
    };
  }

  const camaras = activos.filter((a) => a.tipo === 'CAMERA');
  const conRed = activos.filter(
    (a) => ['CAMERA', 'SWITCH', 'NVR', 'WIRELESS', 'ROUTER', 'FIREWALL', 'SERVER'].includes(a.tipo),
  );

  const apunta = (
    lista: ActivoParaSalud[], falta: string, dimension: Dimension, quien: string,
  ) => {
    if (!lista.length) return;
    huecos.push({ falta, dimension, cuantos: lista.length, ejemplos: muestra(lista), quien });
  };

  // ---------------------------------------------------------- COMPLETITUD
  const sinUbicacion = activos.filter((a) => !a.tieneUbicacion);
  const sinTren = activos.filter((a) => !a.tren);
  const sinIp = conRed.filter((a) => !a.ip);
  const sinAcceso = activos.filter((a) => !a.medioAcceso);
  const sinMarca = activos.filter((a) => !a.marca);
  const sinSerie = activos.filter((a) => !a.serie);
  const camSinNvr = camaras.filter((a) => !a.nvrId);

  apunta(sinUbicacion, 'Sin ubicación en el árbol de planta', 'COMPLETITUD', 'Mantenimiento');
  apunta(sinTren, 'Sin tren resuelto: no aparecen en las pantallas por sector', 'COMPLETITUD', 'Mantenimiento');
  apunta(sinIp, 'Equipos de red sin dirección IP', 'COMPLETITUD', 'Técnico de red');
  apunta(sinAcceso, 'Sin declarar cómo se llega (a pie, escalera, manlift)', 'COMPLETITUD', 'Técnico de campo');
  apunta(camSinNvr, 'Cámaras sin grabador asignado', 'COMPLETITUD', 'Técnico de red');
  apunta(sinMarca, 'Sin marca ni modelo', 'COMPLETITUD', 'Mantenimiento');
  apunta(sinSerie, 'Sin número de serie', 'COMPLETITUD', 'Mantenimiento');

  /* Se pondera: la ubicación y el tren valen más que el número de serie.
     Un activo sin serie se puede mantener; uno sin ubicación no se encuentra. */
  const campos: [number, number][] = [
    [activos.length - sinUbicacion.length, activos.length],
    [activos.length - sinTren.length, activos.length],
    [conRed.length - sinIp.length, conRed.length],
    [activos.length - sinAcceso.length, activos.length],
    [camaras.length - camSinNvr.length, camaras.length],
    [activos.length - sinMarca.length, activos.length],
    [activos.length - sinSerie.length, activos.length],
  ];
  const pesos = [3, 3, 2, 2, 2, 1, 1];
  let num = 0; let den = 0;
  campos.forEach(([bien, tot], i) => {
    if (!tot) return;               // no penaliza lo que no aplica
    num += (bien / tot) * pesos[i];
    den += pesos[i];
  });
  const completitud = den ? Math.round((num / den) * 100) : null;

  // --------------------------------------------------------------- VALIDEZ
  const ipMala = conRed.filter((a) => a.ip && !ipValida(a.ip));
  const alturaMala = activos.filter(
    (a) => a.alturaMetros != null && (a.alturaMetros < 0 || a.alturaMetros > 100),
  );
  apunta(ipMala, 'Direcciones IP mal escritas', 'VALIDEZ', 'Técnico de red');
  apunta(alturaMala, 'Alturas fuera de lo posible (negativas o más de 100 m)', 'VALIDEZ', 'Técnico de campo');
  const conFormato = ipMala.length + alturaMala.length;
  const validez = pct(total - conFormato, total);

  // -------------------------------------------------------------- UNICIDAD
  const porCodigo = new Map<string, ActivoParaSalud[]>();
  for (const a of activos) {
    const k = a.codigo.trim().toUpperCase();
    porCodigo.set(k, [...(porCodigo.get(k) ?? []), a]);
  }
  const codigoRepetido = [...porCodigo.values()].filter((l) => l.length > 1).flat();

  const porIp = new Map<string, ActivoParaSalud[]>();
  for (const a of conRed) {
    if (!a.ip || !ipValida(a.ip)) continue;
    const k = a.ip.trim();
    porIp.set(k, [...(porIp.get(k) ?? []), a]);
  }
  const ipRepetida = [...porIp.values()].filter((l) => l.length > 1).flat();

  apunta(codigoRepetido, 'Código de activo repetido', 'UNICIDAD', 'Mantenimiento');
  /* La IP duplicada es de las averías más caras de diagnosticar: los dos
     equipos funcionan a ratos y la falla parece intermitente. */
  apunta(ipRepetida, 'Misma dirección IP en dos equipos', 'UNICIDAD', 'Técnico de red');
  const unicidad = pct(total - codigoRepetido.length - ipRepetida.length, total);

  // ----------------------------------------------------------- CONSISTENCIA
  /* Una altura de trabajo en altura sin medio de acceso declarado es la
     contradicción más peligrosa del sistema: dice que hay que subir y no dice
     cómo, y alguien puede ir sin preparar nada. */
  const alturaSinAcceso = activos.filter(
    (a) => (a.alturaMetros ?? 0) >= 1.8 && !a.medioAcceso,
  );
  const ipSinSerRed = activos.filter(
    (a) => a.ip && !['CAMERA', 'SWITCH', 'NVR', 'WIRELESS', 'ROUTER', 'FIREWALL', 'SERVER', 'PC'].includes(a.tipo),
  );
  apunta(alturaSinAcceso, 'Están a 1,80 m o más y no dicen cómo se sube', 'CONSISTENCIA', 'Técnico de campo');
  apunta(ipSinSerRed, 'Tienen IP y no son equipos de red', 'CONSISTENCIA', 'Técnico de red');
  const consistencia = pct(total - alturaSinAcceso.length - ipSinSerRed.length, total);

  // --------------------------------------------------------------- VIGENCIA
  const haceUnAno = Date.now() - 365 * 24 * 3600 * 1000;
  const viejos = activos.filter((a) => {
    if (!a.editadoEn) return true;
    return new Date(a.editadoEn).getTime() < haceUnAno;
  });
  apunta(viejos, 'Fichas sin tocar en más de un año', 'VIGENCIA', 'Mantenimiento');
  const vigencia = pct(total - viejos.length, total);

  // ------------------------------------------------------- las dimensiones
  const dimensiones: PuntajeDimension[] = [
    { dimension: 'COMPLETITUD', puntos: completitud, porQueNo: null },
    { dimension: 'VALIDEZ', puntos: validez, porQueNo: null },
    { dimension: 'UNICIDAD', puntos: unicidad, porQueNo: null },
    { dimension: 'CONSISTENCIA', puntos: consistencia, porQueNo: null },
    {
      dimension: 'VIGENCIA',
      puntos: vigencia,
      porQueNo: 'Mide cuándo se editó la ficha, no cuándo se verificó en campo. '
        + 'Son cosas distintas.',
    },
    {
      dimension: 'EXACTITUD',
      puntos: null,
      porQueNo: 'No se puede medir desde el sistema: que la IP registrada sea la '
        + 'real sólo lo dirá el agente de monitoreo cuando esté instalado.',
    },
  ].map((d) => ({
    ...d,
    nombre: NOMBRE_DIMENSION[d.dimension as Dimension],
    queMide: QUE_MIDE[d.dimension as Dimension],
  })) as PuntajeDimension[];

  /* La nota global promedia sólo lo que SE PUDO medir. Contar exactitud como
     cero castigaría a la planta por una pieza que todavía no existe. */
  const medibles = dimensiones.filter((d) => d.puntos !== null);
  const puntos = medibles.length
    ? Math.round(medibles.reduce((s, d) => s + (d.puntos as number), 0) / medibles.length)
    : null;

  /* Los huecos, de más a menos gente afectada. Es el orden en que conviene
     atacarlos: el que aparece arriba desbloquea más pantallas. */
  huecos.sort((a, b) => b.cuantos - a.cuantos);

  return { puntos, total, dimensiones, huecos, titular: titular(puntos, total, huecos) };
}

function titular(puntos: number | null, total: number, huecos: Hueco[]): string {
  if (puntos === null) return 'No hay datos suficientes para puntuar.';
  const equipos = nCosas(total, 'activo cargado', 'activos cargados');

  if (!huecos.length) {
    return `${equipos} y ninguna falta detectada. Los datos están listos.`;
  }
  const peor = huecos[0];
  if (puntos >= 85) {
    return `${equipos}, datos al ${puntos} %. Lo que más falta: `
      + `${peor.falta.toLowerCase()} (${peor.cuantos}).`;
  }
  if (puntos >= 60) {
    return `${equipos}, datos al ${puntos} %. Se puede trabajar, pero `
      + `${nCosas(huecos.length, 'cosa', 'cosas')} por completar.`;
  }
  return `${equipos}, datos al ${puntos} %. Las pantallas van a enseñar huecos `
    + 'hasta que se complete lo de abajo.';
}
