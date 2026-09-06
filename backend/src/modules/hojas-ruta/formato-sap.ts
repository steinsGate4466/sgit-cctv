/* =============================================================================
   BLOQUE 95 · EL FORMATO EXACTO DEL EXCEL DEL INGENIERO
   -----------------------------------------------------------------------------
   Hasta aquí el sistema exportaba UNA TABLA con las mismas columnas, pero no
   era el mismo archivo: empezaba en la fila 1, sin la columna A de margen, sin
   las cabeceras de grupo combinadas, SIN LAS FÓRMULAS y sin las columnas de
   materiales. Se podía leer, pero no se podía usar: el ingeniero tenía que
   rehacerlo a mano antes de cargarlo a SAP.

   Ahora se reproduce el archivo `HOJA RUTA MANTENIMIENTO PREVENTIVO CAMARAS`
   tal cual: mismas columnas, mismo orden, mismos anchos, mismas combinaciones
   y **las cuatro fórmulas vivas**.

   -----------------------------------------------------------------------------
   POR QUÉ LAS FÓRMULAS SE ESCRIBEN COMO FÓRMULAS Y NO COMO EL RESULTADO

   Es la diferencia entre entregar un archivo y entregar una foto de un
   archivo. El ingeniero abre la hoja, cambia la duración de un paso y el total
   se recalcula solo; corrige un texto y el contador de caracteres se mueve
   delante de sus ojos. Con el número ya calculado tendría que volver a
   escribir las fórmulas — y entonces no le sirve de plantilla.

   Las cuatro, tal cual salen de su archivo:

       M{f} = P{f}*O{f}                      Total trabajo = duración × personas
       T{f} = LEN(D{f})                      caracteres de la descripción de la H.R.
       U{f} = IF(E="M04","MECANICO", …)      el oficio, deducido del grupo planificador
       V{f} = LEN(L{f})                      caracteres de la descripción de operación

   -----------------------------------------------------------------------------
   EL LÍMITE DE 40 SIGUE SIENDO EL CORAZÓN. SAP corta ese campo en 40 y, si UNA
   línea se pasa, RECHAZA LA CARGA ENTERA sin decir cuál fue. Por eso la columna
   V no se quita «porque el sistema ya valida»: se conserva y además se pinta en
   rojo la que se pase. Fiarse a ciegas es lo que cuesta media mañana.

   -----------------------------------------------------------------------------
   UN DETALLE DEL ORIGINAL QUE **NO** SE COPIA

   En su archivo, la celda V9 dice `=LEN(L10)` — apunta a la fila siguiente. Es
   un error de arrastre: esa fila cuenta los caracteres de la de abajo. Se
   genera `=LEN(L9)`, que es lo que quiso escribir. Copiar un fallo por
   fidelidad sería entregar una hoja que miente en una fila.
============================================================================= */

import type { Worksheet, Workbook } from 'exceljs';

/** El tope de SAP. Vive aquí y en el servicio: es el mismo número. */
export const MAX_CARACTERES = 40;

/** Primera fila de datos. 1 = cabeceras de grupo, 2 = cabeceras de columna. */
export const FILA_INICIO = 3;

/** Cuántos pares MATERIAL/CANT. lleva la plantilla (columnas X..AU). */
export const PARES_MATERIAL = 12;

/** Anchos EXACTOS del archivo del ingeniero, en el orden A..AV. */
const ANCHOS: [string, number][] = [
  ['A', 0.71], ['B', 13.14], ['C', 7.71], ['D', 30.86], ['E', 3.57], ['F', 8.0],
  ['G', 3.71], ['H', 4.0], ['I', 9.86], ['J', 4.57], ['K', 4.86], ['L', 50.43],
  ['M', 5.86], ['N', 4.43], ['O', 5.14], ['P', 4.71], ['Q', 4.43], ['R', 5.86],
  ['S', 0.86], ['T', 5.71], ['U', 1.14], ['V', 5.71], ['W', 1.71],
];

