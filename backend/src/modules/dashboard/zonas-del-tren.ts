/**
 * TODO LO DE UN TREN, AGRUPADO POR ZONA — bloque 49.
 *
 * =============================================================================
 *  LA PREGUNTA QUE RESUELVE
 * =============================================================================
 *  «Elijo Tren 1 y me suelta todo lo del Tren 1, por zona.»
 *
 *  Hasta ahora, para saber qué pasa en un tren había que abrir cuatro
 *  pantallas: Mis cámaras dice qué falla, Mis activos qué hay, De qué depende
 *  por qué, y Mapa de red dónde está enchufado. Cada una contesta bien su
 *  parte, y ninguna contesta «¿cómo está mi tren?».
 *
 * =============================================================================
 *  POR QUÉ LA ZONA Y NO EL EQUIPO
 * =============================================================================
 *  Producción piensa en «la zona de enfriamiento», no en AA-CAM-T1-FX-007. La
 *  zona es la unidad con la que se habla por radio, se para un tren y se
 *  decide si algo es urgente. El código del equipo está un clic más abajo,
 *  para quien lo necesite.
 *
 * =============================================================================
 *  TRES ESTADOS, NUNCA DOS
 * =============================================================================
 *  Una zona puede estar BIEN, MAL o SIN MEDIR, y el tercero es el importante.
 *  Una zona sin cámaras cargadas no está bien: está sin medir. Pintarla verde
 *  es la mentira que hace que nadie vuelva a creerse la pantalla — y es la
 *  regla «sin datos, nunca cero» que atraviesa todo el sistema.
 */

/** Cómo está una zona, de un vistazo. */
export type SaludDeZona =
  /** Hay cámaras y todas ven. */
  | 'BIEN'
  /** Hay cámaras y alguna no ve. */
  | 'MAL'
  /** No hay cámaras cargadas. NO es «bien». */
  | 'SIN_MEDIR';

/** Lo que hace falta de cada activo para agrupar. Nada más. */
export interface ActivoDeZona {
  id: string;
  codigo: string;
  tipo: string;
  /** Estado ya derivado (con incidencias abiertas aplicadas). */
  estado: string;
  /** Zona resuelta del árbol. `null` si el activo no tiene zona. */
  zonaCode: string | null;
  zonaNombre: string | null;
  /** Criticidad derivada de la zona y del activo. */
  criticidad: string | null;
  /** Si la zona es vital para la producción, la declara Producción. */
  zonaVital?: boolean;
  /** Cómo se llega: sólo interesa si exige elevador. */
  exigeElevador?: boolean;
  /** Montado en un tablero eléctrico: abrirlo exige bloqueo. */
  enTablero?: boolean;
  lugar?: string | null;
}

export interface ResumenDeZona {
  code: string;
  nombre: string;
  vital: boolean;
  salud: SaludDeZona;
  camaras: number;
  camarasViendo: number;
  activos: number;
  conIncidencia: number;
  /** Cuántos equipos exigen manlift. Se cuenta en subidas, nunca en soles. */
  exigenElevador: number;
  /** Cuántos viven dentro de un tablero eléctrico. */
  enTablero: number;
  /** Desglose por tipo, para la fila de pastillas. */
  porTipo: { tipo: string; n: number }[];
  /** La frase de la zona, ya escrita. */
  queDice: string;
}

export interface TotalesDelTren {
  camaras: number;
  camarasViendo: number;
  activos: number;
  conIncidencia: number;
  exigenElevador: number;
  zonas: number;
  zonasSinMedir: number;
}

/** Los estados en los que una cámara NO está viendo. */
const NO_VE = ['FUERA_SERVICIO', 'CON_INCIDENCIA', 'MANTENIMIENTO'];

/** Plural sin el «(s)» que afea las pantallas. */
function n(cant: number, sing: string, plur: string): string {
  return `${cant} ${cant === 1 ? sing : plur}`;
}

/** Nombre de cada tipo, como se dice en planta. */
const EN_PLANTA: Record<string, [string, string]> = {
  CAMERA: ['cámara', 'cámaras'],
  SWITCH: ['switch', 'switches'],
  NVR: ['grabador', 'grabadores'],
  WIRELESS: ['antena', 'antenas'],
  PSU: ['fuente', 'fuentes'],
  SERVER: ['servidor', 'servidores'],
  PC: ['PC', 'PC'],
  PANTALLA: ['pantalla', 'pantallas'],
  PHONE: ['teléfono', 'teléfonos'],
  UPS: ['UPS', 'UPS'],
};

export function nombreDeTipo(tipo: string, cant: number): string {
  const par = EN_PLANTA[tipo];
  if (!par) return cant === 1 ? 'equipo' : 'equipos';
  return cant === 1 ? par[0] : par[1];
}

/**
 * La frase de la zona. Es lo único que se lleva quien mira cinco segundos.
 *
 * Se construye poniendo PRIMERO el efecto y después el detalle: «2 cámaras
 * sin imagen» pesa más que «zona de enfriamiento con incidencias». La segunda
 * forma obliga a leer hasta el final para saber si hay que hacer algo.
 */
