/* =============================================================================
   VERIFICADOR 15 (frontend) — NINGUNA PANTALLA SE QUEDA HUÉRFANA
   -----------------------------------------------------------------------------
   DE DÓNDE SALE

   Bloque 69. El usuario dijo que los módulos «están hechos mierda» y había que
   reagruparlos por oficio. Reagrupar 44 entradas a mano es exactamente el tipo
   de tarea donde se cae una por el camino, y una entrada que se cae **no
   rompe nada**: la ruta sigue existiendo, la pantalla sigue funcionando, y
   simplemente no hay forma de llegar a ella desde el menú.

   Es el mismo fallo que ya está escrito tres veces en CLAUDE.md con otras
   palabras: *modelo + endpoint ≠ función. Sin pantalla, no existe.* Aquí es
   *ruta + pantalla ≠ función. Sin entrada en el menú, no existe.*

   -----------------------------------------------------------------------------
   COMPRUEBA DOS COSAS

   A) TODA RUTA DE `App.tsx` TIENE ENTRADA EN EL MENÚ.
      Salvo las exentas de abajo, que están exentas por un motivo escrito.

   B) TODA ENTRADA ESTÁ EN LA LISTA `rutas` DE SU SECCIÓN.
      `rutas` es lo que abre la sección cuando estás dentro de ella. Si una
      entrada falta ahí, al navegar a esa pantalla la sección se queda plegada
      y el usuario no ve dónde está. Es un fallo pequeño y muy fácil de
      cometer al mover una entrada de sección: se mueve el `<NavLink>` y se
      olvida la lista.

   -----------------------------------------------------------------------------
   POR QUÉ LEE EL ARCHIVO Y NO EJECUTA EL COMPONENTE

   Los elementos del menú van detrás de `can('permiso')`. Para ejecutarlo
   habría que montar React con una sesión falsa por cada rol, y entonces lo
   que se estaría probando es el juego de permisos, no la agrupación. Lo que
   aquí importa es que la ENTRADA EXISTE en el código, con el permiso que sea.

   PROBADO REINTRODUCIENDO EL FALLO, las dos comprobaciones: se borra una
   entrada del menú y sale (A); se quita una ruta de su lista `rutas` y sale
   (B). En los dos casos código 1, diciendo cuál y dónde.
============================================================================= */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');

/* Rutas que NO llevan entrada de menú, cada una con su motivo. Si mañana se
   añade una exención sin motivo, que se note en la revisión. */
const EXENTAS = {
  '/': 'Redirección al inicio según el permiso de cada uno.',
  '*': 'La pantalla de «no existe».',
  '/login': 'Se llega sin sesión; no hay menú todavía.',
  '/a/:id': 'El QR de un activo. Se llega escaneando, nunca desde el menú.',
  '/g/:id': 'El QR de un gabinete. Igual que el anterior.',
  '/predictive': 'Bloque 80: retirado del menú. En CCTV no hay nada que predecir '
    + '—una cámara da imagen o no la da—. La ruta se queda para poder consultar '
    + 'las órdenes viejas cargadas como predictivas, que no se borran.',
};

const leer = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

/* Los comentarios se vacían antes de buscar. Un ejemplo dentro de un
   comentario no es código: contarlo fue la causa de los falsos positivos del
   verificador 9. */
const sinComentarios = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^\s*\/\/.*$/gm, '');

