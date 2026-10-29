#!/usr/bin/env node
/* =============================================================================
   VERIFICADOR · LA SESIÓN SE CIERRA POR INACTIVIDAD, Y SÓLO POR INACTIVIDAD
   -----------------------------------------------------------------------------
   DE DÓNDE SALE
   El cierre por inactividad echó a gente que estaba trabajando: en mitad de
   una exposición (bloque 64, faltaba `mousemove`), con dos pestañas (bloque
   170), y leyendo listas largas (el `scroll` de una caja no burbujea). El
   bloque 182 lo quitó; el 183 lo devolvió «bien hecho», como barrera de
   seguridad, con una cuenta de PANTALLA FIJA para el púlpito.

   QUÉ COMPRUEBA — cada punto es un fallo que ya pasó
   1. El reloj escucha en `document` y en CAPTURA (nada lo esconde con
      stopPropagation), con eventos de PUNTERO, teclado, rueda y toque; y
      sólo los de una persona: ni `isTrusted` falso, ni scroll, ni foco.
   2. Con el aviso en pantalla, la actividad SIGUE contando (bloque 64: el
      `if (avisando.current) return` echaba a quien seguía trabajando).
   3. No se cierra con una escritura en curso (`escriturasEnCurso`).
   4. AuthContext monta el reloj para todos MENOS la pantalla fija, y la
      única exención es el permiso `sesion.pantalla_fija`.
   5. Cerrar en una pestaña cierra en todas (evento `storage`).
   6. Toda salida forzada deja su motivo y la pantalla de acceso lo dice.
   7. Las contraseñas de equipo se siguen ocultando solas (`useAutoOcultar`).
   8. Bloque 170: una sola renovación del token a la vez.
============================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const sinComentarios = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, ' ');
const leer = (rel) => {
  const f = path.join(SRC, rel);
  return fs.existsSync(f) ? sinComentarios(fs.readFileSync(f, 'utf8')) : null;
};

const fallos = [];
const exige = (cond, msg) => { if (!cond) fallos.push(msg); };

/* ---- 1, 2 y 3. El reloj ------------------------------------------------- */
const hook = leer('auth/useInactivity.ts');
if (!hook) {
  fallos.push('Falta src/auth/useInactivity.ts.');
} else {
  exige(/export function useInactivity\s*\(/.test(hook), 'useInactivity.ts no exporta useInactivity.');
  exige(/document\.addEventListener\([^)]*capture:\s*true|opciones\s*=\s*\{\s*capture:\s*true/.test(hook)
    && /document\.addEventListener/.test(hook),
    'El reloj debe escuchar en `document` con `capture: true`: en burbuja, el scroll de una tabla y '
    + 'cualquier stopPropagation esconden la actividad y te echa leyendo.');
  const senales = (hook.match(/SENALES\s*=\s*\[([\s\S]*?)\]/) || [])[1] || '';
  for (const e of ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'touchmove', 'wheel']) {
    exige(senales.includes(`'${e}'`), `Falta la señal '${e}' en SENALES: esa actividad no contaría.`);
  }
  /* Lo que la PROPIA aplicación provoca no puede contar: el foco automático
     del botón «Sigo aquí» borraba el aviso al salir (bloque 183), y la app
     desplaza cosas sola. Una barrera que la pantalla mantiene abierta no es
     una barrera. */
  for (const e of ['scroll', 'focusin', 'focus', 'visibilitychange']) {
    exige(!senales.includes(`'${e}'`), `'${e}' no puede contar como actividad: lo provoca la propia aplicación y la sesión no se cerraría nunca.`);
  }
  const registrar = (hook.match(/const registrar\s*=\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\n\s{4}\};/) || [])[1] || '';
  exige(/if\s*\(\s*!e\.isTrusted\s*\)\s*return/.test(registrar),
    'El registrador no descarta los eventos que dispara el código (isTrusted): la app se mantendría abierta sola.');
  exige(registrar && !/if\s*\(\s*avisando\.current\s*\)\s*return/.test(registrar),
    'El registrador ignora la actividad con el aviso en pantalla (bloque 64): echa a quien sigue trabajando.');
  exige(/decidir\([^)]*escriturasEnCurso\(\)/.test(hook),
    'El reloj no consulta escriturasEnCurso(): podría cerrar a mitad de un guardado.');
}

