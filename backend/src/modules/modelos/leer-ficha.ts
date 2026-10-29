/* =============================================================================
   ASISTENTE DE FICHA — bloque 184 (lógica pura, probada aparte)
   -----------------------------------------------------------------------------
   Lee el TEXTO de una ficha técnica (el navegador lo saca del PDF) y PROPONE
   los valores: resolución, ángulos, distancias DORI por lente, zoom e
   infrarrojo. NO GUARDA NADA: el técnico revisa cada número con el PDF
   delante, lo confirma, y otra persona lo verifica. Si algo no se encuentra,
   se dice en `avisos` en vez de rellenarlo con un valor «razonable».

   Por qué el servidor recibe el texto y no el PDF: abrir PDFs ajenos en el
   servidor es una puerta a ataques de denegación de servicio y no aporta nada
   aquí. El PDF se guarda tal cual como prueba; el texto sólo sirve para
   proponer.

   Formatos que reconoce (fichas Hikvision reales):
     · «2.8 mm, D: 67 m, O: 26 m, R: 13 m, I: 6 m»
     · «DORI (2.8 mm) Detect: 67 m, Observe: 26 m, Recognize: 13 m, Identify: 6 m»
     · tabla: «Detect Observe Recognize Identify» + «Distance (Tele) 2400.0 m (7874.0 ft) …»
     · «2.8 mm: horizontal FOV 103°, vertical FOV 55°»
     · «Horizontal field of view: 60.2° to 2.0° (wide-tele)»
============================================================================= */

export interface DoriPropuesto {
  identificarM: number;
  reconocerM: number;
  observarM: number;
  detectarM: number;
}

export interface LentePropuesta {
  lente: string;
  anguloH: number | null;
  anguloV: number | null;
  dori: DoriPropuesto | null;
  /** A qué ángulo da la ficha esas distancias. */
  doriEn: 'GRAN_ANGULAR' | 'TELE' | null;
}

export interface PropuestaDeFicha {
  marca: string | null;
  modelo: string | null;
  resolucion: { ancho: number; alto: number } | null;
  sensor: string | null;
  zoomOptico: number | null;
  anguloHTele: number | null;
  irM: number | null;
  lentes: LentePropuesta[];
  avisos: string[];
}

/** Tope del texto que se acepta: una ficha son 2-6 páginas, ~20.000 letras. */
export const MAX_TEXTO_FICHA = 200_000;

const NUM = String.raw`(\d{1,5}(?:[.,]\d{1,2})?)`;
const n = (s: string) => Number(s.replace(',', '.'));

function normalizar(texto: string): string {
  return texto
    .slice(0, MAX_TEXTO_FICHA)
    .replace(/\r\n?/g, '\n')
    .replace(/[×✕]/g, 'x')
    .replace(/[″”“]/g, '"')
    .replace(/º/g, '°')
    .replace(/[ \t ]+/g, ' ');
}

/** «2.8mm», «2,8 mm», «2.8-12 mm», «5.9 mm to 188.8 mm» → «2.8 mm», «2.8-12 mm», «5.9-188.8 mm». */
export function lenteCanonica(texto: string): string | null {
  const t = texto.replace(',', '.').toLowerCase();
  const rango = t.match(/(\d{1,3}(?:\.\d{1,2})?)\s*(?:mm)?\s*(?:-|~|to|a)\s*(\d{1,3}(?:\.\d{1,2})?)\s*mm/);
  if (rango) return `${n(rango[1])}-${n(rango[2])} mm`;
  const fija = t.match(/(\d{1,3}(?:\.\d{1,2})?)\s*mm/);
  return fija ? `${n(fija[1])} mm` : null;
}

function buscarResolucion(t: string): { ancho: number; alto: number } | null {
  const etiquetada = t.match(new RegExp(String.raw`(?:max\.?\s*resolution|resoluci[oó]n(?:\s*m[aá]x\w*)?)[^\d\n]{0,40}(\d{3,5})\s*x\s*(\d{3,5})`, 'i'));
  const cualquiera = etiquetada || t.match(/\b(\d{3,5})\s*x\s*(\d{3,5})\b/);
  if (!cualquiera) return null;
  const ancho = Number(cualquiera[1]), alto = Number(cualquiera[2]);
  if (ancho < 320 || alto < 240) return null;
  return { ancho, alto };
}

