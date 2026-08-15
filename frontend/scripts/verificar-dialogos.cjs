/* =============================================================================
   VERIFICADOR 15 — NADA DE VENTANAS DEL NAVEGADOR
   -----------------------------------------------------------------------------
   POR QUÉ EXISTE
   El bloque 35 sustituyó 117 llamadas a `window.confirm`, `window.alert` y
   `window.prompt` por los diálogos de la aplicación. Sin esto, la número 118
   aparece la semana que viene: escribir `confirm(...)` es más corto que pedir
   el hook, y nada avisa de que se acaba de meter una ventana gris con la
   dirección de Railway en el título.

   QUÉ TIENE DE MALO EL NATIVO, EN CORTO
     · Lleva «...up.railway.app dice:» encima del mensaje.
     · Bloquea el hilo: la pantalla se congela con la petición a medias.
     · No distingue un aviso de un borrado sin vuelta: se ven igual.
     · Chrome ofrece «impedir que esta página cree más diálogos». Si alguien
       la marca, `confirm()` devuelve `false` SIN PREGUNTAR y el botón deja de
       funcionar sin ningún error. Ese es el que de verdad asusta.

   -----------------------------------------------------------------------------
   LO QUE APRENDIÓ EL VERIFICADOR DE ROLES, APLICADO AQUÍ DESDE EL PRIMER DÍA
   Se quitan los comentarios ANTES de buscar. Si no, este mismo archivo y la
   cabecera de `Dialogos.tsx` —que explican qué se está reemplazando y tienen
   que nombrarlo para explicarlo— saldrían denunciados. Un verificador que
   castiga documentar el porqué acaba enseñando a no documentarlo.
============================================================================= */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', 'src');

/* `console.log` no se toca aquí: hay un `eslint-disable no-console` a
   propósito en el ErrorBoundary, y un registro en consola no le aparece a
   nadie en planta. Esto va sólo de lo que INTERRUMPE al usuario. */
const PROHIBIDOS = [
  { nombre: 'confirm', reemplazo: 'await confirmar({ titulo, mensaje, peligro })' },
  { nombre: 'alert', reemplazo: 'await avisar({ titulo, mensaje })' },
  { nombre: 'prompt', reemplazo: 'await pedirTexto({ titulo, valorInicial })' },
];

/* El propio proveedor puede nombrarlos en código si algún día hace falta
   (por ejemplo, para un respaldo si el proveedor no está montado). */
const EXENTOS = new Set(['components/Dialogos.tsx']);

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
  const r = rel(f).replace(/^src\//, '');
  if (EXENTOS.has(r)) continue;
  revisados++;

  const lineas = sinComentarios(fs.readFileSync(f, 'utf8')).split('\n');
  lineas.forEach((linea, i) => {
    for (const { nombre, reemplazo } of PROHIBIDOS) {
      /* El `(?<![\w.$])` evita los falsos positivos que importan:
         `confirmar(`, `alertaDe(`, `this.alert(`, `promptRef.` y —el que de
         verdad pasó— la función local `avisar()` de `cola-offline.ts`, que no
         tiene nada que ver con los diálogos y sólo comparte el nombre. */
      const re = new RegExp(`(?<![\\w.$])(?:window\\.)?${nombre}\\s*\\(`);
      if (re.test(linea)) {
        errores++;
        console.error(`  [ERROR] ${rel(f)}:${i + 1}`);
        console.error(`          ${linea.trim().slice(0, 92)}`);
        console.error(`          Usa  ${reemplazo}  de useDialogos().`);
      }
    }
  });
}

console.log(`\nDiálogos: ${revisados} archivos revisados.`);

if (errores) {
  console.error(
    `\n${errores} ventana(s) del navegador. Salen con la dirección del servidor\n` +
    'en el título, bloquean la pantalla, y el navegador puede apagarlas sin avisar.\n' +
    'El proveedor ya está montado en main.tsx: sólo hace falta el hook.',
  );
  process.exit(1);
}
console.log('Ninguna ventana del navegador: todo pasa por los diálogos de la aplicación.');
