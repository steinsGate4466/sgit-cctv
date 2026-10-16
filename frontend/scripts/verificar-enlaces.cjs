#!/usr/bin/env node
/* =============================================================================
   VERIFICADOR · CADA ENLACE LLEGA FILTRADO — bloque 173
   -----------------------------------------------------------------------------
   DE DÓNDE SALE. El usuario: «los botones no funcionan correctamente». Uno de
   los motivos no estaba en el botón sino en la pantalla de destino: el enlace
   llevaba el filtro en la dirección y la pantalla NO LO LEÍA.

       QR → «Órdenes de este equipo»   /maintenance?q=CODIGO    (Órdenes leía `om`)
       Bandeja → «Ir a órdenes»         /maintenance?status=…    (no leía `status`)
       Dashboard → «Cámaras sin…»      /assets?status=…         (no leía nada)
       Retirados → «Ver ficha»         /assets?buscar=…         (idem)
       Indicadores → «Ver»             /assets?q=…              (idem)

   El botón navegaba y dejaba la lista ENTERA: para quien pulsa, el botón no
   hizo nada. Es la regla del §58 —«el enlace lleva al módulo YA FILTRADO por
   el problema del que se venía»— rota en silencio.

   QUÉ MIRA. Todo texto `'/ruta?param=…'` del frontend cuya ruta sea una
   pantalla de App.tsx (no las llamadas a la API). La pantalla de destino —o un
   archivo que ella importe— tiene que leer ese parámetro con `.get('param')`.
============================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');

const app = fs.readFileSync(path.join(SRC, 'App.tsx'), 'utf8');
const imports = {};
for (const m of app.matchAll(/const (\w+) = \w+\(\s*\(\)\s*=>\s*import\('([^']+)'\)/g)) imports[m[1]] = m[2];
for (const m of app.matchAll(/import (\w+) from '([^']+)'/g)) if (!imports[m[1]]) imports[m[1]] = m[2];
const rutas = {};
for (const m of app.matchAll(/path="([^"]+)" element=\{<(\w+)/g)) if (imports[m[2]]) rutas[m[1]] = imports[m[2]];

function resolver(desde, rel) {
  const base = path.resolve(path.dirname(desde), rel);
  return [base + '.tsx', base + '.ts', path.join(base, 'index.tsx'), base].find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
}

const cache = {};
/** Parámetros que lee una pantalla: los suyos y los de lo que importa (un nivel). */
function leidos(archivo) {
  if (cache[archivo]) return cache[archivo];
  const s = new Set();
  const txt = fs.readFileSync(archivo, 'utf8');
  const recoger = (t) => { for (const m of t.matchAll(/\.(?:get|has|getAll)\(\s*['"]([\w-]+)['"]\s*\)/g)) s.add(m[1]); };
  recoger(txt);
  for (const m of txt.matchAll(/from '(\.[^']+)'/g)) {
    const f = resolver(archivo, m[1]);
    if (f) recoger(fs.readFileSync(f, 'utf8'));
  }
  cache[archivo] = s;
  return s;
}

function* archivos(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) yield* archivos(p);
    else if (/\.tsx?$/.test(e.name)) yield p;
  }
}

const fallos = [];
let revisados = 0;
for (const f of archivos(SRC)) {
  const t = sinComentarios(fs.readFileSync(f, 'utf8'));
  for (const m of t.matchAll(/[`'"](\/[\w-]+)\?([^`'"\s]*)/g)) {
    const ruta = m[1];
    if (!rutas[ruta]) continue;
    const antes = t.slice(Math.max(0, m.index - 40), m.index);
    if (/api\.\w+\(\s*$/.test(antes)) continue; // llamada a la API, no un enlace
    const destino = resolver(path.join(SRC, 'App.tsx'), rutas[ruta]);
    if (!destino) continue;
    const lee = leidos(destino);
    for (const p of [...m[2].matchAll(/(?:^|&)([\w-]+)=/g)].map((x) => x[1])) {
      revisados += 1;
      if (!lee.has(p)) {
        const linea = t.slice(0, m.index).split('\n').length;
        fallos.push(`${path.relative(path.join(SRC, '..'), f)}:${linea}  ${ruta}?${p}=…  → ${path.basename(destino)} no lee «${p}»`);
      }
    }
  }
}

if (fallos.length) {
  console.error('\n  ENLACES CUYO FILTRO SE PIERDE AL LLEGAR\n  --------------------------------------');
  for (const x of fallos) console.error('  · ' + x);
  console.error('\n  El botón navega y deja la lista entera: parece que no hace nada.');
  console.error('  Que la pantalla lea el parámetro, o usa el que ya lee.\n');
  process.exit(1);
}
console.log(`Enlaces: ${revisados} parámetros de enlaces internos, todos leídos por su pantalla de destino.`);
