/**
 * IMPORTACIÓN DEL CATÁLOGO DE REPUESTOS DESDE SAP.
 *
 * POR QUÉ CSV Y NO EXCEL
 * Leer .xlsx exige una librería, y las de Excel han acumulado vulnerabilidades.
 * Es justo el tipo de dependencia que ya rompió NestJS en este proyecto con un
 * `npm audit fix`. En Excel, "Guardar como CSV" es un clic: el costo lo paga
 * quien exporta una vez, no el servidor en producción para siempre.
 *
 * POR QUÉ NO SE DESCUENTA STOCK DESDE AQUÍ
 * El almacén de verdad está en SAP. Este catálogo es un ESPEJO para comparar
 * ("pediste 50 m, en SAP hay 20"), no una segunda contabilidad. Si los dos
 * descontaran, ninguno cuadraría nunca.
 *
 * Todo se resuelve con funciones puras para poder probar cada caso raro: el
 * archivo que llega de SAP nunca viene limpio.
 */

export interface FilaCatalogo {
  sapCode: string;
  name: string;
  category?: string;
  brand?: string;
  model?: string;
  unit?: string;
  warehouse?: string;
  currentStock?: number;
  minStock?: number;
}

export interface FilaRechazada {
  linea: number;
  motivo: string;
  contenido: string;
}

export interface ResultadoLectura {
  filas: FilaCatalogo[];
  rechazadas: FilaRechazada[];
  columnasDetectadas: Record<string, string>;
}

/**
 * Nombres de columna que se aceptan para cada campo.
 * SAP y Excel exportan encabezados distintos según el idioma y la versión, así
 * que se aceptan varias formas en vez de exigir un formato exacto —que es lo
 * que hace que estas importaciones fallen siempre en la práctica—.
 */
const ALIAS: Record<keyof FilaCatalogo, string[]> = {
  sapCode: ['sapcode', 'codigosap', 'codigo sap', 'codigo', 'material', 'nromaterial', 'sap'],
  name: ['name', 'nombre', 'descripcion', 'texto', 'textobreve', 'denominacion'],
  category: ['category', 'categoria', 'grupo', 'grupoarticulos', 'familia'],
  brand: ['brand', 'marca', 'fabricante'],
  model: ['model', 'modelo', 'referencia'],
  unit: ['unit', 'unidad', 'um', 'unidadmedida', 'unidaddemedida'],
  warehouse: ['warehouse', 'almacen', 'deposito', 'centro'],
  currentStock: ['currentstock', 'stock', 'existencias', 'cantidad', 'libreutilizacion', 'disponible'],
  minStock: ['minstock', 'stockminimo', 'minimo', 'puntopedido'],
};

