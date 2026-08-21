/* =============================================================================
   EL COLOR DEL CABLE COMO PARTE DEL ROTULADO — bloque 45
   -----------------------------------------------------------------------------
   LA IDEA, Y NO ES UN CAMPO MÁS

   El rótulo de la planta es `AA-<TIPO>-<TREN>-<ZONA>-<NNN>`. El segmento TIPO ya
   dice para qué sirve el equipo. El COLOR DE LA CHAQUETA dice lo mismo, pero
   para quien está delante del rack con una linterna y no va a leer una etiqueta
   de veinte caracteres. Cada uno VALIDA al otro.

   =============================================================================
    EL COLOR SE DEDUCE DE LOS DOS EXTREMOS, NO DE UN TIPO SUELTO
   =============================================================================
   Ésta es la corrección que costó dos intentos, y viene de cómo se monta de
   verdad una antena PMP en Pisco:

       ANTENA ──PoE 24 V──► FUENTE ──puerto LAN──► SWITCH
              (datos + alimentación)    (SÓLO datos)

   NO es un cable: son DOS TRAMOS, y el color CAMBIA en la fuente porque cambia
   lo que lleva dentro. El tramo que sale del puerto LAN es red pura — AZUL — y
   eso importa en campo: quien abre el rack tiene que saber que por ahí no hay
   tensión, y que por el otro sí.

   Pintar toda la cadena de un color habría sido cómodo y falso.

   =============================================================================
    LA NORMA NO OBLIGA A UN COLOR. OBLIGA A LA COHERENCIA.
   =============================================================================
   ANSI/TIA-606-C recomienda el color como ayuda visual pero no impone cuál. No
   existe color universal obligatorio. Lo exigible es que, elegido el esquema, se
   mantenga idéntico en toda la instalación: el valor no está en cuál sea, está
   en que signifique SIEMPRE lo mismo.

   Por eso los colores viven en un CATÁLOGO EDITABLE en la base. Lo de aquí es
   sólo la REGLA que los deduce, y la semilla acordada con la planta.
============================================================================= */

export type ColorCable =
  | 'NARANJA'   // backbone / uplink entre salas o trenes
  | 'NEGRO'     // servidores y equipos dentro del rack
  | 'AMARILLO'  // lleva ALIMENTACIÓN además de datos (PoE)
  | 'AZUL'      // datos de red, sin tensión
  | 'VERDE'     // CCTV y seguridad
  | 'BLANCO';   // telefonía y voz

export interface DefinicionDeColor {
  color: ColorCable; uso: string; hex: string; orden: number;
  /** Por qué se separa. Es lo que se enseña en la leyenda de Rotulado. */
  porQue: string;
}

/** La semilla del catálogo. En la base es una TABLA EDITABLE. */
export const COLORES: DefinicionDeColor[] = [
  { color: 'NARANJA', uso: 'Backbone / uplink', hex: '#EA580C', orden: 1,
    porQue: 'El troncal entre salas. Si se corta, deja ciego un tren entero.' },
  { color: 'NEGRO', uso: 'Servidores y equipos', hex: '#1F2937', orden: 2,
    porQue: 'Lo que vive dentro del rack y no sale de él.' },
  { color: 'AMARILLO', uso: 'PoE — lleva alimentación', hex: '#EAB308', orden: 3,
    porQue: 'Desconectarlo APAGA el equipo del otro extremo, no sólo lo desconecta.' },
  { color: 'AZUL', uso: 'Datos de red', hex: '#2563EB', orden: 4,
    porQue: 'Red pura, sin tensión. Es el tramo que sale del puerto LAN de una fuente.' },
  { color: 'VERDE', uso: 'CCTV y seguridad', hex: '#16A34A', orden: 5,
    porQue: 'El sistema que sostiene este software. Verlo aparte permite auditarlo.' },
  { color: 'BLANCO', uso: 'Telefonía y voz', hex: '#F3F4F6', orden: 6,
    porQue: 'No es de Mantenimiento CCTV. Se marca para que nadie lo toque por error.' },
];

/** Equipos que viven dentro del rack y no salen de él. */
const DE_RACK = ['SWITCH', 'NVR', 'DECODER', 'SERVER'];

export interface TramoParaRevisar {
  /** Tipo del activo de un extremo (WIRELESS, PSU, SWITCH, CAMERA…). */
  tipoA?: string | null;
  tipoB?: string | null;
  /** true si une dos salas o dos trenes: entonces es troncal, mande quien mande. */
  esTroncal?: boolean;
  colorDeclarado?: ColorCable | null;
  /** Para poder nombrar el tramo en el aviso. */
  etiqueta?: string | null;
}

export interface VeredictoColor {
  esperado: ColorCable | null;
  declarado: ColorCable | null;
  coincide: boolean;
  sinDeclarar: boolean;
  /** Por qué se esperaba ese color. Sin esto, la regla parece arbitraria. */
  motivo: string | null;
  aviso: string | null;
}

const norm = (t?: string | null) => (t || '').trim().toUpperCase();
const usoDe = (c: ColorCable) => COLORES.find((x) => x.color === c)?.uso ?? '';

/**
 * EL COLOR QUE CORRESPONDE, deducido de los dos extremos.
 *
 * El orden de las reglas ES la regla. Se evalúan de la más específica a la más
 * general, y la primera que encaja gana:
 *
 *   1. CCTV manda sobre todo. Decisión de planta: una cámara PoE va VERDE, no
 *      amarilla. El criterio es la FUNCIÓN, no la alimentación — quien mira el
 *      rack quiere saber qué sistema toca.
 *   2. Antena ↔ fuente: AMARILLO. Aquí el PoE sí es lo que distingue, y avisa
 *      de que hay 24 V en ese cable.
 *   3. Troncal entre salas: NARANJA.
 *   4. Cualquier otro tramo de una fuente —su lado LAN— es AZUL: red pura.
 *   5. Entre equipos de rack: NEGRO.
 *   6. A un puesto de trabajo: AZUL.
 */