/** Cabeceras de la fila 2, columna a columna, empezando en B. */
const CABECERAS_FILA2: [string, string][] = [
  ['B', 'Ubicación en SAP'], ['C', 'Equipo'],
  ['D', 'Descripción Principal de la H.R.'], ['E', 'G.P.'], ['F', 'Frecuencia'],
  ['G', 'Ope.'], ['H', 'SubOpe.'], ['I', 'Puesto\nTrabajo'], ['J', 'Cent.'],
  ['K', 'Clave \nCont.'], ['L', 'Descripción de Operación'], ['M', 'Total Trabajo'],
  ['N', 'U.N.\nTrab.'], ['O', 'N° \nPerso.'], ['P', 'Dura.'], ['Q', 'U.N. Dura.'],
  ['R', 'Calculo \nClave'], ['T', 'Cant. Caract.'], ['V', 'Cant. Caract.'],
];

/** Las cabeceras de grupo de la fila 1, con su rango combinado. */
const GRUPOS: [string, string][] = [
  ['B1:C1', 'INICIO'],
  ['D1:F1', 'CABECERA'],
  ['G1:R1', 'OPERACIÓN Y SUBOPERACION'],
  ['T1:V1', 'CANT. CARACTERES'],
];

/**
 * La hoja de listas del original (`Hoja1`). No es decoración: es de donde
 * salen las validaciones de los desplegables. Sin ella, el archivo se abre con
 * las listas rotas y quien lo use escribe los códigos a mano — que es
 * exactamente como entra un puesto de trabajo mal escrito.
 */
export const LISTAS = {
  puestosMec: ['LAM1SME1', 'LAM1MEC1', 'LAM1MEC2', 'LAM1MEC3', 'LAM1MEC9', 'PRE1PRD1', 'PRE1PRD2', 'LAM1LUB1', 'LAM1SOL1'],
  puestosEle: ['LAM1SEL1', 'LAM1ELE1', 'LAM1ELE2', 'LAM1ELE3', 'LAM1ELE9', 'PRE1PRD1', 'PRE1PRD2', 'SUB1ELE1'],
  puestosElt: ['LAM1SET1', 'LAM1ELT1', 'LAM1ELT2', 'LAM1ELT3', 'LAM1ELT9', 'PRE1PRD1', 'PRE1PRD2'],
  gruposPlanif: ['M04', 'M05', 'M06'],
  centros: [1100, 2100, 3100],
  clavesControl: ['PM01', 'PM03', 'PM04', 'PM08'],
  estados: [
    [0, 'Fuera de servicio'], [1, 'En Servicio'], [2, 'Stand by'],
    [3, 'Fuera Servicio Dispositivo en Operación'],
  ] as [number, string][],
};

const BORDE_FINO = { style: 'hair' as const, color: { argb: 'FF808080' } };
const BORDE_GRUESO = { style: 'medium' as const, color: { argb: 'FF000000' } };

const marco = (grueso: boolean) => {
  const b = grueso ? BORDE_GRUESO : BORDE_FINO;
  return { top: b, left: b, bottom: b, right: b };
};

/** Aplica los anchos del original, incluidos los 12 pares de material. */
function anchos(ws: Worksheet): void {
  for (const [col, w] of ANCHOS) ws.getColumn(col).width = w;
  // X..AU — MATERIAL ancho, CANT. estrecha, alternando (columnas 24..47).
  for (let i = 0; i < PARES_MATERIAL; i++) {
    ws.getColumn(24 + i * 2).width = 7.71;
    ws.getColumn(25 + i * 2).width = 4.57;
  }
  ws.getColumn(48).width = 11.43;   // AV, como en el original
}

