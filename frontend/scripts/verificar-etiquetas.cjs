/* eslint-disable no-console */
/**
 * VERIFICADOR 20 — CADA CAMPO CON SU ETIQUETA DE VERDAD.
 *
 * =============================================================================
 *  DE QUÉ FALLO REAL NACE
 * =============================================================================
 *  Una auditoría encontró 171 campos con este patrón:
 *
 *      <label>Altura estimada (m)</label>
 *      <input type="number" ... />
 *
 *  Eso PARECE una etiqueta y no lo es. Un `<label>` sin `htmlFor` y que no
 *  envuelve al campo es texto decorativo: el navegador no los asocia.
 *
 *  Las dos consecuencias son prácticas, no teóricas:
 *
 *    1. TOCAR EL RÓTULO NO ENFOCA EL CAMPO. En un celular, con guantes, la
 *       diferencia entre una zona pulsable de 15 px y una de 60 es la
 *       diferencia entre acertar y no acertar.
 *    2. Un lector de pantalla anuncia «campo de texto» sin decir cuál.
 *
 *  El arreglo fue envolver el campo dentro de su etiqueta. Visualmente no
 *  cambia nada; funcionalmente cambia todo.
 */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', 'src');
const CAMPOS = ['input', 'select', 'textarea'];
/* Estos no necesitan etiqueta propia: o son invisibles, o su etiqueta es la
   fila entera (una casilla dentro de un `<label>Activo <input/></label>`). */
const EXENTOS = /type="(hidden|checkbox|radio|file|submit|button)"/;

function tsx(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...tsx(p));
    else if (e.name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/** Fin de la etiqueta de apertura, respetando las llaves de JSX. */
function finDeEtiqueta(txt, desde) {
  let llaves = 0;
  for (let i = desde; i < txt.length; i++) {
    const c = txt[i];
    if (c === '{') llaves++;
    else if (c === '}') llaves--;
    else if (c === '>' && llaves === 0) return i;
  }
  return txt.length;
}

const fallos = [];
let revisados = 0;

for (const archivo of tsx(RAIZ)) {
  /* Los comentarios se quitan ANTES de buscar. Sin esto, un comentario que
     explica «un <select> nativo abre una lista minúscula» se contaba como un
     campo sin etiqueta — un verificador que salta con la documentación de al
     lado enseña a ignorarlo. Lo encontré en mi propia pantalla. */
  const txt = fs.readFileSync(archivo, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));
  const rel = path.relative(path.join(__dirname, '..'), archivo).replace(/\\/g, '/');

  for (const campo of CAMPOS) {
    const re = new RegExp(`<${campo}\\b`, 'g');
    let m;
    while ((m = re.exec(txt)) !== null) {
      const fin = finDeEtiqueta(txt, m.index);
      const tag = txt.slice(m.index, fin + 1);
      if (EXENTOS.test(tag)) continue;
      revisados++;

      if (tag.includes('aria-label') || tag.includes('aria-labelledby') || tag.includes('id=')) continue;

      /* ¿Hay un `<label>` abierto y todavía sin cerrar justo antes? Entonces
         el campo va dentro y la asociación es automática. */
      const antes = txt.slice(0, m.index);
      const abre = antes.lastIndexOf('<label');
      const cierra = antes.lastIndexOf('</label>');
      if (abre > cierra) continue;

      const linea = antes.split('\n').length;
      fallos.push(
        `${rel}:${linea}  <${campo}> sin etiqueta asociada. Envuélvelo en su `
        + '`<label>`, o dale `aria-label`.',
      );
    }
  }
}

console.log(`\nEtiquetas: ${revisados} campos de formulario revisados.`);

if (fallos.length) {
  console.error(`\n${fallos.length} campo(s) sin etiqueta asociada:\n`);
  for (const f of fallos.slice(0, 40)) console.error(`   ${f}`);
  if (fallos.length > 40) console.error(`   … y ${fallos.length - 40} más.`);
  console.error(
    '\nUn <label> suelto encima del campo NO es una etiqueta: es texto.'
    + '\nTocarlo no enfoca el campo, y con guantes en un celular eso se nota.',
  );
  process.exit(1);
}

console.log('Todos los campos se pueden enfocar tocando su rótulo.');
