/* eslint-disable no-console */
/**
 * VERIFICADOR 20 (frontend) — SIN RED NO ES CONTRASEÑA MAL.
 *
 * =============================================================================
 *  DE QUÉ FALLO REAL NACE
 * =============================================================================
 *  Bloque 103. Con el equipo sin conexión, el login decía:
 *
 *      «Credenciales incorrectas. Te quedan 4 intento(s).»
 *
 *  ...con la contraseña bien escrita. Cuando axios no recibe respuesta,
 *  `err.response` es `undefined`; el código leía un mensaje vacío, no casaba
 *  con «bloqueado», y caía en la rama de credenciales.
 *
 *  Dos daños, y el segundo es el que de verdad duele:
 *    1. Miente sobre la causa: manda a revisar la contraseña cuando lo que
 *       falla es la red.
 *    2. GASTA un intento que el servidor nunca recibió. El contador baja solo
 *       y la persona cree que va a quedarse fuera.
 *
 *  Es la misma familia que el aviso falso del bloque 88 —que se arregló en el
 *  andamio de Playwright y no en la pantalla que lo originaba— y la misma
 *  regla de siempre: *un aviso que miente enseña a desconfiar de todos los
 *  avisos*.
 *
 * =============================================================================
 *  QUÉ COMPRUEBA
 * =============================================================================
 *  Que el login mire «¿hubo respuesta?» ANTES de tocar el contador, y que sólo
 *  el 401 gaste intento. Lo comprueba por ORDEN en el archivo, no por nombres:
 *  el indicador se puede renombrar, el orden no se puede falsear.
 */
const fs = require('fs');
const path = require('path');

const LOGIN = path.join(__dirname, '..', 'src', 'pages', 'Login.tsx');
const texto = fs.readFileSync(LOGIN, 'utf8');
const fallos = [];

const sinRespuesta = texto.search(/if\s*\(\s*!\s*err\?\.\s*response\s*\)/);
const gastaIntento = texto.indexOf('setTries(left)');
const rama401 = texto.search(/err\.response\.status\s*===\s*401/);

if (sinRespuesta === -1) {
  fallos.push(
    'src/pages/Login.tsx: no comprueba `if (!err?.response)`. Sin esa guarda, un '
    + 'fallo de red se anuncia como «credenciales incorrectas» y descuenta un intento '
    + 'que el servidor nunca recibió.',
  );
}
if (gastaIntento === -1) {
  fallos.push('src/pages/Login.tsx: no se encuentra setTries(left); revisa este verificador antes de darlo por bueno.');
}
if (sinRespuesta !== -1 && gastaIntento !== -1 && sinRespuesta > gastaIntento) {
  fallos.push(
    'src/pages/Login.tsx: la comprobación de «no hubo respuesta» va DESPUÉS de '
    + 'descontar el intento. Tiene que ir antes, o el intento se gasta igual.',
  );
}
if (rama401 === -1) {
  fallos.push(
    'src/pages/Login.tsx: el intento ya no se descuenta sólo en el 401. Un 429 del '
    + 'freno de fuerza bruta o un 500 de un despliegue a medias no dicen nada sobre '
    + 'la contraseña y no pueden gastar intentos.',
  );
}

if (fallos.length) {
  console.error('\n[verificar:login-red] FALLA\n');
  for (const f of fallos) console.error(`   · ${f}\n`);
  process.exit(1);
}
console.log('[verificar:login-red] OK — sin respuesta no cuenta como contraseña mal.');
