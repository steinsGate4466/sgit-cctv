/* =============================================================================
   LOS INDICADORES, EN EXCEL — bloque 84
   =============================================================================

   PETICIÓN DEL USUARIO, textual: «si lo vas a agregar así, que se pueda
   descargar ese apartado en Excel o Power BI o no sé, el que sea más fácil
   para ti».

   Se eligió **Excel**, y la razón no es la comodidad: es que la planta ya
   trabaja en Excel. El ingeniero entregó sus hojas de ruta en un .xlsx de SAP
   (bloque 75), y el comité mensual se prepara pegando tablas en un correo. Un
   .pbix exigiría tener Power BI instalado y una licencia, y además **Power BI
   abre un .xlsx sin problema**, así que el Excel sirve para los dos caminos y
   el .pbix sólo para uno.

   -----------------------------------------------------------------------------
   CUATRO DECISIONES DEL LIBRO

   1. **Una hoja RESUMEN con los cinco números del ingeniero**, y encima de
      todo el periodo y el tren. Un libro de indicadores sin decir de qué
      fechas habla es un libro que dentro de tres meses nadie sabe interpretar
      — y acaba comparándose con otro de fechas distintas.

   2. **La comparación con el periodo anterior VIAJA en el Excel.** Es la mitad
      del valor del tablero. Si sólo se exportara la foto de hoy, quien la
      reciba tendría que buscar el libro del trimestre pasado para saber si
      vamos mejor.

   3. **`null` se escribe «sin datos», nunca 0.** Es la regla que atraviesa
      todo el módulo. Un cero en una celda de Excel se suma, se promedia y
      acaba en un gráfico diciendo que la disponibilidad fue del 0 %.

   4. **Los datos crudos van en su hoja**, para que quien quiera montarse su
      propio gráfico no tenga que pedir nada. Es exactamente lo que hoy se
      hace a mano y por correo.
============================================================================= */
const ExcelJS = require('exceljs');

const AZUL = 'FF1F4E79';
const VERDE = 'FF107C41';
const ROJO = 'FFB3261E';
const GRIS = 'FF9AA0A8';

/** `null` se escribe como texto, no como cero. Ver decisión 3. */
function celda(v: number | null | undefined, sufijo = ''): string | number {
  if (v === null || v === undefined) return 'sin datos';
  return sufijo ? `${v}${sufijo}` : v;
}

/** El veredicto, en palabras. En una celda no hay flechas de colores. */
function enPalabras(c: any): string {
  if (!c || c.veredicto === 'SIN_COMPARACION') return 'sin comparación';
  if (c.veredicto === 'IGUAL') return 'igual';
  const signo = c.delta > 0 ? '+' : '';
  const pct = c.deltaPct === null ? '' : ` (${signo}${c.deltaPct} %)`;
  return `${c.veredicto === 'MEJOR' ? 'MEJOR' : 'PEOR'}: ${signo}${c.delta}${pct}`;
}

function cabecera(ws: any, titulos: string[]) {
  const fila = ws.addRow(titulos);
  fila.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  fila.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  fila.height = 18;
  ws.autoFilter = { from: { row: fila.number, column: 1 }, to: { row: fila.number, column: titulos.length } };
}

/**
 * Arma el libro a partir de lo que YA devuelve `tablero()`.
 *
 * No recalcula nada, y eso es deliberado: si el Excel tuviera su propio
 * cálculo, un día el número de la pantalla y el del archivo dejarían de
 * coincidir, y el ingeniero llevaría al comité el que no toca sin saberlo.
 */