export function colorEsperado(t: TramoParaRevisar): { color: ColorCable | null; motivo: string | null } {
  const a = norm(t.tipoA);
  const b = norm(t.tipoB);
  const hay = (x: string) => a === x || b === x;

  // 1 — CCTV gana sobre PoE. La cámara es verde aunque se alimente por el cable.
  if (hay('CAMERA')) {
    return { color: 'VERDE', motivo: 'Sirve a una cámara: CCTV manda sobre la alimentación.' };
  }

  // 2 — El tramo con tensión de la antena.
  if (hay('PSU') && hay('WIRELESS')) {
    return { color: 'AMARILLO', motivo: 'Antena alimentada por PoE: este tramo lleva 24 V.' };
  }

  // 3 — Troncal, mande quien mande.
  if (t.esTroncal) {
    return { color: 'NARANJA', motivo: 'Troncal entre salas o trenes.' };
  }

  // 4 — El OTRO lado de la fuente: sólo datos. Es el que se corregía mal.
  if (hay('PSU')) {
    return { color: 'AZUL', motivo: 'Sale del puerto LAN de una fuente: datos sin tensión.' };
  }

  if (hay('PHONE')) {
    return { color: 'BLANCO', motivo: 'Telefonía y voz.' };
  }

  // 5 — Todo dentro del rack.
  if (DE_RACK.includes(a) && DE_RACK.includes(b)) {
    return { color: 'NEGRO', motivo: 'Une dos equipos dentro del rack.' };
  }

  // 6 — A un puesto cableado.
  if (hay('PC') || hay('SCREEN')) {
    return { color: 'AZUL', motivo: 'Dato de red a un punto cableado.' };
  }

  /* Sin los dos extremos no se inventa un color. Devolver uno «razonable»
     aquí sería exactamente lo que este proyecto tiene prohibido. */
  return { color: null, motivo: null };
}

/**
 * Cruza lo declarado con lo esperado. NO CORRIGE NADA.
 *
 * Igual que la contradicción de altura del bloque 41: puede haber un motivo
 * —un tramo provisional, un carrete que se acabó— y corregirlo en silencio
 * sería decidir cuál de los dos datos vale. Se enseña y se pregunta.
 */
export function revisarColor(t: TramoParaRevisar): VeredictoColor {
  const { color: esperado, motivo } = colorEsperado(t);
  const declarado = t.colorDeclarado ?? null;
  const quien = t.etiqueta ? `El tramo ${t.etiqueta}` : 'Este tramo';

  if (!declarado) {
    return {
      esperado, declarado: null, coincide: false, sinDeclarar: true, motivo,
      aviso: esperado
        ? `${quien} no tiene color declarado. Debería ser ${esperado} (${usoDe(esperado)}): ${motivo}`
        : `${quien} no tiene color declarado.`,
    };
  }
  if (!esperado || declarado === esperado) {
    return { esperado, declarado, coincide: true, sinDeclarar: false, motivo, aviso: null };
  }
  return {
    esperado, declarado, coincide: false, sinDeclarar: false, motivo,
    aviso: `${quien} es ${declarado} (${usoDe(declarado)}), pero correspondería `
      + `${esperado} (${usoDe(esperado)}): ${motivo} `
      + 'Uno de los dos datos está mal: o el rótulo o el cable.',
  };
}

export interface ResumenDeColor {
  total: number; correctos: number; discrepantes: number; sinDeclarar: number;
  porColor: Array<{ color: ColorCable; uso: string; hex: string; tramos: number }>;
  titular: string;
}

/** El conteo por color: lo que convierte el estándar en algo MEDIBLE. */
export function resumirColores(v: VeredictoColor[]): ResumenDeColor {
  const r: ResumenDeColor = {
    total: v.length, correctos: 0, discrepantes: 0, sinDeclarar: 0, porColor: [], titular: '',
  };
  const cuenta = new Map<ColorCable, number>();
  for (const x of v) {
    if (x.sinDeclarar) r.sinDeclarar++;
    else if (x.coincide) r.correctos++;
    else r.discrepantes++;
    if (x.declarado) cuenta.set(x.declarado, (cuenta.get(x.declarado) || 0) + 1);
  }
  /* Sólo los colores que EXISTEN en el tren. Una leyenda con cuatro ceros se
     lee como un tablero vacío; la lista corta se lee de un vistazo. */
  r.porColor = COLORES
    .filter((c) => cuenta.get(c.color))
    .map((c) => ({ color: c.color, uso: c.uso, hex: c.hex, tramos: cuenta.get(c.color)! }))
    .sort((a, b) => b.tramos - a.tramos);
  r.titular = titular(r);
  return r;
}

function titular(r: ResumenDeColor): string {
  if (r.total === 0) return 'Todavía no hay tramos de cable cargados en este tren.';
  if (r.discrepantes > 0) {
    return `${r.discrepantes} ${r.discrepantes === 1 ? 'tramo tiene' : 'tramos tienen'} `
      + 'un color que no corresponde. O el rótulo o el cable están mal.';
  }
  if (r.sinDeclarar > 0) {
    return `${r.sinDeclarar} de ${r.total} ${r.sinDeclarar === 1 ? 'tramo no tiene' : 'tramos no tienen'} `
      + 'color declarado. Hasta que se declare, el estándar no se puede comprobar.';
  }
  return `Los ${r.total} tramos siguen el estándar de color de la planta.`;
}
