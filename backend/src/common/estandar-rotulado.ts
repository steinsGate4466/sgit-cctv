/* =============================================================================
   ESTÁNDAR DE ROTULADO Y COLOR — bloque 30
   -----------------------------------------------------------------------------
   BASADO EN ANSI/TIA-606-C (2017), la norma de administración de
   infraestructura de telecomunicaciones. No es un invento nuestro: es lo que
   pide cualquier auditoría de cableado estructurado, y adoptarla evita tener
   que defender un criterio propio delante de TI.

   Dos cosas que la norma dice y que conviene tener claras:

     · EL COLOR ES RECOMENDADO, NO OBLIGATORIO. Lo obligatorio es que exista
       un estándar interno, que esté documentado y que se mantenga en TODA la
       instalación. Un color a medias es peor que ninguno: enseña a desconfiar.

     · EL IDENTIFICADOR SÍ ES OBLIGATORIO, y tiene que ser único, permanente
       y coincidir con la documentación. De nada sirve el rótulo si el papel
       dice otra cosa.

   -----------------------------------------------------------------------------
   POR QUÉ ESTO VIVE EN EL CÓDIGO Y NO EN UN PDF
   Un estándar de rotulado en un PDF se cumple el primer mes. Aquí el sistema
   GENERA el rótulo y VALIDA el que se escribe a mano, así que la norma no
   depende de que alguien se acuerde. Es la misma idea que atraviesa todo el
   proyecto: si un dato se puede derivar, no se pregunta.
============================================================================= */

export type PropositoCable =
  | 'BACKBONE' | 'SERVIDORES' | 'WIFI_POE' | 'DATOS' | 'CCTV' | 'VOZ' | 'PROCESO';

export interface ColorNormalizado {
  proposito: PropositoCable;
  /** Nombre en castellano, el que dice el técnico. */
  color: string;
  /** Para pintarlo en pantalla. */
  hex: string;
  /** Qué va por ese cable. */
  usa: string;
  /** De dónde sale el criterio. */
  origen: string;
}

/**
 * El código de color de la planta.
 *
 * Se parte de la recomendación de TIA-606-C y se ajusta a lo que hay en
 * Pisco. Los desvíos respecto a la norma van marcados en `origen`: si algún
 * día TI pregunta «¿por qué verde y no naranja?», la respuesta está aquí y
 * no en la memoria de alguien.
 */
export const CODIGO_DE_COLOR: ColorNormalizado[] = [
  {
    proposito: 'BACKBONE', color: 'Naranja', hex: '#EA6A20',
    usa: 'Troncales entre gabinetes y enlaces principales (uplink).',
    origen: 'TIA-606-C: naranja = demarcación / troncal.',
  },
  {
    proposito: 'SERVIDORES', color: 'Negro', hex: '#22262E',
    usa: 'Servidores, grabadores NVR y equipamiento de rack.',
    origen: 'Criterio interno. La norma no fija un color para equipo activo.',
  },
  {
    proposito: 'WIFI_POE', color: 'Amarillo', hex: '#F2C200',
    usa: 'Puntos de acceso inalámbricos y tomas con PoE.',
    origen: 'Criterio interno. Amarillo avisa de que ese puerto lleva tensión.',
  },
  {
    proposito: 'DATOS', color: 'Azul', hex: '#1F5FBF',
    usa: 'Cableado horizontal de datos a puestos de trabajo.',
    origen: 'TIA-606-C: azul = cableado horizontal de estación.',
  },
  {
    proposito: 'CCTV', color: 'Verde', hex: '#1E9E4A',
    usa: 'Cámaras y todo lo que cuelga de la red de videovigilancia.',
    origen: 'TIA-606-C: verde = conexiones de red / seguridad.',
  },
  {
    proposito: 'VOZ', color: 'Blanco', hex: '#E9EDF3',
    usa: 'Telefonía.',
    origen: 'Criterio interno. Se reserva el blanco para no confundirlo con datos.',
  },
  {
    proposito: 'PROCESO', color: 'Rojo', hex: '#C62828',
    usa: 'Red de proceso: PLC, HMI, instrumentación de línea.',
    origen:
      'Criterio interno, y el más importante de la planta: el rojo marca la red que ' +
      'NO se toca sin coordinar con Producción. Un patch cord rojo mal conectado ' +
      'puede detener un tren.',
  },
];

export const colorDe = (p: PropositoCable) =>
  CODIGO_DE_COLOR.find((c) => c.proposito === p) ?? null;

/* =============================================================================
   LA FÓRMULA DE ROTULADO
   -----------------------------------------------------------------------------
   TIA-606-C exige un identificador único y jerárquico. El del sistema es:

       AA-<TIPO>-<TREN>-<ZONA>-<NNN>

   Ejemplos reales del formato:
       AA-CAM-T2-LECHO-014     cámara 14 de la zona del lecho, Tren 2
       AA-SW-T1-PULP-002       switch 2 del púlpito del Tren 1
       AA-NVR-T3-SALA-001      grabador 1 de la sala del Tren 3

   POR QUÉ ASÍ Y NO UN CORRELATIVO
   Un número suelto (CAM-0473) obliga a consultar el sistema para saber dónde
   está. Éste se lee de un vistazo estando delante del equipo, que es cuando
   hace falta: el técnico ve el rótulo y ya sabe tren y zona sin sacar el
   teléfono. Y ordena solo: al listarlos alfabéticamente quedan agrupados por
   tren y por zona.

   EL PREFIJO «AA» NO ES DECORACIÓN. En un rack conviven cables de varios
   contratistas y de varias épocas. El prefijo dice de quién es el estándar.
============================================================================= */