function frase(z: {
  salud: SaludDeZona; camaras: number; camarasViendo: number;
  vital: boolean; exigenElevador: number; activos: number;
}): string {
  if (z.salud === 'SIN_MEDIR') {
    return z.activos
      ? `${n(z.activos, 'equipo registrado', 'equipos registrados')}, pero ninguna cámara: `
        + 'esta zona no se está viendo ni se sabe si debería.'
      : 'No hay nada registrado en esta zona todavía.';
  }

  if (z.salud === 'MAL') {
    const caidas = z.camaras - z.camarasViendo;
    const extra = z.exigenElevador
      ? ` Para atenderlo hacen falta ${n(z.exigenElevador, 'subida con manlift', 'subidas con manlift')}.`
      : '';
    return `${n(caidas, 'cámara sin imagen', 'cámaras sin imagen')} de ${z.camaras}.`
      + (z.vital ? ' Es zona vital para la producción.' : '') + extra;
  }

  /* El artículo va DENTRO de cada rama. Sacarlo fuera producía «Las cámara ve
     bien» en singular: el número concordaba y el artículo no. */
  return z.camaras === 1
    ? 'La cámara ve bien.'
    : `Las ${z.camaras} cámaras ven bien.`;
}

/**
 * Agrupa los activos de un tren por zona.
 *
 * Los que no tienen zona NO se descartan: van a un grupo propio. Un activo sin
 * zona es un dato incompleto que alguien tiene que arreglar, y esconderlo hace
 * que nadie lo arregle nunca — además de que los totales dejarían de cuadrar
 * con el inventario, que es la forma más rápida de perder la confianza.
 */
export function zonasDelTren(activos: ActivoDeZona[]): {
  zonas: ResumenDeZona[];
  totales: TotalesDelTren;
} {
  const SIN_ZONA = '__SIN_ZONA__';
  const grupos = new Map<string, ActivoDeZona[]>();

  for (const a of activos) {
    const clave = a.zonaCode ?? SIN_ZONA;
    const l = grupos.get(clave) ?? [];
    l.push(a);
    grupos.set(clave, l);
  }

  const zonas: ResumenDeZona[] = [...grupos.entries()].map(([code, lista]) => {
    const camaras = lista.filter((a) => a.tipo === 'CAMERA');
    const camarasViendo = camaras.filter((a) => !NO_VE.includes(a.estado)).length;
    const vital = lista.some((a) => a.zonaVital);

    const salud: SaludDeZona = camaras.length === 0
      ? 'SIN_MEDIR'
      : camarasViendo === camaras.length ? 'BIEN' : 'MAL';

    const conteo = new Map<string, number>();
    for (const a of lista) conteo.set(a.tipo, (conteo.get(a.tipo) ?? 0) + 1);

    const base = {
      code: code === SIN_ZONA ? '' : code,
      nombre: code === SIN_ZONA
        ? 'Sin zona asignada'
        : lista.find((a) => a.zonaNombre)?.zonaNombre || code,
      vital,
      salud,
      camaras: camaras.length,
      camarasViendo,
      activos: lista.length,
      conIncidencia: lista.filter((a) => a.estado === 'CON_INCIDENCIA').length,
      exigenElevador: lista.filter((a) => a.exigeElevador).length,
      enTablero: lista.filter((a) => a.enTablero).length,
      porTipo: [...conteo.entries()]
        .map(([tipo, cant]) => ({ tipo, n: cant }))
        .sort((x, y) => y.n - x.n || x.tipo.localeCompare(y.tipo)),
    };

    return { ...base, queDice: frase(base) };
  });

  /* De más grave a menos, y con las vitales por delante a igualdad de estado.
     Quien abre esta pantalla no viene a leerla entera: viene a ver dónde está
     el problema. «Sin zona asignada» va SIEMPRE al final: es una tarea de
     limpieza de datos, no una alarma de planta. */
  const peso = (z: ResumenDeZona) => (z.salud === 'MAL' ? 0 : z.salud === 'SIN_MEDIR' ? 1 : 2);
  zonas.sort((a, b) => {
    if (!a.code !== !b.code) return a.code ? -1 : 1;
    if (peso(a) !== peso(b)) return peso(a) - peso(b);
    if (a.vital !== b.vital) return a.vital ? -1 : 1;
    const caidas = (z: ResumenDeZona) => z.camaras - z.camarasViendo;
    if (caidas(b) !== caidas(a)) return caidas(b) - caidas(a);
    return a.nombre.localeCompare(b.nombre, 'es');
  });

  const totales: TotalesDelTren = {
    camaras: zonas.reduce((s, z) => s + z.camaras, 0),
    camarasViendo: zonas.reduce((s, z) => s + z.camarasViendo, 0),
    activos: zonas.reduce((s, z) => s + z.activos, 0),
    conIncidencia: zonas.reduce((s, z) => s + z.conIncidencia, 0),
    exigenElevador: zonas.reduce((s, z) => s + z.exigenElevador, 0),
    zonas: zonas.length,
    zonasSinMedir: zonas.filter((z) => z.salud === 'SIN_MEDIR').length,
  };

  return { zonas, totales };
}

/** El titular del tren: una línea que se lee desde la puerta. */
export function titularDelTren(nombreTren: string, t: TotalesDelTren): string {
  if (!t.activos) {
    return `Todavía no hay nada registrado en ${nombreTren}.`;
  }
  const caidas = t.camaras - t.camarasViendo;
  if (caidas > 0) {
    return `${n(caidas, 'cámara sin imagen', 'cámaras sin imagen')} en ${nombreTren}.`;
  }
  if (!t.camaras) {
    return `${nombreTren} tiene ${n(t.activos, 'equipo', 'equipos')} registrados y `
      + 'ninguna cámara: no se está midiendo nada.';
  }
  if (t.zonasSinMedir) {
    return `Todas las cámaras de ${nombreTren} ven bien, pero `
      + `${n(t.zonasSinMedir, 'zona no tiene cámaras', 'zonas no tienen cámaras')}.`;
  }
  return `${nombreTren} con vista completa: ${n(t.camaras, 'cámara viendo', 'cámaras viendo')}.`;
}
