#!/usr/bin/env node
/* =============================================================================
   VERIFICADOR · LOS TEXTOS DE PANTALLA SON CORTOS Y PROFESIONALES
   -----------------------------------------------------------------------------
   DE DÓNDE SALE

   Petición literal del usuario después de una exposición que salió mal:

       «los textos no tienen que ser estúpidos o sobre-estúpidos, tienen que
        ser textos cortos y profesionales en todos los dashboards e incluso
        formularios»

   Y tenía razón. El barrido encontró **72 bloques de prosa** de entre 100 y
   260 caracteres repartidos por 40 pantallas. Explicaciones de tres líneas
   debajo de cada tabla, párrafos justificando por qué existe un campo,
   metáforas.

   POR QUÉ ES UN DEFECTO Y NO UN GUSTO

   1. NADIE LOS LEE. En una pantalla de trabajo, un párrafo se salta. El
      espacio que ocupa sí se nota: empuja hacia abajo lo que sí importa.
   2. EN UNA EXPOSICIÓN, RESTAN. Un software que se explica a sí mismo en cada
      recuadro parece un software que no se entiende solo.
   3. EN MÓVIL SON UNA PARED. Con guantes y a pleno sol, tres líneas de texto
      gris son un obstáculo.

   LA REGLA

   Un texto de ayuda en pantalla no pasa de LIMITE caracteres. Si hace falta
   más, es documentación y va al manual, no debajo de una tabla.

   -----------------------------------------------------------------------------
   CÓMO EVITA LOS FALSOS POSITIVOS (la lección de los verificadores 6 y 9)

   · Ignora COMENTARIOS. El razonamiento del programador puede ser tan largo
     como haga falta: no lo ve nadie más. Es la pantalla la que se cuida.
   · Ignora cualquier línea con código —llaves, comillas, dos puntos, igual—
     para no confundir un mapa de traducciones con un párrafo.
   · Exige 14 palabras además de la longitud: un código de activo largo o una
     ruta no son prosa.
============================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', 'src');
/** Máximo de caracteres de un texto de ayuda en pantalla. */
const LIMITE = 110;
/** Y como mínimo tantas palabras para considerarlo prosa y no un dato. */
const MIN_PALABRAS = 14;

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

for (const f of archivos(RAIZ)) {
  const lineas = limpiar(fs.readFileSync(f, 'utf8')).split('\n');
  let buf = [];
  let ini = 0;

  const cerrar = () => {
    if (!buf.length) return;
    const t = buf.map((x) => x.trim()).join(' ').replace(/\s+/g, ' ').trim();
    const palabras = t.split(' ').length;
    if (t.length > LIMITE && palabras >= MIN_PALABRAS) {
      hallazgos.push({ f: path.relative(RAIZ, f), n: ini, len: t.length, t: t.slice(0, 120) });
    }
    buf = [];
  };

  lineas.forEach((l, i) => {
    const t = l.trim();
    // Prosa = texto JSX suelto: sin etiquetas, sin código, sin comillas.
    const esProsa = t && !/[<>{}=;()[\]'"|:]/.test(t) && t.includes(' ') && !t.startsWith('*');
    if (esProsa) {
      if (!buf.length) ini = i + 1;
      buf.push(t);
    } else {
      cerrar();
    }
  });
  cerrar();
}

if (hallazgos.length) {
  console.error('');
  console.error('  TEXTO DEMASIADO LARGO EN PANTALLA');
  console.error('  ------------------------------------------------------------');
  console.error(`  Máximo ${LIMITE} caracteres. Un párrafo debajo de una tabla no`);
  console.error('  se lee: ocupa sitio, empuja lo importante hacia abajo y en una');
  console.error('  exposición hace que el software parezca poco terminado.');
  console.error('');
  console.error('  Si hace falta más, es documentación: va al manual.');
  console.error('');
  for (const h of hallazgos) {
    console.error(`  ${h.f}:${h.n}  [${h.len} caracteres]`);
    console.error(`      ${h.t}…`);
  }
  console.error('');
  console.error(`  ${hallazgos.length} texto(s) por encima del límite.`);
  console.error('');
  process.exit(1);
}

console.log(`Textos verificados: ninguno pasa de ${LIMITE} caracteres en pantalla.`);
process.exit(0);
