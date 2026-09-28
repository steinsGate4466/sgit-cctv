/* =============================================================================
   VERIFICADOR 15 (frontend) — NINGUNA PANTALLA SE QUEDA HUÉRFANA
   -----------------------------------------------------------------------------
   DE DÓNDE SALE

   Bloque 69: reagrupar 44 entradas a mano es la tarea donde se cae una por el
   camino, y una entrada que se cae NO ROMPE NADA: la ruta sigue, la pantalla
   funciona, y simplemente no hay forma de llegar. *Ruta + pantalla ≠ función.
   Sin forma de llegar, no existe.*

   BLOQUE 147: el menú pasa a ser UNA ENTRADA POR MÓDULO y las pantallas salen
   como pestañas. La fuente única es `src/modulos.ts`; este verificador la lee.

   -----------------------------------------------------------------------------
   COMPRUEBA

   A) TODA RUTA DE `App.tsx` TIENE SITIO: está en un módulo, o es pestaña de
      una pantalla que está en un módulo (`pestanas.ts`), o está EXENTA con su
      motivo escrito.
   B) TODA PANTALLA DE UN MÓDULO EXISTE en `App.tsx` (una pestaña que lleva a
      «no existe» es peor que no tenerla).
   C) NINGUNA RUTA ESTÁ EN DOS MÓDULOS (el menú encendería dos a la vez).
   D) EL MENÚ Y LAS PESTAÑAS LEEN DE `modulos.ts`. Si alguien vuelve a escribir
      enlaces a mano en `Layout.tsx`, la lista y el menú dejan de coincidir.
   E) (bloque 148) TODO INICIO DE `inicioPara` LLEVA A UNA PANTALLA DE UN MÓDULO.

   POR QUÉ LEE EL ARCHIVO Y NO EJECUTA EL COMPONENTE: los permisos se prueban
   aparte; aquí importa que el SITIO existe, con el permiso que sea.

   PROBADO REINTRODUCIENDO EL FALLO, los cinco: se quita una pantalla de
   `modulos.ts` (A), se añade una ruta inventada (B), se repite una ruta en
   otro módulo (C), se escribe un `<NavLink to="/x">` en el menú (D), y se
   hace que `inicioPara` devuelva una ruta inventada (E).
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
  '/t/:id': 'El QR de un tablero eléctrico (bloque 146). Se llega escaneando la '
    + 'etiqueta pegada en su puerta, nunca desde el menú. Contesta la pregunta '
    + 'que se hace con la mano en la llave: qué se apaga si bajo ésta.',
  '/predictive': 'Bloque 80: retirado del menú. En CCTV no hay nada que predecir '
    + '—una cámara da imagen o no la da—. La ruta se queda para poder consultar '
    + 'las órdenes viejas cargadas como predictivas, que no se borran.',

  /* --------------------------------------------------- BLOQUE 130 (21/09/2026)
     Las tres salen del menú por decisión del usuario, en su paseo por el
     software. Ninguna se borra: los enlaces que llevan a ellas siguen
     funcionando, y por eso van aquí y no a la papelera. */
  '/trains': 'Bloque 130: «Estado por Tren» repetía las cifras de «Resumen de '
    + 'planta» y de «Por tren». Palabras del usuario: «¿cuál es el objetivo de '
    + 'Estado por Tren? Ni siquiera yo sé cómo sustentarlo». La ruta sigue viva '
    + 'porque varios enlaces llevan a ella.',
  '/paradas': 'Bloque 130: las paradas las decide Producción y cambian solas; al '
    + 'técnico se lo dice su planner, no el software. Un módulo que hay que '
    + 'mantener a mano con un dato que caduca en horas invita a confiar en una '
    + 'hora que ya cambió. El dato de parada se mueve DENTRO de la orden '
    + '(bloque 138, pendiente). Hasta entonces la ruta se consulta.',
  '/campanas': 'Bloque 130: «el mapeo debe ser sólo una OM» (usuario). Era un '
    + 'segundo sistema de reparto de trabajo en paralelo al de las órdenes, y '
    + 'con dos sistemas nadie sabe cuál manda. La ruta queda para ver las '
    + 'campañas ya cargadas.',
};

const leer = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

/* Los comentarios se vacían antes de buscar: un ejemplo dentro de un
   comentario no es código (falsos positivos del verificador 9). */
const sinComentarios = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^\s*\/\/.*$/gm, '');

