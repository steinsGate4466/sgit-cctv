#!/usr/bin/env node
/**
 * `new X()` SOBRE UN MÓDULO IMPORTADO CON `import * as`.
 *
 * POR QUÉ EXISTE
 * El 02/08 la hoja de etiquetas de gabinetes fallaba con "No se pudieron
 * generar las etiquetas". La causa:
 *
 *     import * as PDFDocument from 'pdfkit';
 *     ...
 *     const doc = new PDFDocument({ ... });   // <- revienta en ejecución
 *
 * Con `esModuleInterop`, `import * as` devuelve un OBJETO DE ESPACIO DE
 * NOMBRES. Tiene los métodos del módulo —por eso `QRCode.toBuffer(...)`
 * funcionaba— pero NO se puede llamar con `new`.
 *
 * Y lo peor: COMPILA SIN UNA QUEJA. Sólo falla al pulsar el botón.
 *
 * La forma que sí funciona con estas librerías de CommonJS es la que ya se
 * usaba en assets.service.ts:  const PDFDocument = require('pdfkit');
 *
 * Uso: node scripts/verificar-constructores.js
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');

function archivos(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) archivos(p, acc);
    else if (/\.ts$/.test(e.name) && !/\.spec\.ts$/.test(e.name)) acc.push(p);
  }
  return acc;
}

const limpio = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, (m) => '\n'.repeat(m.split('\n').length - 1))
   .replace(/^([ \t]*)\/\/.*$/gm, '$1');

let fallos = 0;
for (const f of archivos(SRC)) {
  const txt = limpio(fs.readFileSync(f, 'utf8'));

  // Nombres importados con `import * as X from '...'`
  const espacios = new Map();
  for (const m of txt.matchAll(/import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g)) {
    espacios.set(m[1], m[2]);
  }
  if (espacios.size === 0) continue;

  for (const [nombre, modulo] of espacios) {
    const re = new RegExp(`new\\s+${nombre}\\s*\\(`, 'g');
    let m;
    while ((m = re.exec(txt))) {
      fallos++;
      const linea = txt.slice(0, m.index).split('\n').length;
      console.error(
        `\n  ${path.relative(SRC, f)}:${linea}\n` +
        `    new ${nombre}() sobre un módulo importado con 'import * as'.\n` +
        `    Compila, pero al ejecutarse da "${nombre} is not a constructor".\n` +
        `    arreglo: const ${nombre} = require('${modulo}');`,
      );
    }
  }
}

if (fallos) {
  console.error(`\n${fallos} constructor(es) que van a fallar en ejecución.\n`);
  process.exit(1);
}
console.log('Constructores verificados: ningún `new` sobre un espacio de nombres.');