export async function libroDeIndicadores(t: any): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SGIT-CCTV';
  wb.created = new Date();

  /* ---------------------------------------------------- 1 · RESUMEN */
  const res = wb.addWorksheet('Resumen', { views: [{ state: 'frozen', ySplit: 4 }] });
  res.columns = [{ width: 34 }, { width: 16 }, { width: 16 }, { width: 26 }, { width: 62 }];

  const t1 = res.addRow(['SGIT-CCTV · Indicadores de gestión del mantenimiento']);
  t1.font = { bold: true, size: 14, color: { argb: AZUL } };
  res.addRow([
    `Periodo: últimos ${t.periodo?.dias} días`
    + (t.periodo?.tren ? ` · Tren ${t.periodo.tren}` : ' · toda LAMINACIÓN')
    + ` · generado el ${new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })}`,
  ]).font = { size: 10, color: { argb: GRIS } };
  res.addRow([]);

  cabecera(res, ['Indicador', 'Ahora', 'Antes', 'Cómo va', 'Qué significa']);

  const filas: [string, any, any, string][] = [
    ['MTTR — horas medias de reparación', celda(t.mttr?.horas, ' h'), t.comparativa?.mttr, t.mttr?.significa],
    ['MTBF — horas entre averías', celda(t.mtbf?.horas, ' h'), t.comparativa?.mtbf, t.mtbf?.significa],
    ['Disponibilidad', celda(t.disponibilidad?.pct, ' %'), t.comparativa?.disponibilidad, t.disponibilidad?.significa],
    ['Cumplimiento del preventivo', celda(t.preventivo?.pct, ' %'), t.comparativa?.preventivo,
      'De lo preventivo programado, cuánto se hizo.'],
    ['Nivel de servicio', celda(t.nivelDeServicio?.pct, ' %'), t.comparativa?.nivelDeServicio,
      'De todo el trabajo que entró, cuánto se atendió dentro de plazo.'],
  ];

  for (const [nombre, ahora, comp, significa] of filas) {
    const f = res.addRow([
      nombre,
      ahora,
      celda(comp?.antes),
      enPalabras(comp),
      significa ?? '',
    ]);
    /* El color va en la CELDA del veredicto, no en la fila entera: pintar la
       fila de rojo haría que el propio nombre del indicador pareciera un
       error. */
    if (comp?.veredicto === 'MEJOR') f.getCell(4).font = { bold: true, color: { argb: VERDE } };
    if (comp?.veredicto === 'PEOR') f.getCell(4).font = { bold: true, color: { argb: ROJO } };
    f.getCell(5).font = { size: 9, color: { argb: GRIS } };
    f.getCell(5).alignment = { wrapText: true, vertical: 'top' };
  }

  res.addRow([]);
  /* SE DICE EL TAMAÑO DE LA MUESTRA ANTERIOR. Con dos órdenes detrás, una
     comparación verde no significa nada — y este archivo va a un comité. */
  res.addRow([
    `Órdenes en el periodo: ${t.totalOrdenes ?? 0}`
    + ` · en el periodo anterior: ${t.comparativa?.muestraAnterior ?? 0}.`
    + ' Con pocas órdenes detrás, la comparación es orientativa.',
  ]).font = { italic: true, size: 9, color: { argb: GRIS } };

  /* ------------------------------------------- 2 · REPARTO DEL TRABAJO */
  const rep = wb.addWorksheet('Reparto del trabajo');
  rep.columns = [{ width: 30 }, { width: 12 }, { width: 12 }];
  cabecera(rep, ['Tipo de trabajo', 'Órdenes', '%']);
  const r = t.reparto || {};
  rep.addRow(['Correctivo (apagar fuegos)', r.correctivo ?? 0, celda(r.pct?.correctivo, ' %')]);
  rep.addRow(['Preventivo (adelantarse)', r.preventivo ?? 0, celda(r.pct?.preventivo, ' %')]);
  rep.addRow([]);
  /* LOS «OTROS» VAN APARTE Y SIN PORCENTAJE, igual que en la pantalla: no
     entran en el reparto —lo dice `base`— pero se enseñan para que el total
     cuadre con la lista de Órdenes. Si no, alguien suma y le faltan filas. */
  rep.addRow(['Fuera del reparto (el total cuadra con Órdenes):'])
    .font = { italic: true, size: 9, color: { argb: GRIS } };
  rep.addRow(['Mejora', r.otros?.mejora ?? 0, '—']);
  rep.addRow(['Mapeo', r.otros?.mapeo ?? 0, '—']);
  rep.addRow(['Predictivo (retirado, quedan los viejos)', r.otros?.predictivo ?? 0, '—']);
  if (r.lectura) {
    rep.addRow([]);
    rep.addRow([r.lectura]).font = { bold: true, color: { argb: AZUL } };
  }

  /* ------------------------------------------------- 3 · BACKLOG */
  const bk = wb.addWorksheet('Backlog');
  bk.columns = [{ width: 36 }, { width: 14 }];
  cabecera(bk, ['Antigüedad de lo que sigue abierto', 'Órdenes']);
  const b = t.backlog || {};
  bk.addRow(['Hasta 7 días — trabajo normal', b.hasta7 ?? 0]);
  bk.addRow(['De 8 a 30 días', b.de8a30 ?? 0]);
  bk.addRow(['De 31 a 90 días', b.de31a90 ?? 0]);
  bk.addRow(['Más de 90 días — ya nadie recuerda por qué', b.masDe90 ?? 0]);
  bk.addRow(['TOTAL abiertas', b.total ?? 0]).font = { bold: true };
  bk.addRow([]);
  bk.addRow(['Antigüedad media (días)', b.antiguedadMediaDias ?? 0]);
  bk.addRow(['La más antigua (días)', b.masAntiguaDias ?? 0]);

  /* -------------------------------------- 4 · EQUIPOS QUE MÁS FALLAN */
  const pe = wb.addWorksheet('Equipos que más fallan', { views: [{ state: 'frozen', ySplit: 1 }] });
  pe.columns = [{ width: 22 }, { width: 16 }, { width: 32 }, { width: 10 }, { width: 16 }];
  cabecera(pe, ['Código', 'Tipo', 'Dónde está', 'Averías', 'MTTR (h)']);
  for (const p of t.peores || []) {
    pe.addRow([p.assetCode, p.tipo ?? '—', p.lugar ?? '—', p.fallos ?? 0, celda(p.mttrHoras)]);
  }
  if (!(t.peores || []).length) {
    pe.addRow(['Ningún equipo con averías en el periodo.'])
      .font = { italic: true, color: { argb: GRIS } };
  }

  /* ------------------------------- 5 · LO QUE NO SE PODRÍA ENSEÑAR */
  const cu = wb.addWorksheet('Cumplimiento normativo', { views: [{ state: 'frozen', ySplit: 1 }] });
  cu.columns = [{ width: 44 }, { width: 10 }, { width: 12 }, { width: 40 }, { width: 44 }];
  cabecera(cu, ['Qué exige', 'Incumplen', 'De un total', 'Dónde se arregla', 'Por qué se exige']);
  for (const h of t.cumplimiento?.hallazgos || []) {
    const f = cu.addRow([h.exige, h.cuantos, h.deTotal, h.donde ?? '', h.porque ?? '']);
    f.getCell(1).alignment = { wrapText: true, vertical: 'top' };
    f.getCell(5).font = { size: 9, color: { argb: GRIS } };
    f.getCell(5).alignment = { wrapText: true, vertical: 'top' };
  }
  if (!(t.cumplimiento?.hallazgos || []).length) {
    /* SE DISTINGUE «nada que reprochar» de «no había a quién aplicarle nada».
       Contar como cumplida una regla sin destinatarios inflaría el porcentaje
       con reglas que no se han probado (bloque 78). */
    cu.addRow([
      t.cumplimiento?.totalReglas
        ? 'Ninguna regla incumplida en este periodo.'
        : 'Todavía no hay datos suficientes para evaluar ninguna regla.',
    ]).font = { italic: true, color: { argb: GRIS } };
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
