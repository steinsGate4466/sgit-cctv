#!/usr/bin/env node
/* =============================================================================
   VERIFICADOR 26 (frontend) · ELEGIR UN EQUIPO NO ES UNA LISTA PLANA
   -----------------------------------------------------------------------------
   DE DÓNDE SALE (bloque 121)

   Palabras del usuario: *«he visto un formulario que sale switch, switch,
   pantalla, no sé qué, cuando el formulario es de otra cosa»*.

   El barrido encontró **diez formularios** pintando la lista de activos plana:
   cuatrocientos equipos de catorce tipos ordenados por código. Una cámara, un
   switch, una pantalla y un teléfono IP seguidos, sin nada que los separe.

   POR QUÉ ES UN FALLO DE DATOS Y NO DE ESTÉTICA. El técnico busca la cámara
   `1262AT04`, ve `1262AP02` dos líneas más arriba y la pulsa. La orden queda
   apuntada al equipo equivocado, y a partir de ahí **el historial de los dos
   está mal**: el del que no se tocó y el del que sí. Y nadie lo descubre,
   porque no hay forma de saberlo mirando.

   -----------------------------------------------------------------------------
   LA REGLA: AGRUPAR, NO FILTRAR

   Filtrar por tipo sería peor: una incidencia puede ser de CUALQUIER equipo, y
   una lista filtrada dejaría fuera justo el que falló. Por eso
   `<SelectorDeActivo>` agrupa con `<optgroup>` y enseña dónde está cada uno.
   Filtrar se hace sólo cuando de verdad no cabe otro tipo —el grabador de una
   cámara es un NVR y no puede ser otra cosa—, y entonces se pasa `tipos`.

   -----------------------------------------------------------------------------
   QUÉ COMPRUEBA

   Que ningún `<option>` se pinte iterando una lista de activos —`opciones`,
   `activos`, `assets`— directamente dentro de un `<select>`. Para eso está el
   componente.

   LO QUE NO MIRA, para no gritar de más:
     · El propio `SelectorDeActivo.tsx`, que es quien tiene permiso.
     · `AssetSpecFields.tsx`, que YA filtra por tipo con `de('NVR')` y demás:
       ahí el tipo es obligatorio y una sola familia cabe, así que agrupar no
       aportaría nada.
     · Los desplegables de otras cosas —usuarios, ubicaciones, catálogos—: no
       son equipos y no tienen familias que confundir.

   PROBADO REINTRODUCIENDO EL FALLO: devolviendo la lista plana a uno de los
   formularios, sale con código 1 señalando archivo y línea.
============================================================================= */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');

/** Quién tiene permiso, y por qué. Una exención sin motivo vacía el verificador. */
const EXENTOS = {
  'components/SelectorDeActivo.tsx': 'Es el componente que hace el agrupado.',
  'components/AssetSpecFields.tsx':
    'Ya filtra por tipo con `de(\'NVR\')`, `de(\'SWITCH\')`… En la ficha de un '
    + 'equipo el tipo del enlace es obligatorio y sólo cabe una familia, así que '
    + 'agrupar no aportaría nada.',
};

/** Las listas que SON de activos. Otras (usuarios, ubicaciones) no se miran. */
const LISTAS = /\b(opciones|activos|assets|equipos)\b/;

const sinComentarios = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/^\s*\/\/.*$/gm, '');

function archivos(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', 'dist', 'generated'].includes(e.name)) continue;
      archivos(p, acc);
    } else if (/\.tsx$/.test(e.name)) acc.push(p);
  }
  return acc;
}

const problemas = [];
for (const f of archivos(SRC)) {
  const rel = path.relative(SRC, f).replace(/\\/g, '/');
  if (EXENTOS[rel]) continue;

  const t = sinComentarios(fs.readFileSync(f, 'utf8'));

  /* Se busca un `<select>` y, dentro de él, un `.map(` sobre una lista de
     activos que pinte `<option>`. El tope de 700 caracteres cubre de sobra el
     desplegable más largo del proyecto. */
  for (const m of t.matchAll(/<select\b[\s\S]{0,700}?<\/select>/g)) {
    const bloque = m[0];
    const it = [...bloque.matchAll(/\{\s*([A-Za-z_$][\w$.]*)\s*\.\s*(?:filter\([^)]*\)\s*\.\s*)?map\s*\(/g)];
    for (const x of it) {
      if (!LISTAS.test(x[1])) continue;
      if (!/assetCode/.test(bloque)) continue;      // no son equipos
      problemas.push({
        archivo: rel,
        linea: t.slice(0, m.index).split('\n').length,
        lista: x[1],
      });
      break;
    }
  }
}

if (!problemas.length) {
  console.log('[verificar:selector-activo] OK — ningún formulario pinta los equipos en lista plana.');
  process.exit(0);
}

for (const p of problemas) {
  console.error(`  [ERROR] ${p.archivo}:${p.linea} — pinta \`${p.lista}\` plano dentro de un <select>`);
}
console.error(
  '\nCuatrocientos equipos de catorce tipos en una lista ordenada por código son'
  + '\nun equipo mal elegido: el técnico busca 1262AT04, ve 1262AP02 dos líneas'
  + '\nmás arriba y la pulsa. A partir de ahí el historial de los DOS está mal.'
  + '\n\nUsa <SelectorDeActivo>: agrupa por tipo y enseña dónde está cada equipo.\n',
);
process.exit(1);
