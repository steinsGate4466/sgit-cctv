#!/usr/bin/env node
/* =============================================================================
   VERIFICADOR 24 (frontend) · LA PANTALLA SE LLAMA IGUAL EN LOS DOS SITIOS
   -----------------------------------------------------------------------------
   DE DÓNDE SALE (bloque 119)

   Cada pantalla tiene su nombre escrito DOS VECES:

     · en el mapa de títulos de `Layout.tsx`, que es el que se VE en la
       cabecera;
     · en su propio `<h1 className="page-title">`, que está oculto a la vista
       —`clip-path`— y existe para los LECTORES DE PANTALLA.

   Ese segundo no se borró a propósito: sin él, quien navega a ciegas se queda
   sin encabezado de sección. Pero al estar invisible, **nadie nota cuando los
   dos dejan de decir lo mismo**.

   Y se desincronizan solos: al renombrar una entrada de menú se toca el mapa y
   se olvida el `<h1>`. Pasó con cuatro pantallas a la vez:

       /dependencias   cabecera «Impacto de una caída»
                       pantalla «De qué depende cada cámara»

   Resultado: el lector de pantalla anuncia una cosa y el monitor enseña otra.
   Para una persona que ve, invisible. Para una que no ve, es OTRA pantalla.

   -----------------------------------------------------------------------------
   QUÉ COMPRUEBA

   Que el texto del `page-title` de cada pantalla coincida, palabra por palabra,
   con el que `Layout.tsx` pone en la cabecera para esa ruta.

   LO QUE NO MIRA, para no gritar de más:
     · Pantallas sin `page-title`: no todas lo tienen, y no tenerlo no es un
       fallo de sincronía sino, como mucho, de accesibilidad — otro asunto.
     · Títulos armados con una variable (`{tren.nombre}`): ahí no hay texto
       fijo que comparar.

   PROBADO REINTRODUCIENDO EL FALLO: cambiando el `<h1>` de una pantalla, sale
   con código 1 y enseña los dos textos enfrentados.
============================================================================= */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const sinComentarios = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/^\s*\/\/.*$/gm, '');
const leer = (f) => sinComentarios(fs.readFileSync(path.join(SRC, f), 'utf8'));

const layout = leer(path.join('components', 'Layout.tsx'));
const titulos = new Map();
for (const m of layout.matchAll(/'(\/[\w/-]*)':\s*'([^']+)'/g)) titulos.set(m[1], m[2]);

const app = leer('App.tsx');
const lazy = new Map();
for (const m of app.matchAll(/const\s+(\w+)\s*=\s*lazyConReintento\(\(\)\s*=>\s*import\('\.\/pages\/([\w/-]+)'\)\)/g)) {
  lazy.set(m[1], m[2]);
}
const pantallas = new Map();
for (const m of app.matchAll(/<Route\s+path="([^"]+)"\s+element=\{<(\w+)/g)) {
  if (lazy.has(m[2])) pantallas.set(m[1], lazy.get(m[2]));
}

const desajustes = [];
for (const [ruta, pag] of pantallas) {
  const f = path.join(SRC, 'pages', `${pag}.tsx`);
  if (!fs.existsSync(f)) continue;
  const t = sinComentarios(fs.readFileSync(f, 'utf8'));
  // Sólo los títulos de TEXTO FIJO: los que llevan `{algo}` no se comparan.
  const encontrados = [...t.matchAll(/className="page-title"[^>]*>([^<{]*)</g)]
    .map((m) => m[1].trim())
    .filter(Boolean);
  if (!encontrados.length) continue;

  const cabecera = titulos.get(ruta);
  if (!cabecera) continue;

  for (const x of new Set(encontrados)) {
    if (x !== cabecera) desajustes.push({ ruta, pag, cabecera, pantalla: x });
  }
}

if (!desajustes.length) {
  console.log(`[verificar:titulos] OK — ${pantallas.size} pantallas, el nombre de la cabecera y el del lector coinciden.`);
  process.exit(0);
}

for (const d of desajustes) {
  console.error(`  [ERROR] ${d.ruta} (${d.pag}.tsx)`);
  console.error(`          cabecera: «${d.cabecera}»`);
  console.error(`          pantalla: «${d.pantalla}»`);
}
console.error(
  '\nEl `<h1 className="page-title">` está oculto a la vista y existe para los'
  + '\nlectores de pantalla. Si dice algo distinto de la cabecera, quien navega a'
  + '\nciegas cree estar en otra pantalla — y nadie lo nota, porque no se ve.'
  + '\n\nManda el de la cabecera: es el que el usuario lee.\n',
);
process.exit(1);
