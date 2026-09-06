import {
  FILA_INICIO, LISTAS, MAX_CARACTERES, PARES_MATERIAL,
  FilaHojaRuta, hojaDeListas, hojaFormatoSap, validaciones,
} from '../src/modules/hojas-ruta/formato-sap';

/* exceljs con require, no con `import * as` (bloque 3). */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ExcelJS = require('exceljs');

/* =============================================================================
   BLOQUE 95 · EL FORMATO DEL EXCEL, COMPROBADO ABRIÉNDOLO
   -----------------------------------------------------------------------------
   Estas pruebas NO leen el código: **arman el libro, lo escriben a un búfer y
   lo vuelven a abrir**. Es la lección del bloque 84 con el Excel de
   indicadores: un `addRow` con la clave equivocada escribe celdas vacías y
   pasa el typecheck tan contento.

   Lo que se fija es lo que el ingeniero necesita para poder CARGARLO A SAP sin
   retocar nada: las columnas en su sitio, las cabeceras combinadas, y sobre
   todo LAS CUATRO FÓRMULAS VIVAS. Un archivo con los números ya calculados no
   le sirve de plantilla.
============================================================================= */

const FILAS: FilaHojaRuta[] = [
  {
    ubicacionSap: '1262AP01', equipo: 'AA-CAM-T1-001',
    descripcionHR: 'MANTENIMIENTO PREVENTIVO DE CAMARA', grupoPlanif: 'M06',
    frecuencia: '3 MESES', operacion: 10, subOperacion: null,
    puestoTrabajo: 'LAM1ELECT1', centro: 2100, claveControl: 'PM01',
    descripcion: 'LIMPIEZA DE CAMARAS', numPersonas: 2, duracionH: 4,
    materiales: [{ descripcion: 'PAÑO MICROFIBRA', cantidad: 2 }],
  },
  {
    ubicacionSap: '1262AP02', equipo: 'AA-CAM-T1-002',
    operacion: 10, subOperacion: 10, puestoTrabajo: 'LAM1ELECT1', centro: 2100,
    claveControl: 'PM04', descripcion: 'USO DE EPP OBLIGATORIO',
  },
  {
    operacion: 10, subOperacion: 20, puestoTrabajo: 'LAM1ELECT1', centro: 2100,
    claveControl: 'PM04', descripcion: 'BLOQUEO Y ETIQUETADO DE ENERGÍA (LOTO)',
  },
];

async function construir(filas: FilaHojaRuta[] = FILAS) {
  const wb = new ExcelJS.Workbook();
  hojaDeListas(wb);
  const ws = hojaFormatoSap(wb, 'FORMATO CAMARA', filas);
  validaciones(ws, 40);
  const buf = await wb.xlsx.writeBuffer();
  const leido = new ExcelJS.Workbook();
  await leido.xlsx.load(buf);
  return leido;
}