// --------------------------------------------------------------- 1. las rutas
const app = sinComentarios(leer('App.tsx'));
const rutasApp = [...new Set([...app.matchAll(/path="([^"]+)"/g)].map((m) => m[1]))];

// -------------------------------------------------------------- 2. los módulos
const mod = sinComentarios(leer('modulos.ts'));
const ini = mod.indexOf('export const MODULOS');
const fin = mod.indexOf('\n];', ini);
if (ini === -1 || fin === -1) {
  console.log('Menú: no encuentro `export const MODULOS` en src/modulos.ts.');
  process.exit(2);
}
const trozos = mod.slice(ini, fin).split(/titulo:\s*/).slice(1);
const modulos = trozos.map((t) => ({
  titulo: (t.match(/^'([^']*)'/) || [, '?'])[1],
  rutas: [...t.matchAll(/ruta:\s*'([^']+)'/g)].map((m) => m[1]),
}));
const enModulo = new Map();   // ruta -> módulo
const repetidas = [];
for (const m of modulos) {
  for (const r of m.rutas) {
    if (enModulo.has(r)) repetidas.push({ ruta: r, a: enModulo.get(r), b: m.titulo });
    else enModulo.set(r, m.titulo);
  }
}

// ------------------------------------------- 3. pestañas de una pantalla (118)
const pestanas = sinComentarios(leer('pestanas.ts'));
const hijas = new Map();   // ruta hija -> ruta padre
{
  const cuerpo = pestanas.slice(pestanas.indexOf('PESTANAS'));
  for (const b of cuerpo.matchAll(/'(\/[\w-]+)':\s*\[([\s\S]*?)\]/g)) {
    const padre = b[1];
    for (const r of b[2].matchAll(/ruta:\s*'(\/[\w-]+)'/g)) {
      if (r[1] !== padre) hijas.set(r[1], padre);
    }
  }
}

// ---------------------------------------------------------------- 4. hallazgos
const errores = [];

const huerfanasPorPadre = [...hijas].filter(([, padre]) => !enModulo.has(padre));
for (const [hija, padre] of huerfanasPorPadre) {
  errores.push(`${hija} es pestaña de ${padre}, y ${padre} no está en ningún módulo.`);
}

const huerfanas = rutasApp.filter((r) => !EXENTAS[r] && !enModulo.has(r) && !hijas.has(r));
for (const r of huerfanas) {
  errores.push(`${r} no está en ningún módulo: la ruta funciona pero no hay forma de llegar. `
    + 'Si es a propósito, añádela a EXENTAS con su motivo.');
}

const setApp = new Set(rutasApp);
for (const [r, m] of enModulo) {
  if (!setApp.has(r)) errores.push(`«${m}» tiene la pantalla ${r}, que no existe en App.tsx.`);
}

for (const x of repetidas) {
  errores.push(`${x.ruta} está en «${x.a}» y en «${x.b}»: el menú encendería los dos.`);
}

const layout = sinComentarios(leer(path.join('components', 'Layout.tsx')));
if (!/MODULOS/.test(layout) || !/<EnlaceDeModulo\b/.test(layout)) {
  errores.push('Layout.tsx ya no pinta el menú desde `MODULOS`.');
}
const aMano = [...layout.matchAll(/<NavLink[^>]*\bto="(\/[^"]+)"/g)].map((m) => m[1]);
for (const r of aMano) {
  errores.push(`Layout.tsx tiene un enlace escrito a mano a ${r}. Va en src/modulos.ts.`);
}
const barra = sinComentarios(leer(path.join('components', 'Pestanas.tsx')));
if (!/pantallasVisibles/.test(barra)) {
  errores.push('Pestanas.tsx ya no pinta las pantallas del módulo.');
}

/* E) BLOQUE 148 · CADA INICIO LLEVA A UNA PANTALLA QUE EXISTE. `inicioPara`
   decide dónde entra cada uno; si devuelve una ruta que no está en ningún
   módulo, esa persona entra a «no existe» nada más iniciar sesión. */
{
  const i = mod.indexOf('export function inicioPara');
  if (i === -1) {
    errores.push('src/modulos.ts ya no tiene `inicioPara`: todos volverían a entrar al mismo sitio.');
  } else {
    const cuerpoInicio = mod.slice(i, mod.indexOf('\n}\n', i));
    for (const m of cuerpoInicio.matchAll(/'(\/[^'?]*)(\?[^']*)?'/g)) {
      if (!enModulo.has(m[1])) errores.push(`inicioPara manda a ${m[1]}, que no está en ningún módulo.`);
    }
  }
}

if (errores.length) {
  console.log(`Menú: ${errores.length} problema(s).\n`);
  for (const e of errores) console.log(`   · ${e}`);
  process.exit(1);
}

const total = rutasApp.length - Object.keys(EXENTAS).filter((r) => setApp.has(r)).length;
console.log(`Menú: ${modulos.length} módulos, ${enModulo.size} pantallas + ${hijas.size} pestañas — `
  + `${total} rutas con sitio, ninguna huérfana.`);
for (const m of modulos) console.log(`   ${m.titulo.padEnd(20)} ${m.rutas.length}`);
