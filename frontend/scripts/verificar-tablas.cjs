#!/usr/bin/env node
/* =============================================================================
   VERIFICADOR · NINGUNA TABLA SALE DESCUADRADA
   -----------------------------------------------------------------------------
   DE DÓNDE SALE

   La pantalla de Usuarios tenía CUATRO encabezados —Nombre, Correo, Rol,
   Estado— y CINCO columnas de datos: faltaba «Trenes».

   El resultado en pantalla: «Estado» escrito encima de la columna del ámbito
   de trenes, y la columna de estado sin ningún título. Los datos están todos
   bien; lo que está mal es a qué columna pertenece cada uno.

   POR QUÉ SOBREVIVIÓ A TODAS LAS REVISIONES

   Porque NO ROMPE NADA. El navegador pinta la tabla igual, TypeScript no se
   entera, el lint no se entera y las pruebas tampoco. Sólo se ve mirando la
   pantalla y contando. Es exactamente el tipo de defecto que llega a una
   exposición: silencioso, visible y de los que hacen dudar de todo lo demás.

   LA REGLA

   Tantos `<th>` como `<td>`, contando los `colSpan`.

   -----------------------------------------------------------------------------
   CÓMO EVITA LOS FALSOS POSITIVOS

   Dos casos reales aparecieron en la primera versión y los dos son legítimos:

   · FILA DE «NO HAY DATOS»: un solo `<td colSpan={13}>`. Se acepta cualquier
     fila cuyos colSpan sumen el total de columnas.
   · ENCABEZADO ALTERNATIVO: pantallas con pestañas que eligen entre dos
     `<thead>` distintos con un ternario. Se cuenta cada `<tr>` del encabezado
     por separado y basta con que el cuerpo cuadre con UNO de ellos.
   · COLUMNAS CONDICIONALES: `{can('credential.read') && <th>IP</th>}`. El
     número de columnas depende del PERMISO de quien mira, así que no se puede
     contar leyendo el archivo. Esas tablas se saltan enteras.

     La primera versión no lo hacía y sacó TRES avisos —Activos, Riesgo y
     Zonas— los tres legítimos. Un verificador con tres falsos positivos y un
     acierto se ignora a la semana, y entonces no sirve el día que importa.
============================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', 'src');

function limpiar(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

function archivos(dir, salida = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) archivos(p, salida);
    else if (/\.tsx$/.test(e.name)) salida.push(p);
  }
  return salida;
}

/** Columnas que ocupa una fila, contando colSpan. */
function columnas(fila, etiqueta) {
  const celdas = fila.match(new RegExp(`<${etiqueta}[ >]`, 'g')) || [];
  let total = celdas.length;
  for (const m of fila.matchAll(/colSpan=\{?(\d+)/g)) total += Number(m[1]) - 1;
  return total;
}

const hallazgos = [];

for (const f of archivos(RAIZ)) {
  const s = limpiar(fs.readFileSync(f, 'utf8'));

  for (const m of s.matchAll(/<thead>([\s\S]*?)<\/thead>([\s\S]{0,5000}?)<\/tbody>/g)) {
    /* Columnas que aparecen o no según el permiso o un estado. El número real
       lo decide el navegador en tiempo de ejecución, así que contar aquí sólo
       produce ruido. Se salta la tabla entera. */
    const trozo = m[1] + m[2];
    const condicional =
      /(\?|&&)\s*<t[hd][\s>]/.test(trozo)        // {can(..) && <th>IP</th>}
      || /<>/.test(trozo);                        // {cond ? (<>…tds…</>) : (<>…</>)}
    if (condicional) continue;

    // Puede haber varios <tr> de encabezado (pestañas con ternario).
    const posibles = [...m[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
      .map((t) => columnas(t[1], 'th'))
      .filter((n) => n > 0);
    if (!posibles.length) continue;

    for (const t of m[2].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
      const n = columnas(t[1], 'td');
      if (n === 0) continue;                       // fila sin celdas: no aplica
      if (posibles.includes(n)) continue;          // cuadra con algún encabezado
      hallazgos.push({
        f: path.relative(RAIZ, f),
        n: s.slice(0, m.index).split('\n').length,
        th: posibles.join(' o '),
        td: n,
      });
      break;                                        // una por tabla, no se repite
    }
  }
}

if (hallazgos.length) {
  console.error('');
  console.error('  TABLA DESCUADRADA');
  console.error('  ------------------------------------------------------------');
  console.error('  Hay más (o menos) encabezados que columnas de datos, así que');
  console.error('  los títulos quedan encima de la columna equivocada.');
  console.error('');
  console.error('  No rompe nada: por eso llega hasta una exposición.');
  console.error('');
  for (const h of hallazgos) {
    console.error(`  ${h.f}:${h.n}   encabezado ${h.th} · datos ${h.td}`);
  }
  console.error('');
  console.error(`  ${hallazgos.length} tabla(s) descuadrada(s).`);
  console.error('');
  process.exit(1);
}

console.log('Tablas verificadas: encabezados y columnas cuadran en todas.');
process.exit(0);
