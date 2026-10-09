#!/usr/bin/env node
/* =============================================================================
   VERIFICADOR · CADA DESPLEGABLE OFRECE LO QUE SU CAMPO PIDE — bloque 172
   -----------------------------------------------------------------------------
   DE DÓNDE SALE. El usuario: «en una lista de mapas o de direcciones salen
   también los gabinetes. Eso no debería ser así. Verifica todo.»

   El repaso de los 161 desplegables encontró cuatro familias de fallo, y las
   cuatro se repiten solas si nadie las vigila:

   1. UBICACIONES SIN FILTRAR. Doce formularios pintaban `/locations` entero:
      gabinetes (RACK) y la empresa en «¿dónde está montado?», en «zona del
      plano», en «ubicación del tablero»… Ahora pasan por <OpcionesDeUbicacion
      uso="…">, que sabe qué tipos valen para cada cosa (ubicaciones.tsx).

   2. TRENES ESCRITOS A MANO. Ocho desplegables con ['T1','T2','T3']: faltaban
      Grúas y Oficinas, y en cinco tablas la base no guarda «T1» sino TREN_1 —
      NO SE PODÍA APUNTAR NINGUNA PARADA—. Ahora salen de la base
      (<OpcionesDeTren>) o del enum (<OpcionesDeTrenDePlanta>).

   3. «¿A QUIÉN SE LO ASIGNAS?» CON TODOS LOS USUARIOS. El consultor externo o
      el jefe de línea salían como técnicos. Ahora `/users/ejecutores`.

   4. LISTAS PLANAS DE EQUIPOS. Ya lo vigila `verificar-selector-activo`; aquí
      sólo se añade que el formulario de acceso no vuelva a la lista plana.

   Se lee el código SIN comentarios: éste y otros archivos explican el fallo.
============================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

function archivos(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...archivos(p));
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

const fallos = [];
const rel = (p) => path.relative(path.join(__dirname, '..'), p);

/* Quien puede pedir la lista completa de usuarios: la gestión de usuarios y la
   limpieza (que enseña de quién es cada cosa). Para asignar trabajo, no. */
const USUARIOS_COMPLETOS = new Set(['src/pages/Users.tsx', 'src/pages/Limpieza.tsx']);

for (const f of archivos(SRC)) {
  const r = rel(f).split(path.sep).join('/');
  if (r === 'src/ubicaciones.tsx') continue;
  const s = sinComentarios(fs.readFileSync(f, 'utf8'));

  // 1. Lista de ubicaciones pintada a mano dentro de un desplegable.
  const crudas = [...s.matchAll(/\b(locations|ubicaciones|suyas|rows)\.(?:filter\([^)]*\)\.)?map\(\(\s*\w+(?:\s*:\s*any)?\s*\)\s*=>\s*<option/g)];
  for (const m of crudas) {
    const linea = s.slice(0, m.index).split('\n').length;
    fallos.push(`${r}:${linea} pinta «${m[1]}» a mano en un desplegable. Usa <OpcionesDeUbicacion uso="…"> `
      + '(sin gabinetes ni empresa, agrupado por tren) o padresPosibles() para el padre.');
  }

  // 2. Trenes escritos a mano.
  if (/\[\s*'T1'\s*,\s*'T2'\s*,\s*'T3'\s*\]/.test(s) || /<option value="T1">/.test(s)) {
    fallos.push(`${r} escribe los trenes a mano (T1, T2, T3). Faltan Grúas y Oficinas, y en paradas, `
      + 'instalaciones, tableros, subredes y campañas la base guarda TREN_1. Usa <OpcionesDeTren> o <OpcionesDeTrenDePlanta>.');
  }

  // 3. Lista completa de usuarios para asignar trabajo.
  if (!USUARIOS_COMPLETOS.has(r) && /api\.get\(\s*'\/users'\s*\)/.test(s)) {
    fallos.push(`${r} pide '/users' (todos los usuarios). Para asignar o acompañar un trabajo usa '/users/ejecutores'.`);
  }
}

// 4b. Listas de valores que mezclan códigos con texto: «Crítica» en vez de CRITICA.
//     La base guarda el código; el texto va en la etiqueta, nunca en el valor.
const TEXTO_LIBRE = new Set(['COND_STATES']); // condición del checklist: se guarda como texto
for (const f of archivos(SRC)) {
  const r = rel(f).split(path.sep).join('/');
  const s = sinComentarios(fs.readFileSync(f, 'utf8'));
  for (const m of s.matchAll(/const\s+(\w+)\s*(?::[^=]+)?=\s*\[((?:\s*'[^']*'\s*,?)+)\]/g)) {
    if (TEXTO_LIBRE.has(m[1])) continue;
    const vals = [...m[2].matchAll(/'([^']*)'/g)].map((x) => x[1]);
    const codigos = vals.filter((v) => /^[A-Z0-9_]+$/.test(v));
    if (vals.length >= 3 && codigos.length >= vals.length - 2 && codigos.length !== vals.length) {
      fallos.push(`${r}: la lista ${m[1]} mezcla códigos con texto (${vals.filter((v) => !/^[A-Z0-9_]+$/.test(v)).join(', ')}). `
        + 'El valor que se guarda es el código; el texto va en la etiqueta.');
    }
  }
}

// 4. El formulario de acceso usa el selector agrupado.
const acceso = sinComentarios(fs.readFileSync(path.join(SRC, 'components', 'AccessRequestForm.tsx'), 'utf8'));
if (!/<SelectorDeActivo\b/.test(acceso)) {
  fallos.push('AccessRequestForm.tsx volvió a la lista plana de equipos: usa <SelectorDeActivo>.');
}

// 5. El tipo «Predictivo» no se ofrece al CREAR una orden (retirado, bloque 80).
for (const r of ['src/components/AsignarOm.tsx']) {
  const s = sinComentarios(fs.readFileSync(path.join(__dirname, '..', r), 'utf8'));
  if (/\bWO_TYPES\.map/.test(s)) fallos.push(`${r} ofrece WO_TYPES al crear (incluye Predictivo). Usa WO_TYPES_NUEVA.`);
}

if (fallos.length) {
  console.error('\n  DESPLEGABLES QUE OFRECEN LO QUE SU CAMPO NO PIDE\n  ------------------------------------------------');
  for (const x of fallos) console.error('  · ' + x);
  console.error('');
  process.exit(1);
}
console.log('Desplegables: ubicaciones filtradas por uso, trenes de la base, asignación sólo a quien ejecuta.');