function buscarModelo(t: string): { marca: string | null; modelo: string | null } {
  const hik = /hikvision/i.test(t);
  const m = t.match(/\b((?:DS|iDS|IDS)-[0-9A-Z][0-9A-Z-]{4,}(?:\([0-9A-Z.\/-]+\))?)/);
  return { marca: hik || m ? 'Hikvision' : null, modelo: m ? m[1] : null };
}

/** Las cuatro distancias de una línea con D/O/R/I o Detect/Observe/Recognize/Identify. */
function doriEnLinea(linea: string): DoriPropuesto | null {
  const v = (re: RegExp) => { const m = linea.match(re); return m ? n(m[1]) : null; };
  const d = v(new RegExp(String.raw`\b(?:D|Detect(?:ion)?)\s*[:=]\s*${NUM}\s*m\b`, 'i'));
  const o = v(new RegExp(String.raw`\b(?:O|Observ(?:e|ation))\s*[:=]\s*${NUM}\s*m\b`, 'i'));
  const r = v(new RegExp(String.raw`\b(?:R|Recogni(?:ze|se|tion))\s*[:=]\s*${NUM}\s*m\b`, 'i'));
  const i = v(new RegExp(String.raw`\b(?:I|Identif(?:y|ication))\s*[:=]\s*${NUM}\s*m\b`, 'i'));
  if (d === null || o === null || r === null || i === null) return null;
  return { detectarM: d, observarM: o, reconocerM: r, identificarM: i };
}

/** Formato tabla: cabecera con el ORDEN de los niveles y filas «Distance (Wide/Tele)». */
function doriEnTabla(t: string): { wide: DoriPropuesto | null; tele: DoriPropuesto | null } {
  const lineas = t.split('\n');
  const orden: string[] = [];
  for (const l of lineas) {
    const palabras = [...l.matchAll(/\b(Detect|Observe|Recogni[sz]e|Identify)\b/gi)].map((m) => m[1].toLowerCase());
    if (palabras.length === 4) { orden.push(...palabras); break; }
  }
  const nivel = (p: string) => (p.startsWith('det') ? 'detectarM' : p.startsWith('obs') ? 'observarM' : p.startsWith('rec') ? 'reconocerM' : 'identificarM');
  const ordenFinal = orden.length === 4 ? orden.map(nivel) : ['detectarM', 'observarM', 'reconocerM', 'identificarM'];
  const fila = (tipo: 'wide' | 'tele') => {
    const l = lineas.find((x) => new RegExp(String.raw`distance\s*\(\s*${tipo}\s*\)`, 'i').test(x));
    if (!l) return null;
    // Sólo los valores en METROS: «2400.0 m (7874.0 ft)» → 2400.0
    const metros = [...l.matchAll(new RegExp(String.raw`${NUM}\s*m\b(?!\s*\/)`, 'gi'))].map((m) => n(m[1]));
    if (metros.length < 4) return null;
    const res: any = {};
    ordenFinal.forEach((k, idx) => { res[k] = metros[idx]; });
    return res as DoriPropuesto;
  };
  return { wide: fila('wide'), tele: fila('tele') };
}

