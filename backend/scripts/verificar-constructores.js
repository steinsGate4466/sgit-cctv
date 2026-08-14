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

/* ---------------------------------------------------------------------------
   TRAMPA 2 — `const x = [];`  ->  TypeScript lo infiere como `never[]`
   ---------------------------------------------------------------------------
   Un array literal vacío sin anotar es `never[]`. El primer `push` falla con:

       Argument of type '{...cuarenta campos...}' is not assignable to
       parameter of type 'never'

   ...que no menciona el array por ningún lado. Cuesta más leer el error que
   arreglarlo, y sólo aparece al compilar — o sea, en la máquina del usuario.

   Costó una entrega en el bloque 17 (`const creadas = []` en campañas).
   Se caza aquí, que es gratis.

   NO se marca si en la misma línea ya hay un tipo (`: any[]`, `: string[]`),
   ni si es un `let` que se reasigna entero después.
--------------------------------------------------------------------------- */
{
  const sinTipo = [];
  for (const archivo of archivos(path.join(__dirname, '..', 'src'))) {
    const texto = fs.readFileSync(archivo, 'utf8');
    const rel = path.relative(path.join(__dirname, '..'), archivo);
    const lineas = texto.split('\n');
    lineas.forEach((linea, i) => {
      const m = linea.match(/^\s*const\s+(\w+)\s*=\s*\[\]\s*;/);
      if (!m) return;
      // ¿Se le hace push más adelante? Si no, es un array vacío inofensivo.
      const resto = lineas.slice(i + 1).join('\n');
      if (!new RegExp('\\b' + m[1] + '\\.push\\s*\\(').test(resto)) return;
      sinTipo.push({ archivo: rel, linea: i + 1, nombre: m[1] });
    });
  }
  if (sinTipo.length) {
    console.error('\n  ARRAYS VACÍOS SIN TIPO A LOS QUE SE LES HACE push\n');
    for (const x of sinTipo) {
      console.error(`    ${x.archivo}:${x.linea}   const ${x.nombre} = [];`);
      console.error(`      TypeScript lo infiere como never[] y el push no compila.`);
      console.error(`      Escríbelo así:  const ${x.nombre}: any[] = [];\n`);
    }
    process.exit(1);
  }
}

/* ---------------------------------------------------------------------------
   TRAMPA 3 — array de literales EXTRAÍDO a constante y metido en un `in:`
   ---------------------------------------------------------------------------
   Esto compila:

       where: { status: { in: ['ABIERTA', 'EN_PROCESO'] } }

   ...y esto NO:

       private readonly ABIERTAS = ['ABIERTA', 'EN_PROCESO'];
       where: { status: { in: this.ABIERTAS } }

   La diferencia es que en el primer caso el literal se tipa POR CONTEXTO
   —TypeScript ve que Prisma espera `WorkOrderStatus[]` y comprueba cada
   cadena—, y en el segundo la constante ya se infirió como `string[]` antes
   de llegar al `where`. Un `string` cualquiera no es un estado válido, así
   que Prisma lo rechaza.

   Es una trampa desagradable porque el código extraído se LEE mejor, y el
   error sólo aparece al compilar — o sea, en la máquina del usuario. Pasó en
   el bloque 29 con `OM_ABIERTA`.

   La solución es anotar el tipo:  `: WorkOrderStatus[] = [...]`
   Y de paso se gana algo: un estado mal escrito se caza al compilar.
--------------------------------------------------------------------------- */
{
  const sospechosos = [];
  for (const archivo of archivos(path.join(__dirname, '..', 'src'))) {
    const texto = fs.readFileSync(archivo, 'utf8');
    const lineas = texto.split('\n');

    // 1. Constantes de array de literales SIN anotación de tipo.
    const sinAnotar = new Map();   // nombre -> linea
    lineas.forEach((l, i) => {
      const m = l.match(/(?:private\s+)?(?:readonly\s+)?(?:const\s+)?(\w+)\s*=\s*\[\s*'[^']+'/);
      if (!m) return;
      if (/:\s*[\w.]+\[\]/.test(l)) return;      // ya lleva tipo
      if (/as\s+const/.test(l)) return;           // tupla readonly, otro caso
      sinAnotar.set(m[1], i + 1);
    });
    if (!sinAnotar.size) continue;

    // 2. ¿Alguna se usa dentro de un `in:` de Prisma?
    lineas.forEach((l, i) => {
      const m = l.match(/\bin:\s*(?:this\.)?(\w+)\b/);
      if (!m) return;
      const nombre = m[1];
      if (!sinAnotar.has(nombre)) return;
      sospechosos.push({
        archivo: path.relative(path.join(__dirname, '..'), archivo).replace(/\\/g, '/'),
        declarada: sinAnotar.get(nombre), usada: i + 1, nombre,
      });
    });
  }

  if (sospechosos.length) {
    console.error('\n  ARRAYS DE LITERALES SIN TIPO USADOS EN UN `in:` DE PRISMA\n');
    for (const x of sospechosos) {
      console.error(`    ${x.archivo}:${x.declarada}   ${x.nombre} = ['...']`);
      console.error(`      se usa en un in: en la línea ${x.usada}, y ahí Prisma lo rechaza.`);
      console.error(`      TypeScript la infirió string[]; el enum de Prisma no acepta string.`);
      console.error(`      Anótala:  ${x.nombre}: TuEnum[] = ['...']\n`);
    }
    process.exit(1);
  }
}

console.log('Constructores verificados: ningún `new` sobre un espacio de nombres.');
