#!/usr/bin/env node
/* =============================================================================
   VERIFICADOR · NINGUNA FECHA SE PINTA A MANO
   -----------------------------------------------------------------------------
   DE DÓNDE SALE

   Había 15 sitios escribiendo esto directamente en la pantalla:

       {new Date(m.fecha).toLocaleDateString('es-PE')}

   Y tiene dos fallos, los dos vistos por el usuario:

   1. `new Date(null)` NO revienta: devuelve una fecha inválida, y
      `.toLocaleDateString()` sobre ella imprime literalmente «Invalid Date»
      en medio de una tabla de planta. El usuario no ve un error de programa:
      ve una tabla rota, y deja de fiarse de la tabla entera.

   2. Cada sitio decidía por su cuenta el formato. La misma fecha se veía de
      cuatro maneras distintas en cuatro pantallas.

   LA REGLA

   Todo lo que se pinta pasa por `src/fechas.ts`, que acepta nulos y devuelve
   «sin fecha» — nunca basura y nunca un hueco en blanco, porque un hueco en
   blanco y un dato que falta son indistinguibles para quien mira.

   -----------------------------------------------------------------------------
   QUÉ NO SE MARCA, PARA NO DAR FALSOS POSITIVOS

   · El propio `fechas.ts`, que es quien tiene permiso para hacerlo.
   · Los COMENTARIOS. La primera versión se denunciaba a sí misma: el ejemplo
     del bug está escrito dentro del comentario de `fechas.ts`.
   · `new Date()` sin argumentos (la hora actual) y la aritmética de fechas
     —`new Date(x).getTime()`, `< new Date()`— que es cálculo, no pantalla.
     Sólo se persigue lo que TERMINA EN TEXTO PARA EL USUARIO.
============================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', 'src');
const PERMITIDO = ['fechas.ts'];

/** Quita comentarios y cadenas conservando las líneas, para no delatarlos. */
function limpiar(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));
}

function archivos(dir, salida = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) archivos(p, salida);
    else if (/\.tsx?$/.test(e.name) && !PERMITIDO.includes(e.name)) salida.push(p);
  }
  return salida;
}

// Lo que de verdad acaba en pantalla: un formateo de fecha a texto.
const A_PANTALLA = /new Date\([^)]*\)\s*\.\s*toLocale(Date|Time)?String\s*\(/;

const hallazgos = [];
for (const f of archivos(RAIZ)) {
  const crudo = fs.readFileSync(f, 'utf8');
  const limpio = limpiar(crudo);
  limpio.split('\n').forEach((linea, i) => {
    if (A_PANTALLA.test(linea)) {
      hallazgos.push({
        f: path.relative(RAIZ, f),
        n: i + 1,
        t: crudo.split('\n')[i].trim().slice(0, 100),
      });
    }
  });
}

if (hallazgos.length) {
  console.error('');
  console.error('  FECHA PINTADA A MANO');
  console.error('  ------------------------------------------------------------');
  console.error('  `new Date(null).toLocaleDateString()` imprime «Invalid Date»');
  console.error('  en la pantalla. No falla: MIENTE, que es peor.');
  console.error('');
  console.error("  Usa src/fechas.ts:  fecha() · fechaHora() · hora() ·");
  console.error('                      fechaCorta() · haceCuanto() · paraInput()');
  console.error('');
  for (const h of hallazgos) {
    console.error(`  ${h.f}:${h.n}`);
    console.error(`      ${h.t}`);
  }
  console.error('');
  console.error(`  ${hallazgos.length} fecha(s) sin pasar por el formateador único.`);
  console.error('');
  process.exit(1);
}

console.log('Fechas verificadas: todas pasan por src/fechas.ts, ninguna puede imprimir «Invalid Date».');
process.exit(0);