/** Fila 1 y 2: las dos cabeceras. */
function cabeceras(ws: Worksheet): void {
  ws.getRow(1).height = 53.1;
  ws.getRow(2).height = 44.25;

  for (const [rango, texto] of GRUPOS) {
    ws.mergeCells(rango);
    const c = ws.getCell(rango.split(':')[0]);
    c.value = texto;
    c.font = { bold: true, size: 8, name: 'Calibri' };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = marco(true);
  }

  /* La franja de materiales va combinada y en amarillo, igual que el original.
     Va SIN texto porque así está en su archivo: el rótulo lo dan las columnas
     MATERIAL/CANT. de la fila 2. */
  const finMat = 23 + PARES_MATERIAL * 2;      // X=24 … AU=47
  ws.mergeCells(1, 24, 1, finMat);
  const amarilla = ws.getCell(1, 24);
  amarilla.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
  amarilla.alignment = { horizontal: 'center', vertical: 'middle' };

  for (const [col, texto] of CABECERAS_FILA2) {
    const c = ws.getCell(`${col}2`);
    c.value = texto;
    c.font = { bold: true, size: 8, name: 'Calibri' };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = marco(col === 'B' || col === 'T' || col === 'V');
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
  }

  for (let i = 0; i < PARES_MATERIAL; i++) {
    for (const [off, txt] of [[0, 'MATERIAL'], [1, 'CANT.']] as [number, string][]) {
      const c = ws.getCell(2, 24 + i * 2 + off);
      c.value = txt;
      c.font = { bold: true, size: 8, name: 'Calibri' };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.border = marco(false);
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
    }
  }
}

export interface FilaHojaRuta {
  ubicacionSap?: string | null;
  equipo?: string | null;
  /** Sólo la fila de la operación principal lleva cabecera. */
  descripcionHR?: string | null;
  grupoPlanif?: string | null;
  frecuencia?: string | null;
  operacion: number;
  subOperacion?: number | null;
  puestoTrabajo?: string | null;
  centro?: string | number | null;
  claveControl: string;
  descripcion: string;
  numPersonas?: number | null;
  duracionH?: number | null;
  materiales?: { descripcion: string; cantidad?: number | null }[];
}

/** Escribe una fila de datos con sus cuatro fórmulas vivas. */
function fila(ws: Worksheet, f: number, d: FilaHojaRuta): void {
  ws.getRow(f).height = 18;
  const set = (col: string, v: any, alin: 'left' | 'center' | 'right' = 'center', grueso = false) => {
    const c = ws.getCell(`${col}${f}`);
    if (v !== null && v !== undefined && v !== '') c.value = v;
    c.font = { size: 8, name: 'Calibri', bold: col === 'L' };
    c.alignment = { horizontal: alin, vertical: 'middle', wrapText: col === 'L' || col === 'D' };
    c.border = marco(grueso);
  };

  set('B', d.ubicacionSap ?? null, 'right', true);
  set('C', d.equipo ?? null, 'center', true);
  set('D', d.descripcionHR ?? null, 'left');
  set('E', d.grupoPlanif ?? null);
  set('F', d.frecuencia ?? null);
  set('G', d.operacion);
  set('H', d.subOperacion ?? null);
  set('I', d.puestoTrabajo ?? null);
  set('J', d.centro ?? null);
  set('K', d.claveControl);
  set('L', d.descripcion, 'left');

  // ── Las fórmulas ──────────────────────────────────────────────────────────
  set('M', { formula: `P${f}*O${f}` });
  ws.getCell(`M${f}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFCC' } };
  set('N', 'H');
  set('O', d.numPersonas ?? null);
  set('P', d.duracionH ?? null);
  set('Q', 'H');
  set('R', 2);
  set('T', { formula: `LEN(D${f})` }, 'center', true);
  set('U', { formula: `IF(E${f}="M04","MECANICO",IF(E${f}="M05","ELECTRICO",IF(E${f}="M06","ELECTRONICO","")))` });
  set('V', { formula: `LEN(L${f})` }, 'center', true);

  /* El aviso de los 40. El sistema no deja GUARDAR una descripción más larga,
     pero un archivo editado a mano después sí puede tenerla — y entonces la
     carga a SAP se cae entera. Se pinta la celda del texto, no la del
     contador: es la que hay que corregir. */
  if (d.descripcion.length > MAX_CARACTERES) {
    ws.getCell(`L${f}`).font = { size: 8, name: 'Calibri', bold: true, color: { argb: 'FFC0121F' } };
    ws.getCell(`L${f}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDECEA' } };
  }

  (d.materiales ?? []).slice(0, PARES_MATERIAL).forEach((m, i) => {
    const colMat = 24 + i * 2;
    const cMat = ws.getCell(f, colMat);
    cMat.value = m.descripcion;
    cMat.font = { size: 8, name: 'Calibri' };
    cMat.border = marco(false);
    const cCant = ws.getCell(f, colMat + 1);
    if (m.cantidad != null) cCant.value = m.cantidad;
    cCant.font = { size: 8, name: 'Calibri' };
    cCant.alignment = { horizontal: 'center' };
    cCant.border = marco(false);
  });
}