/* ---- 4 y 5. Quién lleva reloj, y todas las pestañas a la vez ------------- */
const ctx = leer('auth/AuthContext.tsx');
if (!ctx) {
  fallos.push('Falta src/auth/AuthContext.tsx.');
} else {
  exige(/useInactivity\(\s*!!user\s*&&\s*!pantallaFija\s*,/.test(ctx),
    'AuthContext debe montar useInactivity(!!user && !pantallaFija, …): sin reloj no hay barrera, '
    + 'y con otra condición se abre una exención que nadie decidió.');
  exige(/PERMISO_PANTALLA_FIJA\s*=\s*'sesion\.pantalla_fija'/.test(ctx),
    'La exención del reloj tiene que ser el permiso sesion.pantalla_fija (el servidor lo limita a roles de sólo lectura).');
  exige(/addEventListener\(\s*'storage'/.test(ctx) && /sgit_token/.test(ctx),
    'AuthContext no escucha el cierre en otras pestañas (evento storage sobre sgit_token).');
}

/* La exención no puede colarse por otro lado: ningún otro archivo llama al reloj. */
function archivos(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...archivos(p));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
for (const f of archivos(SRC)) {
  const rel = path.relative(SRC, f).replace(/\\/g, '/');
  if (rel === 'auth/AuthContext.tsx' || rel === 'auth/useInactivity.ts') continue;
  const s = sinComentarios(fs.readFileSync(f, 'utf8'));
  if (/\buseInactivity\s*\(/.test(s)) fallos.push(`${rel}: llama a useInactivity; el reloj vive sólo en AuthContext.`);
}

/* ---- 6. La salida dice por qué ------------------------------------------ */
const cliente = leer('api/client.ts');
exige(cliente && /function hardLogout\(\)\s*\{\s*registrarSalida\(/.test(cliente),
  'hardLogout no registra el motivo: la gente vuelve a creer que fue la inactividad.');
const login = leer('pages/Login.tsx');
exige(login && /textoDeSalida\(/.test(login), 'La pantalla de acceso no dice por qué se cerró la sesión.');

/* ---- 7. Contraseñas que se ocultan solas -------------------------------- */
exige(hook && /export function useAutoOcultar/.test(hook),
  'Falta useAutoOcultar: las contraseñas de equipo quedarían en pantalla.');
exige(archivos(SRC).some((f) => !f.endsWith('useInactivity.ts')
  && /useAutoOcultar\s*\(/.test(sinComentarios(fs.readFileSync(f, 'utf8')))),
  'Nadie usa useAutoOcultar: las contraseñas de equipo ya no se ocultan solas.');

/* ---- 8. Bloque 170: una sola renovación a la vez ------------------------ */
if (cliente) {
  exige(/let enVuelo/.test(cliente) && /function renovarUnaVez/.test(cliente),
    'api/client.ts ya no tiene la renovación ÚNICA (renovarUnaVez/enVuelo) del bloque 170.');
  const llamadas = (cliente.match(/\/auth\/refresh`/g) || []).length;
  exige(llamadas === 1, `api/client.ts llama a /auth/refresh en ${llamadas} sitios; debe ser UNO.`);
} else {
  fallos.push('No se encuentra src/api/client.ts.');
}

if (fallos.length) {
  console.error('');
  console.error('  LA SESIÓN NO SE CIERRA COMO SE DECIDIÓ (bloque 183)');
  console.error('  ------------------------------------------------------------');
  for (const f of fallos) console.error('  · ' + f);
  console.error('');
  process.exit(1);
}

console.log('Sesión verificada: se cierra sólo por inactividad real (captura, sólo gestos de una persona), '
  + 'nunca a mitad de un guardado, la pantalla fija es la única exención y la salida dice por qué.');
process.exit(0);
