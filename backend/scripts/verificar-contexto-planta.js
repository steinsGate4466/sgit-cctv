#!/usr/bin/env node
/* =============================================================================
   VERIFICADOR 20 (backend) · EL ÁRBOL DE PLANTA NO SE ALIMENTA A CIEGAS
   -----------------------------------------------------------------------------
   DE DÓNDE SALE (bloque 102). El usuario vio dos pantallas contradiciéndose
   sobre el MISMO tren:

       «Por tren»     →  Tren 1: 2 cámaras · 1 antena · 6 activos
       «Mis cámaras»  →  Tren 1: «todavía no tiene cámaras cargadas»

   La causa: `camaras-caidas.service.ts` pedía las cámaras con `select:` y
   ponía `location` —el objeto— pero **no `locationId`**, que es la clave
   foránea. Con `select` Prisma trae SÓLO lo pedido, así que llegaba
   `undefined`, y el recorrido del árbol empieza justo por ahí. Sin recorrido
   no hay tren, y el filtro descartaba todas las cámaras. En silencio.

   «Por tren» funcionaba porque usa `include:`, que trae todos los campos.

   -----------------------------------------------------------------------------
   ESTE VERIFICADOR ES DELIBERADAMENTE PEQUEÑO, Y ESO ES LO IMPORTANTE

   Mi primer barrido buscó consultas con `select:` sin `locationId` y dio
   **22 candidatas**. Al hacer `locationId` OBLIGATORIO en `ActivoLike` y
   quitar los `as any`, **el compilador dijo que había UNA**.

   > Las otras 21 eran ruido de mi barrido. El compilador no se equivoca y un
   > barrido de texto sí. **Cuando existe una herramienta exacta, escribir una
   > aproximada al lado no añade seguridad: añade falsos positivos, y un
   > verificador que grita cuando no pasa nada se ignora a la semana.**

   Así que este verificador NO vuelve a comprobar los `select`. Eso ya lo hace
   TypeScript, mejor. Sólo protege **lo único que TypeScript no puede ver: que
   alguien lo apague.**

   -----------------------------------------------------------------------------
   QUÉ COMPRUEBA — tres cosas, y ninguna es un barrido

     1. `ActivoLike.locationId` sigue siendo OBLIGATORIO (sin `?`). Devolverle
        la interrogación reabre el bug entero y no rompe nada al hacerlo.
     2. Ninguna llamada a `resolverContextoDePlanta` pasa su lista con
        `as any`. Ese `as any` es exactamente lo que tuvo el compilador callado
        mientras la pantalla salía vacía — había DIECINUEVE.
     3. El recorrido del árbol sigue arrancando desde `activo.locationId`. Si
        alguien lo cambia por `activo.location?.id`, este verificador deja de
        tener sentido y hay que reescribirlo: mejor que avise a que dé verde
        vigilando algo que ya no existe (bloque 74).

   Probado reintroduciendo el fallo en las tres direcciones.
============================================================================= */

const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const SRC = path.join(RAIZ, 'src');
const CONTEXTO = path.join(SRC, 'common', 'plant-context.ts');

const rojo = (t) => `\x1b[31m${t}\x1b[0m`;
const verde = (t) => `\x1b[32m${t}\x1b[0m`;

const hallazgos = [];
const apunta = (t) => hallazgos.push(t);

/** Fuera comentarios. Las cadenas se conservan: aquí no estorban. */
function sinComentarios(txt) {
  let salida = '';
  let i = 0;
  while (i < txt.length) {
    const dos = txt.slice(i, i + 2);
    if (dos === '//') {
      while (i < txt.length && txt[i] !== '\n') i++;
      continue;
    }
    if (dos === '/*') {
      i += 2;
      while (i < txt.length && txt.slice(i, i + 2) !== '*/') i++;
      i += 2;
      continue;
    }
    salida += txt[i];
    i++;
  }
  return salida;
}

function recorrer(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const c = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'generated' || e.name === 'node_modules') continue;
      recorrer(c, out);
    } else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) {
      out.push(c);
    }
  }
  return out;
}