/** Abreviatura por tipo de activo. Corta, sin vocales ambiguas, legible en una
 *  etiqueta de 6 mm impresa en una impresora de campo. */
export const ABREVIATURA_TIPO: Record<string, string> = {
  CAMERA: 'CAM', NVR: 'NVR', SWITCH: 'SW', WIRELESS: 'AP',
  ROUTER: 'RTR', FIREWALL: 'FW', SERVER: 'SRV', UPS: 'UPS',
  CABINET: 'GAB', DECODER: 'DEC', PC: 'PC',
  SCREEN: 'MON', OTHER: 'GEN',
};

export interface PartesDelCodigo {
  prefijo: string; tipo: string; tren: string; zona: string; secuencia: string;
}

/** Quita tildes, espacios y todo lo que no sea A-Z 0-9. */
export function normalizarSegmento(v: string, largo = 6): string {
  return (v ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, largo);
}

/**
 * Arma el rótulo. Devuelve también los avisos: si falta la zona o el tren, el
 * código se genera igual pero MARCADO, porque un código a medias que parece
 * completo es peor que uno que avisa.
 */
export function generarCodigo(d: {
  tipoActivo: string;
  trenCode?: string | null;
  zonaNombre?: string | null;
  secuencia: number;
}): { codigo: string; partes: PartesDelCodigo; avisos: string[] } {
  const avisos: string[] = [];

  const tipo = ABREVIATURA_TIPO[d.tipoActivo] ?? 'GEN';
  if (!ABREVIATURA_TIPO[d.tipoActivo]) {
    avisos.push(`No hay abreviatura para el tipo «${d.tipoActivo}»; se usa GEN.`);
  }

  // Del código de tren AASA-PISCO-T2 nos quedamos con T2.
  let tren = normalizarSegmento((d.trenCode ?? '').split('-').pop() ?? '', 4);
  if (!tren) { tren = 'SIN'; avisos.push('El equipo no cuelga de ningún tren del árbol.'); }

  let zona = normalizarSegmento(d.zonaNombre ?? '', 6);
  if (!zona) { zona = 'SINUB'; avisos.push('El equipo no tiene zona asignada.'); }

  const secuencia = String(Math.max(1, Math.trunc(d.secuencia))).padStart(3, '0');

  const partes = { prefijo: 'AA', tipo, tren, zona, secuencia };
  return {
    codigo: `AA-${tipo}-${tren}-${zona}-${secuencia}`,
    partes,
    avisos,
  };
}

/** El patrón que valida un código escrito a mano. */
export const PATRON_CODIGO = /^AA-[A-Z]{2,5}-[A-Z0-9]{1,4}-[A-Z0-9]{1,6}-\d{3}$/;

/**
 * Revisa un código ya escrito.
 *
 * Separa ERROR de AVISO a propósito. Un código con un formato imposible no
 * entra; uno que cumple el formato pero cuyo tren no coincide con el árbol de
 * planta SÍ entra, avisando — porque puede ser que el equipo se haya movido y
 * el rótulo físico todavía no. Bloquearlo obligaría al técnico a mentir para
 * poder guardar, que es como se corrompen los datos.
 */
export function revisarCodigo(
  codigo: string,
  contexto?: { tipoActivo?: string; trenCode?: string | null },
): { valido: boolean; errores: string[]; avisos: string[] } {
  const errores: string[] = [];
  const avisos: string[] = [];
  const c = (codigo ?? '').trim().toUpperCase();

  if (!c) {
    return { valido: false, errores: ['El código está vacío.'], avisos };
  }
  if (!PATRON_CODIGO.test(c)) {
    errores.push(
      'No sigue el formato AA-TIPO-TREN-ZONA-NNN. Ejemplo: AA-CAM-T2-LECHO-014.',
    );
    return { valido: false, errores, avisos };
  }

  const [, tipo, tren] = c.split('-');

  if (contexto?.tipoActivo) {
    const esperado = ABREVIATURA_TIPO[contexto.tipoActivo];
    if (esperado && tipo !== esperado) {
      avisos.push(
        `El código dice «${tipo}» pero el equipo está registrado como ` +
        `${contexto.tipoActivo} («${esperado}»). Revisa cuál de los dos está mal.`,
      );
    }
  }
  if (contexto?.trenCode) {
    const delArbol = normalizarSegmento(contexto.trenCode.split('-').pop() ?? '', 4);
    if (delArbol && tren !== delArbol && tren !== 'SIN') {
      avisos.push(
        `El rótulo dice «${tren}» y en el árbol de planta cuelga de «${delArbol}». ` +
        'Puede que el equipo se haya movido y la etiqueta física siga siendo la vieja.',
      );
    }
  }

  return { valido: true, errores, avisos };
}

/**
 * Lo que se imprime en la etiqueta física.
 *
 * DOS LÍNEAS, no una. La primera es el código, que es lo que se busca; la
 * segunda dice qué es y de qué color debería ser el cable. Un técnico nuevo
 * delante del rack no tiene por qué saber que «CAM» va en verde.
 */
export function textoDeEtiqueta(codigo: string, proposito?: PropositoCable) {
  const col = proposito ? colorDe(proposito) : null;
  return {
    linea1: codigo,
    linea2: col ? `${col.usa.split('.')[0]} · cable ${col.color.toUpperCase()}` : '',
    color: col,
  };
}