export function leerFicha(texto: string): PropuestaDeFicha {
  const t = normalizar(texto || '');
  const avisos: string[] = [];
  const { marca, modelo } = buscarModelo(t);
  const resolucion = buscarResolucion(t);
  const sensorM = t.match(/(1\/\d(?:\.\d)?)\s*"?\s*(?:progressive\s*scan\s*)?cmos/i);
  const sensor = sensorM ? `${sensorM[1]}" CMOS` : null;

  const zoomM = t.match(/(\d{1,3})\s*x\s*optical/i) || t.match(/optical\s*zoom[^\d\n]{0,15}(\d{1,3})\s*x/i)
    || t.match(/(?<!digital\s?)\bzoom[^\d\n]{0,10}(\d{1,3})\s*x\b(?!\s*digital)/i);
  const zoomOptico = zoomM ? Number(zoomM[1]) : null;

  const irM = (() => {
    const m = t.match(new RegExp(String.raw`(?:ir\s*(?:range|distance)|supplement\s*light\s*range|alcance\s*ir)[^\n]{0,60}?(?:up\s*to|hasta)?\s*${NUM}\s*m\b`, 'i'));
    return m ? n(m[1]) : null;
  })();

  /* Ángulos de una varifocal / PTZ: «60.2° to 2.0° (wide-tele)». */
  const rangoH = t.match(new RegExp(String.raw`horizontal\s*(?:field\s*of\s*view|fov)\s*:?\s*${NUM}\s*°\s*(?:to|-|~)\s*${NUM}\s*°`, 'i'));
  const rangoV = t.match(new RegExp(String.raw`vertical\s*(?:field\s*of\s*view|fov)\s*:?\s*${NUM}\s*°\s*(?:to|-|~)\s*${NUM}\s*°`, 'i'));
  const anguloHTele = rangoH ? n(rangoH[2]) : null;

  /* Lentes con su ángulo: «2.8 mm: horizontal FOV 103°, vertical FOV 55°». */
  const lentes = new Map<string, LentePropuesta>();
  const lente = (clave: string) => {
    if (!lentes.has(clave)) lentes.set(clave, { lente: clave, anguloH: null, anguloV: null, dori: null, doriEn: null });
    return lentes.get(clave)!;
  };
  for (const linea of t.split('\n')) {
    const lm = linea.match(/(\d{1,3}(?:[.,]\d{1,2})?\s*mm(?:\s*(?:-|~|to)\s*\d{1,3}(?:[.,]\d{1,2})?\s*mm)?)/i);
    const fovH = linea.match(new RegExp(String.raw`horizontal\s*(?:fov|field\s*of\s*view)\s*:?\s*${NUM}\s*°(?!\s*(?:to|-|~))`, 'i'));
    if (lm && fovH) {
      const l = lente(lenteCanonica(lm[1])!);
      l.anguloH = n(fovH[1]);
      const fovV = linea.match(new RegExp(String.raw`vertical\s*(?:fov|field\s*of\s*view)\s*:?\s*${NUM}\s*°`, 'i'));
      if (fovV) l.anguloV = n(fovV[1]);
    }
    const dori = doriEnLinea(linea);
    if (dori) {
      const clave = lm ? lenteCanonica(lm[1]) : null;
      const l = lente(clave || '(única)');
      l.dori = dori; l.doriEn = 'GRAN_ANGULAR';
    }
  }

  /* Formato tabla (PTZ y varifocales). */
  const tabla = doriEnTabla(t);
  if (tabla.wide || tabla.tele) {
    const focal = t.match(/focal\s*length[^\n]{0,8}?(\d{1,3}(?:[.,]\d{1,2})?\s*mm\s*(?:to|-|~)\s*\d{1,3}(?:[.,]\d{1,2})?\s*mm|\d{1,3}(?:[.,]\d{1,2})?\s*mm)/i);
    const clave = (focal && lenteCanonica(focal[1])) || [...lentes.keys()][0] || '(única)';
    const l = lente(clave);
    if (rangoH) { l.anguloH = n(rangoH[1]); }
    if (rangoV && l.anguloV === null) l.anguloV = n(rangoV[1]);
    if (tabla.wide) { l.dori = tabla.wide; l.doriEn = 'GRAN_ANGULAR'; } else if (tabla.tele) { l.dori = tabla.tele; l.doriEn = 'TELE'; }
  }

  /* Una sola lente sin nombre: si la ficha nombra la focal en otro sitio, se usa. */
  if (lentes.has('(única)')) {
    const sola = lentes.get('(única)')!;
    const focal = t.match(/(?:focal\s*length|lens)[^\n]{0,12}?(\d{1,3}(?:[.,]\d{1,2})?\s*mm(?:\s*(?:to|-|~)\s*\d{1,3}(?:[.,]\d{1,2})?\s*mm)?)/i);
    const nombre = focal && lenteCanonica(focal[1]);
    if (nombre && !lentes.has(nombre)) { lentes.delete('(única)'); lentes.set(nombre, { ...sola, lente: nombre }); }
  }
  /* Una lente con ángulo y otra sin él (p. ej. el ángulo vino en el rango): se juntan. */
  if (rangoH) for (const l of lentes.values()) if (l.anguloH === null) l.anguloH = n(rangoH[1]);

  const lista = [...lentes.values()];
  if (!modelo) avisos.push('No se encontró el modelo: escríbelo tal como sale en la etiqueta.');
  if (!resolucion) avisos.push('No se encontró la resolución máxima.');
  if (!lista.length) avisos.push('No se encontró ninguna lente con su ángulo.');
  for (const l of lista) {
    if (l.anguloH === null) avisos.push(`Lente ${l.lente}: falta el ángulo horizontal.`);
    if (!l.dori) avisos.push(`Lente ${l.lente}: no se encontraron las distancias DORI.`);
  }
  if (irM === null) avisos.push('No se encontró el alcance infrarrojo (si la cámara no tiene IR, déjalo vacío).');

  return { marca, modelo, resolucion, sensor, zoomOptico, anguloHTele, irM, lentes: lista, avisos };
}
