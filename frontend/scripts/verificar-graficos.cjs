#!/usr/bin/env node
/* =============================================================================
   VERIFICADOR · NINGÚN GRÁFICO HABLA EN INGLÉS DE PROGRAMADOR
   -----------------------------------------------------------------------------
   DE DÓNDE SALE

   El usuario pasó el ratón por una barra del tablero de indicadores y le
   salió esto:

       Alta
       value : 3

   `value` es el nombre INTERNO de la casilla en la base de datos. El gráfico
   estaba puesto sin decirle cómo hablar, así que soltó el nombre técnico tal
   cual delante de quien estaba viendo la demostración.

   Debía decir:  «Alta — 3 activos».

   Estaba en CINCO gráficos: cuatro del tablero y uno de almacén.

   POR QUÉ IMPORTA MÁS DE LO QUE PARECE

   Un «value : 3» no rompe nada. Simplemente le dice a quien mira que el
   software está a medio terminar, y eso contamina todo lo demás que vea
   después. En una exposición, ese detalle cuesta más credibilidad que un
   módulo que falte.

   LA REGLA

   Todo `<Tooltip>` de un gráfico lleva `formatter`. Y si las barras no
   declaran `name`, además `labelFormatter`.

   -----------------------------------------------------------------------------
   CÓMO EVITA LOS FALSOS POSITIVOS

   · Sólo mira archivos que importan de 'recharts'. Hay más cosas llamadas
     «Tooltip» en el sistema (los avisos de ayuda al pasar el ratón) y ésas
     no tienen nada que ver.
   · Lee la etiqueta ENTERA aunque esté repartida en varias líneas, que es
     como se escriben cuando llevan opciones.
   · Ignora comentarios, para no denunciarse a sí mismo al documentar el bug.
============================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', 'src');

function limpiar(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));
}

function archivos(dir, salida = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) archivos(p, salida);
    else if (/\.tsx$/.test(e.name)) salida.push(p);
  }
  return salida;
}

const hallazgos = [];
let revisados = 0;

for (const f of archivos(RAIZ)) {
  const crudo = fs.readFileSync(f, 'utf8');
  if (!/from ['"]recharts['"]/.test(crudo)) continue;   // no es un gráfico
  revisados++;
  const s = limpiar(crudo);

  let i = 0;
  while ((i = s.indexOf('<Tooltip', i)) !== -1) {
    // La etiqueta llega hasta su '>' de cierre, aunque ocupe varias líneas.
    const fin = s.indexOf('>', i);
    const etiqueta = s.slice(i, fin + 1);
    if (!/formatter\s*=/.test(etiqueta)) {
      const linea = s.slice(0, i).split('\n').length;
      hallazgos.push({
        f: path.relative(RAIZ, f),
        n: linea,
        t: crudo.split('\n')[linea - 1].trim().slice(0, 90),
      });
    }
    i = fin + 1;
  }
}

if (hallazgos.length) {
  console.error('');
  console.error('  GRÁFICO QUE ENSEÑA EL NOMBRE INTERNO DEL DATO');
  console.error('  ------------------------------------------------------------');
  console.error('  Un <Tooltip> sin `formatter` imprime la clave de la base tal');
  console.error('  cual. El usuario ve «value : 3» en vez de «3 activos», y a');
  console.error('  partir de ahí desconfía de todo lo que haya en la pantalla.');
  console.error('');
  console.error('  Ejemplo:');
  console.error("    <Tooltip formatter={(v) => [`${v} activo(s)`, '']}");
  console.error('             labelFormatter={(l) => String(l)} />');
  console.error('');
  for (const h of hallazgos) {
    console.error(`  ${h.f}:${h.n}`);
    console.error(`      ${h.t}`);
  }
  console.error('');
  console.error(`  ${hallazgos.length} gráfico(s) sin traducir.`);
  console.error('');
  process.exit(1);
}

console.log(`Gráficos verificados: ${revisados} pantalla(s) con gráficos, todos los avisos en castellano.`);
process.exit(0);