describe('El Excel sale con el formato EXACTO del ingeniero', () => {
  it('las cabeceras de grupo van combinadas y en su rango', async () => {
    const wb = await construir();
    const ws = wb.getWorksheet('FORMATO CAMARA');
    expect(ws.getCell('B1').value).toBe('INICIO');
    expect(ws.getCell('D1').value).toBe('CABECERA');
    expect(ws.getCell('G1').value).toBe('OPERACIÓN Y SUBOPERACION');
    expect(ws.getCell('T1').value).toBe('CANT. CARACTERES');
  });

  it('la fila 2 lleva las diecinueve cabeceras, con su texto literal', async () => {
    const wb = await construir();
    const ws = wb.getWorksheet('FORMATO CAMARA');
    expect(ws.getCell('B2').value).toBe('Ubicación en SAP');
    expect(ws.getCell('D2').value).toBe('Descripción Principal de la H.R.');
    expect(ws.getCell('E2').value).toBe('G.P.');
    expect(ws.getCell('L2').value).toBe('Descripción de Operación');
    expect(ws.getCell('M2').value).toBe('Total Trabajo');
    expect(ws.getCell('R2').value).toBe('Calculo \nClave');
    expect(ws.getCell('T2').value).toBe('Cant. Caract.');
    expect(ws.getCell('V2').value).toBe('Cant. Caract.');
  });

  it('los datos empiezan en la fila 3, NO en la 1', async () => {
    /* La columna A es un margen de 0,71 y las dos primeras filas son
       cabeceras. Empezar en la 1 daba una tabla parecida y un archivo
       distinto. */
    const wb = await construir();
    const ws = wb.getWorksheet('FORMATO CAMARA');
    expect(FILA_INICIO).toBe(3);
    expect(ws.getCell('L3').value).toBe('LIMPIEZA DE CAMARAS');
    expect(ws.getColumn('A').width).toBeCloseTo(0.71, 2);
  });

  it('LAS CUATRO FÓRMULAS VIVEN COMO FÓRMULAS, no como su resultado', async () => {
    /* Es la diferencia entre entregar un archivo y una foto de un archivo:
       el ingeniero cambia la duración y el total se recalcula solo. */
    const wb = await construir();
    const ws = wb.getWorksheet('FORMATO CAMARA');
    expect((ws.getCell('M3').value as any).formula).toBe('P3*O3');
    expect((ws.getCell('T3').value as any).formula).toBe('LEN(D3)');
    expect((ws.getCell('V3').value as any).formula).toBe('LEN(L3)');
    expect((ws.getCell('U3').value as any).formula)
      .toBe('IF(E3="M04","MECANICO",IF(E3="M05","ELECTRICO",IF(E3="M06","ELECTRONICO","")))');
  });

  it('cada fila apunta a SU PROPIA fila, no a la de abajo', async () => {
    /* En el archivo original V9 dice `=LEN(L10)`: un arrastre mal hecho que
       hace que esa fila cuente los caracteres de la siguiente. No se copia:
       copiar un fallo por fidelidad es entregar una hoja que miente. */
    const wb = await construir();
    const ws = wb.getWorksheet('FORMATO CAMARA');
    for (const f of [3, 4, 5]) {
      expect((ws.getCell(`V${f}`).value as any).formula).toBe(`LEN(L${f})`);
      expect((ws.getCell(`M${f}`).value as any).formula).toBe(`P${f}*O${f}`);
    }
  });

  it('la cabecera sólo se escribe en la operación PRINCIPAL', async () => {
    /* Repetir la descripción de la H.R. en cada suboperación haría que SAP
       leyera catorce hojas de ruta donde hay una. */
    const wb = await construir();
    const ws = wb.getWorksheet('FORMATO CAMARA');
    expect(ws.getCell('D3').value).toBe('MANTENIMIENTO PREVENTIVO DE CAMARA');
    expect(ws.getCell('E3').value).toBe('M06');
    expect(ws.getCell('F3').value).toBe('3 MESES');
    expect(ws.getCell('D4').value).toBeNull();
    expect(ws.getCell('E4').value).toBeNull();
  });

  it('la principal es PM01 y los pasos PM04, con su suboperación', async () => {
    const wb = await construir();
    const ws = wb.getWorksheet('FORMATO CAMARA');
    expect(ws.getCell('K3').value).toBe('PM01');
    expect(ws.getCell('H3').value).toBeNull();      // la principal no lleva sub
    expect(ws.getCell('K4').value).toBe('PM04');
    expect(ws.getCell('H4').value).toBe(10);
    expect(ws.getCell('H5').value).toBe(20);
  });

  it('lleva los doce pares MATERIAL / CANT. y escribe el material', async () => {
    const wb = await construir();
    const ws = wb.getWorksheet('FORMATO CAMARA');
    expect(PARES_MATERIAL).toBe(12);
    expect(ws.getCell(2, 24).value).toBe('MATERIAL');
    expect(ws.getCell(2, 25).value).toBe('CANT.');
    expect(ws.getCell(2, 47).value).toBe('CANT.');   // AU, el último
    expect(ws.getCell(3, 24).value).toBe('PAÑO MICROFIBRA');
    expect(ws.getCell(3, 25).value).toBe(2);
  });

  it('los anchos son los del original, no unos redondos', async () => {
    const wb = await construir();
    const ws = wb.getWorksheet('FORMATO CAMARA');
    expect(ws.getColumn('B').width).toBeCloseTo(13.14, 2);
    expect(ws.getColumn('D').width).toBeCloseTo(30.86, 2);
    expect(ws.getColumn('L').width).toBeCloseTo(50.43, 2);
    expect(ws.getColumn('S').width).toBeCloseTo(0.86, 2);
  });

  it('la hoja de listas se llama «Hoja1» y trae los códigos de planta', async () => {
    /* Sin ella el archivo se abre con los desplegables rotos, y entonces los
       códigos se escriben a mano — que es como entra un puesto mal puesto. */
    const wb = await construir();
    const h1 = wb.getWorksheet('Hoja1');
    expect(h1).toBeDefined();
    expect(h1.getCell('A1').value).toBe('LAM1SME1');
    expect(h1.getCell('D1').value).toBe('M04');
    expect(h1.getCell('J2').value).toBe(2100);
    expect(h1.getCell('K3').value).toBe('PM04');
    expect(LISTAS.clavesControl).toContain('PM01');
  });

  it('una descripción de más de 40 se marca EN ROJO donde se corrige', async () => {
    /* SAP corta en 40 y rechaza la CARGA ENTERA sin decir cuál falló. Se pinta
       la celda del texto, no la del contador: es la que hay que tocar. */
    const larga = 'X'.repeat(MAX_CARACTERES + 5);
    const wb = await construir([{ ...FILAS[0], descripcion: larga }]);
    const ws = wb.getWorksheet('FORMATO CAMARA');
    expect((ws.getCell('L3').font as any).color.argb).toBe('FFC0121F');
  });

  it('el nombre de pestaña se recorta: uno largo abre el archivo CORRUPTO', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = hojaFormatoSap(wb, 'FORMATO ' + 'A'.repeat(60) + '/?*[]', FILAS);
    expect(ws.name.length).toBeLessThanOrEqual(31);
    expect(ws.name).not.toMatch(/[\\/?*[\]:]/);
  });
});
