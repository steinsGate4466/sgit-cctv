#!/usr/bin/env node
/* =============================================================================
   VERIFICADOR · LOS NOMBRES DE CAMPO VAN SIN TILDES — bloque 173
   -----------------------------------------------------------------------------
   DE DÓNDE SALE. El usuario: «en el switch no se está guardando qué puertos se
   ha seleccionado». Se guardaba. La rejilla buscaba

       sw.puertos.find((x) => x.número === n)      ← con tilde

   y el servidor manda `numero`. `x.número` es `undefined` siempre: ningún
   puerto salía ocupado NUNCA. No falla el typecheck (el dato viene como `any`),
   no falla el lint, no falla ninguna prueba. El texto en castellano se corrige
   con tildes; un nombre de campo, no.

   Con el mismo barrido salieron TRES más, igual de mudos:
     · Bandeja      `w.técnico`     → «sin asignar» en TODAS las órdenes en espera
     · Por tren     `a.ubicación`   → la columna Ubicación siempre «—»
     · Por tren     `g.ubicación`   → igual en los grabadores
   (y `vecesFaltó`, que coincidía en los dos lados y se renombró por regla).

   QUÉ MIRA. Con el analizador de TypeScript —no con expresiones regulares, que
   leerían también los textos—, en el frontend y en el backend:
     · `objeto.nombreConTilde`            (lectura de un campo)
     · `{ nombreConTilde: … }`             (clave de un objeto)
     · `{ nombreConTilde }`                (atajo) y desestructuraciones
     · `nombreConTilde: tipo` en un tipo/interfaz
   Las CADENAS y los comentarios no cuentan: ahí la tilde es correcta.
============================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

let ts;
try { ts = require('typescript'); } catch {
  console.log('Propiedades: typescript no está instalado; no se puede comprobar (se salta).');
  process.exit(0);
}

const RAIZ = path.join(__dirname, '..');
const CARPETAS = [path.join(RAIZ, 'src'), path.join(RAIZ, '..', 'backend', 'src'), path.join(RAIZ, '..', 'backend', 'test')]
  .filter((d) => fs.existsSync(d));
const NO_ASCII = /[^\x00-\x7F]/;

function* archivos(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      if (['node_modules', 'generated', 'dist'].includes(e.name)) continue;
      yield* archivos(p);
    } else if (/\.tsx?$/.test(e.name)) yield p;
  }
}

const fallos = [];
for (const dir of CARPETAS) {
  for (const f of archivos(dir)) {
    const texto = fs.readFileSync(f, 'utf8');
    if (!NO_ASCII.test(texto)) continue;
    const src = ts.createSourceFile(f, texto, ts.ScriptTarget.Latest, true,
      f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const anotar = (n, nombre, que) => {
      const { line } = src.getLineAndCharacterOfPosition(n.getStart());
      fallos.push(`${path.relative(path.join(RAIZ, '..'), f)}:${line + 1}  ${que} «${nombre}»`);
    };
    const ver = (n) => {
      if (ts.isPropertyAccessExpression(n) && NO_ASCII.test(n.name.text)) anotar(n, n.name.text, 'lee el campo');
      else if (ts.isPropertyAssignment(n) && ts.isIdentifier(n.name) && NO_ASCII.test(n.name.text)) anotar(n, n.name.text, 'clave');
      else if (ts.isShorthandPropertyAssignment(n) && NO_ASCII.test(n.name.text)) anotar(n, n.name.text, 'clave (atajo)');
      else if (ts.isPropertySignature(n) && n.name && ts.isIdentifier(n.name) && NO_ASCII.test(n.name.text)) anotar(n, n.name.text, 'campo de tipo');
      else if (ts.isBindingElement(n)) {
        const nom = n.propertyName && ts.isIdentifier(n.propertyName) ? n.propertyName
          : (!n.propertyName && ts.isIdentifier(n.name) ? n.name : null);
        if (nom && NO_ASCII.test(nom.text)) anotar(n, nom.text, 'desestructura');
      }
      ts.forEachChild(n, ver);
    };
    ver(src);
  }
}

if (fallos.length) {
  console.error('\n  NOMBRES DE CAMPO CON TILDE (el otro lado los manda sin ella)\n  ---------------------------------------------------------------');
  for (const x of fallos) console.error('  · ' + x);
  console.error('\n  Un campo con tilde no casa con el del servidor y vale undefined en silencio.');
  console.error('  Escríbelo sin tilde (numero, tecnico, ubicacion). El TEXTO sí lleva tilde.\n');
  process.exit(1);
}
console.log(`Propiedades: ningún nombre de campo con tilde en ${CARPETAS.length} carpetas (frontend y backend).`);