/**
 * Monta una pestaña con el formato del ingeniero.
 * `nombre` se recorta a 31 caracteres y se le quitan los símbolos que Excel no
 * admite: si se pasa, el archivo se abre CORRUPTO y no dice por qué.
 */
export function hojaFormatoSap(wb: Workbook, nombre: string, filas: FilaHojaRuta[]): Worksheet {
  const limpio = nombre.replace(/[\\/?*[\]:]/g, '').slice(0, 31) || 'FORMATO';
  const ws = wb.addWorksheet(limpio, {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 2 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  anchos(ws);
  cabeceras(ws);
  filas.forEach((d, i) => fila(ws, FILA_INICIO + i, d));
  return ws;
}

/**
 * La hoja de listas, con el MISMO nombre que en el original (`Hoja1`) para que
 * las validaciones que alguien tenga escritas a mano sigan apuntando a algo.
 */
export function hojaDeListas(wb: Workbook): Worksheet {
  const ws = wb.addWorksheet('Hoja1');
  const { puestosMec, puestosEle, puestosElt, gruposPlanif, centros, clavesControl, estados } = LISTAS;
  const maxP = Math.max(puestosMec.length, puestosEle.length, puestosElt.length);
  for (let i = 0; i < maxP; i++) {
    if (puestosMec[i]) ws.getCell(i + 1, 1).value = puestosMec[i];
    if (puestosEle[i]) ws.getCell(i + 1, 2).value = puestosEle[i];
    if (puestosElt[i]) ws.getCell(i + 1, 3).value = puestosElt[i];
  }
  gruposPlanif.forEach((g, i) => { ws.getCell(i + 1, 4).value = g; });
  ws.getCell(1, 5).value = 'PM01';
  ws.getCell(1, 6).value = 4;
  estados.forEach(([n, t], i) => {
    ws.getCell(i + 1, 7).value = n;
    ws.getCell(i + 1, 8).value = t;
  });
  centros.forEach((c, i) => { ws.getCell(i + 1, 10).value = c; });
  clavesControl.forEach((k, i) => { ws.getCell(i + 1, 11).value = k; });
  ws.getCell(1, 12).value = 'H';
  ws.getCell(1, 13).value = 2;

  ws.getColumn(1).width = 10.7; ws.getColumn(2).width = 9.9;
  ws.getColumn(4).width = 4.7; ws.getColumn(5).width = 5.9;
  ws.getColumn(8).width = 36.7; ws.getColumn(9).width = 11.4;
  ws.getColumn(10).width = 5.0; ws.getColumn(11).width = 5.9;
  ws.getColumn(13).width = 11.4;
  return ws;
}

/**
 * Ata los desplegables de una pestaña a `Hoja1`, igual que el original.
 * Se aplica a un rango generoso de filas para que sirva también en las que el
 * usuario añada a mano: una validación que sólo cubre lo escrito deja de
 * validar en cuanto alguien amplía la hoja, que es cuando más falta hace.
 */
export function validaciones(ws: Worksheet, hastaFila = 200): void {
  const lista = (col: string, formula: string) => {
    for (let f = FILA_INICIO; f <= hastaFila; f++) {
      ws.getCell(`${col}${f}`).dataValidation = {
        type: 'list', allowBlank: true, formulae: [formula], showErrorMessage: true,
        errorTitle: 'Valor fuera de la lista',
        error: 'Elige uno de los valores de la hoja «Hoja1». Escribirlo a mano es como entra un código mal puesto.',
      };
    }
  };
  lista('E', '=Hoja1!$D$1:$D$3');       // G.P.
  lista('J', '=Hoja1!$J$1:$J$3');       // Centro
  lista('K', '=Hoja1!$K$1:$K$4');       // Clave de control
  lista('I', '=Hoja1!$C$1:$C$7');       // Puesto de trabajo (electrónico)
}