// --------------------------------------------------------------- 1. las rutas
const app = sinComentarios(leer('App.tsx'));
// Sin repetidos: una misma ruta puede declararse dos veces (envoltorios).
const rutasApp = [...new Set([...app.matchAll(/path="([^"]+)"/g)].map((m) => m[1]))];

// --------------------------------------------------- 2. las secciones del menú
const layout = sinComentarios(leer(path.join('components', 'Layout.tsx')));
/* Se empieza DESPUÉS del `= [`, no en `const secciones`. La declaración de
   tipo que va en medio —`{ titulo: string; items: ... }`— contiene la palabra
   `titulo:` y el troceado de abajo la contaba como una sección más, vacía.
   Una sección fantasma en el informe es un verificador que miente, y a un
   verificador que miente se le deja de hacer caso. */
const decl = layout.indexOf('const secciones');
const desde = layout.indexOf('= [', decl);
const hasta = layout.indexOf('\n  ];', desde);
if (decl === -1 || desde === -1 || hasta === -1) {
  console.log('Menú: no encuentro el array `secciones` en Layout.tsx.');
  process.exit(2);
}
const cuerpo = layout.slice(desde, hasta);

/* Se parte por `titulo:` para quedarse con cada sección entera. El primer
   trozo es la cabecera del array y se descarta. */
const trozos = cuerpo.split(/titulo:\s*/).slice(1);
const secciones = trozos.map((t) => {
  const titulo = (t.match(/^'([^']*)'/) || [, ''])[1];
  const listaRutas = (t.match(/rutas:\s*\[([\s\S]*?)\]/) || [, ''])[1];
  return {
    titulo,
    declaradas: [...listaRutas.matchAll(/'([^']+)'/g)].map((m) => m[1]),
    enlaces: [...t.matchAll(/to="([^"]+)"/g)].map((m) => m[1]),
  };
});

const enElMenu = new Set(secciones.flatMap((s) => s.enlaces));

// ---------------------------------------------------------------- 3. hallazgos
const huerfanas = rutasApp.filter((r) => !EXENTAS[r] && !enElMenu.has(r));

const sinDeclarar = [];
for (const s of secciones) {
  // La sección sin título no se pliega nunca, así que no necesita `rutas`.
  if (!s.titulo) continue;
  for (const e of s.enlaces) {
    if (!s.declaradas.includes(e)) sinDeclarar.push({ seccion: s.titulo, ruta: e });
  }
}

// Y al revés: una ruta declarada que ya no tiene entrada es basura que
// abriría la sección equivocada.
const sobran = [];
for (const s of secciones) {
  for (const d of s.declaradas) {
    if (!s.enlaces.includes(d)) sobran.push({ seccion: s.titulo, ruta: d });
  }
}

let fallo = false;

if (huerfanas.length) {
  fallo = true;
  console.log(`Menú: ${huerfanas.length} pantalla(s) sin entrada en el menú.\n`);
  for (const r of huerfanas) console.log(`   ${r}`);
  console.log(`
Una pantalla sin entrada en el menu NO EXISTE para el usuario: la ruta
funciona, pero no hay forma de llegar. Si es a proposito, anadela a EXENTAS
en este archivo CON SU MOTIVO escrito.`);
}

if (sinDeclarar.length) {
  fallo = true;
  console.log(`\nMenú: ${sinDeclarar.length} entrada(s) fuera de la lista \`rutas\` de su sección.\n`);
  for (const x of sinDeclarar) console.log(`   ${x.seccion.padEnd(28)} le falta  ${x.ruta}`);
  console.log(`
\`rutas\` es lo que ABRE la seccion cuando estas dentro de ella. Sin esto, al
entrar a esa pantalla la seccion se queda plegada y no se ve donde estas.`);
}

if (sobran.length) {
  fallo = true;
  console.log(`\nMenú: ${sobran.length} ruta(s) declaradas en una sección que ya no las tiene.\n`);
  for (const x of sobran) console.log(`   ${x.seccion.padEnd(28)} sobra     ${x.ruta}`);
  console.log(`
Una ruta declarada de mas abre la seccion EQUIVOCADA al navegar a ella.`);
}

if (fallo) process.exit(1);

const total = [...enElMenu].length;
console.log(
  `Menú: ${secciones.length} secciones, ${total} entradas, `
  + `${rutasApp.length - Object.keys(EXENTAS).length} pantallas — ninguna huérfana.`,
);
for (const s of secciones) {
  console.log(`   ${(s.titulo || '(lo mío)').padEnd(28)} ${s.enlaces.length}`);
}