/* ── 0 · el archivo tiene que existir ─────────────────────────────────────── */
if (!fs.existsSync(CONTEXTO)) {
  console.error(rojo('\n  No se encuentra src/common/plant-context.ts. Actualiza este verificador.\n'));
  process.exit(1);
}
const contexto = sinComentarios(fs.readFileSync(CONTEXTO, 'utf8'));

/* ── 1 · `locationId` sigue siendo OBLIGATORIO ───────────────────────────── */
const decl = contexto.slice(contexto.indexOf('interface ActivoLike'));
const cuerpo = decl.slice(0, decl.indexOf('}') + 1);
if (/locationId\s*\?\s*:/.test(cuerpo)) {
  apunta(
    '`ActivoLike.locationId` ha vuelto a ser OPCIONAL (`locationId?:`).\n'
    + '     Con la interrogación, una consulta que se deje ese campo COMPILA, y el\n'
    + '     recorrido del árbol de planta no arranca: la pantalla sale vacía sin un\n'
    + '     solo error. Es el bug del bloque 102 —«Mis cámaras» decía que el tren no\n'
    + '     tenía cámaras mientras «Por tren» enseñaba dos—. Quita la interrogación:\n'
    + '     `null` sí vale (un activo en STOCK no cuelga de ninguna ubicación);\n'
    + '     lo que no puede valer es NO DECIR NADA.',
  );
} else if (!/locationId\s*:/.test(cuerpo)) {
  apunta(
    'No encuentro `locationId` en `ActivoLike`. Si el campo cambió de nombre,\n'
    + '     actualiza este verificador: uno que no encuentra lo que vigila es un\n'
    + '     verificador apagado (bloque 74).',
  );
}

/* ── 2 · nadie apaga el compilador con `as any` ──────────────────────────── */
for (const archivo of recorrer(SRC)) {
  const rel = path.relative(SRC, archivo).split(path.sep).join('/');
  const limpio = sinComentarios(fs.readFileSync(archivo, 'utf8'));
  const re = /resolverContextoDePlanta\s*\(\s*[^,]+,\s*([^)]*?)\)/g;
  let m;
  while ((m = re.exec(limpio)) !== null) {
    if (/\bas\s+any\b/.test(m[1])) {
      apunta(
        `src/${rel} pasa la lista a \`resolverContextoDePlanta\` con \`as any\`.\n`
        + '     **Ese `as any` es lo que tuvo al compilador callado** mientras la\n'
        + '     pantalla salía vacía: apaga la única comprobación que garantiza que la\n'
        + '     consulta trajo `locationId`. Había DIECINUEVE y se quitaron todos.\n'
        + '     Si la consulta no encaja, arregla la consulta — no el tipo.',
      );
    }
  }
}

/* ── 3 · el recorrido sigue empezando por `locationId` ───────────────────── */
if (!/activo\.locationId\s*\?/.test(contexto)) {
  apunta(
    'El recorrido del árbol ya no arranca en `activo.locationId`.\n'
    + '     Este verificador vigila que ese campo llegue siempre; si el cálculo dejó\n'
    + '     de usarlo, lo que vigila ya no es lo que importa. Reescríbelo o bórralo,\n'
    + '     pero no lo dejes dando verde sobre algo que no existe.',
  );
}

/* ── Informe ─────────────────────────────────────────────────────────────── */
if (hallazgos.length) {
  console.error(rojo('\n  EL ÁRBOL DE PLANTA SE PUEDE ALIMENTAR A CIEGAS:\n'));
  for (const h of hallazgos) console.error(`   · ${h}\n`);
  console.error(rojo('  Sin `locationId` no hay tren, y la pantalla sale vacía sin un solo error.\n'));
  process.exit(1);
}

console.log(verde(
  'Contexto de planta: `locationId` es obligatorio, ningún `as any` lo apaga '
  + 'y el recorrido sigue arrancando por él.',
));
