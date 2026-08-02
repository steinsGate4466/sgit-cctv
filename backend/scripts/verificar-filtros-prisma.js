#!/usr/bin/env node
/**
 * FILTROS DE PRISMA ANIDADOS POR ERROR
 *
 * POR QUÉ EXISTE
 * El 02/08 el tablero devolvía 400 en producción con este mensaje:
 *
 *     status: { notIn: { in: ["BAJA", "STOCK"] } }
 *     Argument `_ref` is missing.
 *
 * Un filtro dentro de otro filtro. El origen:
 *
 *     const outOfService: any = { in: ['BAJA', 'STOCK'] };   // <- objeto
 *     ... status: { notIn: outOfService }                    // <- y otra vez
 *
 * La constante ya era un filtro completo y se volvió a envolver. La forma
 * correcta es que la constante sea un ARRAY.
 *
 * LO QUE HIZO QUE NADIE LO VIERA: el `: any`.
 * TypeScript sabe perfectamente qué forma tiene un `where` de Prisma, y
 * habría rechazado esto al compilar. `: any` apaga exactamente esa
 * comprobación. Build en verde, pruebas en verde, y 400 en producción.
 *
 * Este verificador busca las dos formas del fallo:
 *   1. Literal:  notIn: { in: [...] }   ·   in: { notIn: [...] }
 *   2. Por constante: una constante declarada como { in: ... } o
 *      { notIn: ... } usada dentro de otro in/notIn.
 *
 * Uso:  node scripts/verificar-filtros-prisma.js
 * Sale con 1 si encuentra algo, para que la CI lo corte.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const CLAVES = ['in', 'notIn', 'equals', 'has', 'hasEvery', 'hasSome'];

function archivos(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) archivos(p, acc);
    else if (/\.ts$/.test(e.name) && !/\.spec\.ts$/.test(e.name)) acc.push(p);
  }
  return acc;
}

/** Quita comentarios para no avisar sobre un ejemplo escrito en una nota. */
function limpio(txt) {
  return txt.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
            .replace(/^([ \t]*)\/\/.*$/gm, '$1');
}

let fallos = 0;
const aviso = (f, linea, texto, arreglo) => {
  fallos++;
  console.error(`\n  ${path.relative(SRC, f)}:${linea}\n    ${texto}\n    arreglo: ${arreglo}`);
};

for (const f of archivos(SRC)) {
  const crudo = fs.readFileSync(f, 'utf8');
  const txt = limpio(crudo);
  const lineas = txt.split('\n');

  // --- Caso 1: filtro dentro de filtro, escrito a la vista ---
  for (const clave of CLAVES) {
    const re = new RegExp(`\\b${clave}\\s*:\\s*\\{\\s*(${CLAVES.join('|')})\\s*:`, 'g');
    let m;
    while ((m = re.exec(txt))) {
      const linea = txt.slice(0, m.index).split('\n').length;
      aviso(f, linea, `${clave}: { ${m[1]}: ... }  — un filtro dentro de otro filtro.`,
            `${clave} espera un array o un valor, no otro objeto de filtro.`);
    }
  }

  // --- Caso 2: por constante ---
  // Constantes declaradas COMO filtro: const X = { in: [...] }
  const constFiltro = new Map();
  const reDecl = new RegExp(
    `\\bconst\\s+(\\w+)\\s*(?::\\s*[^=]+)?=\\s*\\{\\s*(${CLAVES.join('|')})\\s*:`, 'g');
  let d;
  while ((d = reDecl.exec(txt))) {
    constFiltro.set(d[1], { clave: d[2], linea: txt.slice(0, d.index).split('\n').length });
  }
  for (const [nombre, info] of constFiltro) {
    for (const clave of CLAVES) {
      const reUso = new RegExp(`\\b${clave}\\s*:\\s*${nombre}\\b`, 'g');
      let u;
      while ((u = reUso.exec(txt))) {
        const linea = txt.slice(0, u.index).split('\n').length;
        aviso(f, linea,
          `${clave}: ${nombre}  — pero ${nombre} (línea ${info.linea}) ya es un filtro { ${info.clave}: ... }.`,
          `declara ${nombre} como ARRAY y úsalo en ${clave}: ${nombre}.`);
      }
    }
  }

  // --- Aviso blando: ': any' junto a un where de Prisma ---
  // No falla la CI, pero se señala: es el apagafuegos que dejó pasar el 400.
  lineas.forEach((l, i) => {
    if (/const\s+\w+\s*:\s*any\s*=\s*\{\s*(status|where|in|notIn)/.test(l)) {
      console.warn(`  aviso  ${path.relative(SRC, f)}:${i + 1}  ': any' en un filtro de Prisma apaga la comprobación de tipos.`);
    }
  });
}

if (fallos) {
  console.error(`\n${fallos} filtro(s) mal anidados. Prisma devolvería 400 en tiempo de ejecución.\n`);
  process.exit(1);
}
console.log('Filtros de Prisma verificados: ningún filtro anidado por error.');
