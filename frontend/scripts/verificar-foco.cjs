#!/usr/bin/env node
/**
* VERIFICADOR DEL FOCO ROBADO
 * ============================
 *
 * DE DÓNDE SALE
 * `Modal.tsx` movía el foco al primer campo dentro de un `useEffect` cuya
 * dependencia era `[onClose]`. Y `onClose` llega SIEMPRE como función en
 * línea desde quien abre la ventana:
 *
 *     <Modal onClose={() => setAbierto(null)} ... />
 *
 * Una función en línea es un objeto nuevo en cada render. Resultado:
 *   escribes una letra -> re-render -> `onClose` "cambia" -> el efecto se
 *   vuelve a ejecutar -> `focus()` -> EL CURSOR SALTA AL PRIMER CAMPO.
 *
 * No se podía escribir más de una letra seguida en NINGÚN formulario del
 * sistema. Estuvo semanas ahí y lo encontró el usuario, no las pruebas: un
 * fallo de teclado no lo caza un `typecheck` ni un test de unidad.
 *
 * POR QUÉ .cjs Y NO .js
 * El `package.json` del frontend tiene `"type": "module"`, así que un `.js`
 * se trata como módulo ES y `require` no existe. La extensión `.cjs` lo
 * marca como script de CommonJS, que es lo que Node necesita para correrlo
 * suelto. (Lo aprendí fallando: el primer intento reventó al ejecutarlo.)
 *
 * QUÉ COMPRUEBA
 * Todo `useEffect` que contenga `.focus()` y NO tenga la lista de
 * dependencias vacía. Mover el foco es una acción de UNA VEZ, al montar.
 * Si depende de algo que cambia al escribir, roba el foco mientras escribes.
 *
 * Si algún día hace falta enfocar de verdad en respuesta a un cambio, se
 * añade `// foco-intencional` en la línea del efecto y este verificador se
 * aparta. Pero que sea una decisión escrita, no un descuido.
 */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', 'src');

function archivos(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) archivos(p, acc);
    else if (/\.(tsx|ts)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

/** Devuelve el trozo entre `useEffect(` y el `)` que lo cierra. */
function cuerpoDelEfecto(src, desde) {
  let prof = 0;
  for (let i = desde; i < src.length; i++) {
    const c = src[i];
    if (c === '(') prof++;
    else if (c === ')') {
      prof--;
      if (prof === 0) return src.slice(desde, i + 1);
    }
  }
  return null;
}

const fallos = [];
let revisados = 0;

for (const archivo of archivos(RAIZ)) {
  const src = fs.readFileSync(archivo, 'utf8');
  const re = /useEffect\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    const cuerpo = cuerpoDelEfecto(src, m.index + m[0].length - 1);
    if (!cuerpo) continue;
    revisados++;

    if (!/\.focus\s*\(\s*\)/.test(cuerpo)) continue;
    if (/foco-intencional/.test(cuerpo)) continue;

    // Lista de dependencias: lo último entre corchetes antes del cierre.
    const deps = cuerpo.match(/,\s*\[([\s\S]*?)\]\s*\)\s*$/);
    const dentro = (deps ? deps[1] : '').trim();
    if (dentro === '') continue; // `[]` está bien: montar y ya.

    const linea = src.slice(0, m.index).split('\n').length;
    fallos.push(
      `${path.relative(path.join(__dirname, '..'), archivo)}:${linea}  ` +
      `useEffect con .focus() y dependencias [${dentro.replace(/\s+/g, ' ')}].`,
    );
  }
}

if (fallos.length) {
  console.error('EFECTOS QUE PUEDEN ROBAR EL FOCO MIENTRAS SE ESCRIBE:\n');
  for (const f of fallos) console.error('  ' + f);
  console.error(
    '\nMover el foco es una accion de UNA VEZ, al montar: la lista de\n' +
    'dependencias debe estar VACIA. Si depende de algo que cambia al\n' +
    'escribir -y una funcion en linea cambia en CADA render-, el cursor\n' +
    'salta al primer campo con cada tecla.\n' +
    'Guarda la funcion en una ref y deja el efecto en [].\n' +
    'Si de verdad hace falta enfocar por un cambio, escribe // foco-intencional.',
  );
  process.exit(1);
}

console.log(`Foco verificado: ${revisados} efectos revisados, ninguno roba el foco al escribir.`);