/** Quita acentos, espacios y signos para comparar encabezados sin sorpresas. */
export function normalizar(texto: string): string {
  return (texto || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Detecta el separador leyendo la primera línea.
 * Excel en configuración regional española exporta con punto y coma, no con
 * coma. Si se asumiera coma, el archivo entero se leería como una sola columna
 * y el usuario vería "0 filas válidas" sin entender por qué.
 */
export function detectarSeparador(primeraLinea: string): string {
  const candidatos = [';', ',', '\t', '|'];
  let mejor = ',';
  let max = 0;
  for (const c of candidatos) {
    const n = primeraLinea.split(c).length;
    if (n > max) { max = n; mejor = c; }
  }
  return mejor;
}

/** Parte una línea respetando las comillas dobles. */
export function partirLinea(linea: string, sep: string): string[] {
  const salida: string[] = [];
  let actual = '';
  let enComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (ch === '"') {
      // Dos comillas seguidas dentro de un campo son una comilla literal.
      if (enComillas && linea[i + 1] === '"') { actual += '"'; i++; }
      else enComillas = !enComillas;
    } else if (ch === sep && !enComillas) {
      salida.push(actual); actual = '';
    } else {
      actual += ch;
    }
  }
  salida.push(actual);
  return salida.map((c) => c.trim());
}

/**
 * Convierte a número tolerando los formatos que llegan de SAP y Excel:
 * "1.234,50" (europeo), "1,234.50" (inglés), "45 M" (con unidad pegada).
 * Devuelve null si no hay un número reconocible, en vez de 0: un cero
 * inventado haría creer que el repuesto está agotado.
 */
export function aNumero(valor: string): number | null {
  if (valor === null || valor === undefined) return null;
  let t = String(valor).trim();
  if (!t) return null;
  // Se quita todo lo que no sea dígito, signo, punto o coma.
  t = t.replace(/[^\d.,-]/g, '');
  if (!t || t === '-' || t === '.' || t === ',') return null;

  const ultimaComa = t.lastIndexOf(',');
  const ultimoPunto = t.lastIndexOf('.');

  if (ultimaComa > -1 && ultimoPunto > -1) {
    // Están los dos: el decimal es el que aparece más a la derecha.
    // "1.250,50" -> 1250.50   ·   "1,250.50" -> 1250.50
    if (ultimaComa > ultimoPunto) t = t.replace(/\./g, '').replace(',', '.');
    else t = t.replace(/,/g, '');
  } else if (ultimaComa > -1) {
    // Una sola coma: decimal si separa 1 o 2 dígitos, miles si separa 3.
    const decimales = t.length - ultimaComa - 1;
    t = decimales === 3 ? t.replace(/,/g, '') : t.replace(',', '.');
  } else if (ultimoPunto > -1) {
    // UN SOLO PUNTO: caso genuinamente AMBIGUO.
    //
    // "1.250" puede leerse como mil doscientos cincuenta (formato europeo, el
    // punto separa miles) o como uno con veinticinco (formato inglés). El texto
    // solo no permite decidirlo.
    //
    // Se aplica el MISMO criterio que a la coma —tres dígitos detrás = miles—
    // por dos razones:
    //   1. Es simétrico y predecible: la misma regla para los dos separadores.
    //   2. En este dominio decide bien: los repuestos se cuentan por unidad y
    //      el cable se entrega por rollo. "1.250 conectores" son mil doscientos
    //      cincuenta; "1,25 conectores" no significa nada.
    //
    // Y sobre todo: la PREVISUALIZACIÓN existe justamente para que el Jefe vea
    // el número antes de aplicar. Un 1250 donde debía haber 1,25 salta a la
    // vista; el daño de equivocarse aquí está acotado.
    const decimales = t.length - ultimoPunto - 1;
    if (decimales === 3) t = t.replace(/\./g, '');
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Empareja los encabezados del archivo con los campos del catálogo. */
export function mapearColumnas(encabezados: string[]): Record<string, number> {
  const mapa: Record<string, number> = {};
  const normalizados = encabezados.map(normalizar);
  for (const [campo, alias] of Object.entries(ALIAS)) {
    const i = normalizados.findIndex((h) => alias.includes(h));
    if (i >= 0) mapa[campo] = i;
  }
  return mapa;
}

/**
 * Lee el contenido completo del archivo.
 * No lanza excepción por una fila mala: la rechaza con su motivo y sigue. Un
 * archivo de 300 líneas no puede perderse porque la 47 venga sin código.
 */
export function leerCatalogo(contenido: string): ResultadoLectura {
  // Se quita la marca de orden de bytes que Excel escribe al inicio: sin esto
  // el primer encabezado no coincide con ningún alias y la importación falla
  // sin explicación aparente.
  const texto = contenido.replace(/^﻿/, '');
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (!lineas.length) {
    return { filas: [], rechazadas: [{ linea: 0, motivo: 'El archivo está vacío.', contenido: '' }], columnasDetectadas: {} };
  }

  const sep = detectarSeparador(lineas[0]);
  const encabezados = partirLinea(lineas[0], sep);
  const mapa = mapearColumnas(encabezados);

  const columnasDetectadas: Record<string, string> = {};
  for (const [campo, i] of Object.entries(mapa)) columnasDetectadas[campo] = encabezados[i];

  if (mapa.sapCode === undefined || mapa.name === undefined) {
    return {
      filas: [],
      rechazadas: [{
        linea: 1,
        motivo: 'No se encontraron las columnas de código SAP y descripción. '
          + `Encabezados leídos: ${encabezados.join(' | ')}`,
        contenido: lineas[0],
      }],
      columnasDetectadas,
    };
  }

  const filas: FilaCatalogo[] = [];
  const rechazadas: FilaRechazada[] = [];
  const vistos = new Set<string>();

  for (let i = 1; i < lineas.length; i++) {
    const celdas = partirLinea(lineas[i], sep);
    const sapCode = (celdas[mapa.sapCode] || '').trim();
    const name = (celdas[mapa.name] || '').trim();
    const nLinea = i + 1;

    if (!sapCode) { rechazadas.push({ linea: nLinea, motivo: 'Sin código SAP.', contenido: lineas[i] }); continue; }
    if (!name) { rechazadas.push({ linea: nLinea, motivo: 'Sin descripción.', contenido: lineas[i] }); continue; }
    if (vistos.has(sapCode)) {
      rechazadas.push({ linea: nLinea, motivo: `Código SAP repetido (${sapCode}).`, contenido: lineas[i] });
      continue;
    }
    vistos.add(sapCode);

    const dato = (campo: keyof FilaCatalogo) =>
      mapa[campo] !== undefined ? (celdas[mapa[campo]] || '').trim() || undefined : undefined;

    const stock = mapa.currentStock !== undefined ? aNumero(celdas[mapa.currentStock]) : null;
    const minimo = mapa.minStock !== undefined ? aNumero(celdas[mapa.minStock]) : null;

    filas.push({
      sapCode,
      name,
      category: dato('category'),
      brand: dato('brand'),
      model: dato('model'),
      unit: dato('unit'),
      warehouse: dato('warehouse'),
      // SIN redondear. Si SAP exporta 125,5 m de cable, son 125,5. Redondear
      // aquí metía el error por la puerta de la importación, que es por donde
      // entra la mayor parte del catálogo.
      // Se sigue impidiendo el negativo: un stock bajo cero no existe.
      currentStock: stock === null ? undefined : Math.max(0, stock),
      minStock: minimo === null ? undefined : Math.max(0, minimo),
    });
  }

  return { filas, rechazadas, columnasDetectadas };
}

// ============================================================================
//  LECTURA DE UNA REJILLA YA TIPADA  (bloque 3G — Excel)
//
//  POR QUÉ EXISTE, SI YA HAY UN LECTOR DE CSV
//  Porque el CSV es TEXTO y hay que ADIVINAR. El lector de arriba tiene que
//  decidir si "1.250" son mil doscientos cincuenta o uno con veinticinco, y
//  aplica la regla de los tres dígitos. Es la mejor regla posible sobre texto,
//  pero es una regla: con "0.125" acertaría lo contrario de lo que se quiere.
//
//  Desde una hoja de cálculo NO hay nada que adivinar: la celda YA es un
//  número. El navegador lee el .xlsx, manda la rejilla con los valores tal
//  cual, y aquí se usan directamente. Cero ambigüedad, cero pérdida.
//
//  Se reutiliza mapearColumnas() para que el reconocimiento de encabezados sea
//  EXACTAMENTE el mismo en las dos vías: si el CSV entiende "Libre
//  utilización", el Excel también, sin mantener dos listas que se desviarían.
// ============================================================================

/** Convierte una celda ya tipada a número, sin adivinar si ya lo es. */
function celdaANumero(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  // Una hoja de cálculo entrega números como números. Ese es todo el punto.
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return null;
  // Si viniera como texto (celda con formato de texto), se cae al lector de
  // siempre: peor que un número real, pero mejor que descartarlo.
  return aNumero(String(v));
}

/** Celda a texto recortado, o undefined si no aporta nada. */
function celdaATexto(v: any): string | undefined {
  if (v === null || v === undefined) return undefined;
  const t = String(v).trim();
  return t.length ? t : undefined;
}

export function leerGrilla(encabezados: any[], filasCrudas: any[][]): ResultadoLectura {
  const cabeceras = (encabezados || []).map((h) => String(h ?? ''));
  const mapa = mapearColumnas(cabeceras);

  const columnasDetectadas: Record<string, string> = {};
  for (const [campo, i] of Object.entries(mapa)) columnasDetectadas[campo] = cabeceras[i];

  if (mapa.sapCode === undefined || mapa.name === undefined) {
    return {
      filas: [],
      rechazadas: [{
        linea: 1,
        motivo: 'No se encontraron las columnas de código SAP y descripción. '
          + `Encabezados leídos: ${cabeceras.join(' | ')}`,
        contenido: cabeceras.join(' | '),
      }],
      columnasDetectadas,
    };
  }

  const filas: FilaCatalogo[] = [];
  const rechazadas: FilaRechazada[] = [];
  const vistos = new Set<string>();

  for (let i = 0; i < (filasCrudas || []).length; i++) {
    const celdas = filasCrudas[i] || [];
    // +2: la fila 1 es el encabezado y las hojas de cálculo cuentan desde 1.
    // Así el número que se muestra es el mismo que ve el usuario en Excel.
    const nLinea = i + 2;
    const contenido = celdas.map((c) => (c === null || c === undefined ? '' : String(c))).join(' | ');

    const sapCode = celdaATexto(celdas[mapa.sapCode]);
    const name = celdaATexto(celdas[mapa.name]);

    if (!sapCode) { rechazadas.push({ linea: nLinea, motivo: 'Sin código SAP.', contenido }); continue; }
    if (!name) { rechazadas.push({ linea: nLinea, motivo: 'Sin descripción.', contenido }); continue; }
    if (vistos.has(sapCode)) {
      rechazadas.push({ linea: nLinea, motivo: `Código SAP repetido (${sapCode}).`, contenido });
      continue;
    }
    vistos.add(sapCode);

    const dato = (campo: keyof FilaCatalogo) =>
      mapa[campo] !== undefined ? celdaATexto(celdas[mapa[campo]]) : undefined;

    const stock = mapa.currentStock !== undefined ? celdaANumero(celdas[mapa.currentStock]) : null;
    const minimo = mapa.minStock !== undefined ? celdaANumero(celdas[mapa.minStock]) : null;

    filas.push({
      sapCode,
      name,
      category: dato('category'),
      brand: dato('brand'),
      model: dato('model'),
      unit: dato('unit'),
      warehouse: dato('warehouse'),
      // Sin redondear y sin negativos, igual que en la vía del CSV.
      currentStock: stock === null ? undefined : Math.max(0, stock),
      minStock: minimo === null ? undefined : Math.max(0, minimo),
    });
  }

  return { filas, rechazadas, columnasDetectadas };
}
