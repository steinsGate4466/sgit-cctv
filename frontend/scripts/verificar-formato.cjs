/* =============================================================================
   VERIFICADOR 17 — FECHAS CON IDIOMA
   -----------------------------------------------------------------------------
   POR QUÉ EXISTE

   Había 17 sitios llamando a `toLocaleDateString()` sin indicar el idioma. Sin
   idioma, el navegador usa el del sistema operativo:

       PC en español   ->  15/8/2026
       PC en inglés    ->  8/15/2026

   El MISMO dato, con día y mes intercambiados. En una planta donde cada PC lo
   configuró una persona distinta, dos técnicos abren la misma orden y leen
   fechas diferentes — y ninguno tiene motivo para sospecharlo.

   Una fecha de mantenimiento mal leída es un trabajo hecho el mes que no toca.
   No es un fallo de estilo: es un dato incorrecto que parece correcto, que es
   la clase de fallo que este proyecto persigue.

   -----------------------------------------------------------------------------
   QUÉ HAY QUE USAR EN SU LUGAR

       import { fecha, fechaHora, hora } from '../formato';

   Todo con `es-PE` fijo, que es donde está la planta. No depende del PC de
   nadie.

   -----------------------------------------------------------------------------
   Los comentarios se quitan antes de buscar: la lección de `verificar-roles`.
   Este mismo archivo tiene que poder nombrar lo que prohíbe para explicarlo.
============================================================================= */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', 'src');

/* `formato.ts` es el único sitio donde estas llamadas son correctas: es quien
   las envuelve pasando el idioma. */
const EXENTO = 'formato.ts';

function sinComentarios(txt) {
  return txt
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function archivos(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...archivos(p));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const rel = (p) => path.relative(path.join(__dirname, '..'), p).replace(/\\/g, '/');

let errores = 0;
let revisados = 0;

for (const f of archivos(RAIZ)) {
  if (path.basename(f) === EXENTO) continue;
  revisados++;

  const lineas = sinComentarios(fs.readFileSync(f, 'utf8')).split('\n');
  lineas.forEach((linea, i) => {
    /* Se busca la llamada SIN ARGUMENTOS. Con idioma —`toLocaleDateString('es-PE')`
       o `toLocaleTimeString('es-PE', {...})`— es correcta y no se toca: la
       línea de tiempo del bloque 39 la usa así a propósito. */
    const m = linea.match(/\.toLocale(Date|Time)?String\(\s*\)/);
    if (m) {
      errores++;
      console.error(`  [ERROR] ${rel(f)}:${i + 1}`);
      console.error(`          ${linea.trim().slice(0, 90)}`);
    }
  });
}

console.log(`\nFormato: ${revisados} archivos revisados.`);

if (errores) {
  console.error(
    `\n${errores} fecha(s) sin idioma. Salen distintas según el PC de cada uno:\n`
    + '  PC en español -> 15/8/2026     PC en inglés -> 8/15/2026\n'
    + '\nUsa `fecha()`, `fechaHora()` o `hora()` de `src/formato.ts`.\n',
  );
  process.exit(1);
}
console.log('Todas las fechas llevan idioma: se leen igual en cualquier PC.');
