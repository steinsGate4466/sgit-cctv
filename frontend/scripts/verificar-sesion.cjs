#!/usr/bin/env node
/* =============================================================================
   VERIFICADOR · LA SESIÓN NO PUEDE ECHAR A QUIEN ESTÁ TRABAJANDO
   -----------------------------------------------------------------------------
   DE DÓNDE SALE, Y ES EL PEOR DE TODOS

   El usuario estaba EXPONIENDO EL SOFTWARE delante de un ingeniero. Movía el
   ratón, señalaba en la pantalla, explicaba, hablaba. Media hora sin pulsar
   un botón ni escribir una letra.

   El sistema lo echó en mitad de la exposición.

   Dos fallos, los dos en `src/auth/useInactivity.ts`:

   1. `mousemove` NO estaba en la lista de señales de actividad. «Estar
      delante del ordenador trabajando» no contaba salvo que hicieras clic,
      escribieras o hicieras scroll. Eso no es medir inactividad: es medir
      tecleo.

   2. Había un `if (avisando.current) return;` que hacía que, una vez salía
      el aviso de cierre, el registrador IGNORARA cualquier actividad. Podías
      estar escribiendo y pulsando botones: te echaba igual. Sólo te salvaba
      pulsar el botón del aviso, que puede quedar fuera de la vista en un
      púlpito o en una demostración.

   ESTE VERIFICADOR NO ES UN CAPRICHO

   Es de los que hay que poner precisamente porque el arreglo es de una línea
   y se deshace sin querer. Alguien verá que `mousemove` dispara muy seguido,
   pensará «esto hay que optimizarlo», lo quitará, y el sistema volverá a
   echar a alguien en mitad de una reunión seis meses después.
============================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const ARCHIVO = path.join(__dirname, '..', 'src', 'auth', 'useInactivity.ts');

if (!fs.existsSync(ARCHIVO)) {
  console.log('verificar:sesion — no existe useInactivity.ts, nada que revisar.');
  process.exit(0);
}

const crudo = fs.readFileSync(ARCHIVO, 'utf8');
// Sin comentarios: este archivo documenta el bug y no debe delatarse.
const s = crudo
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, ' ');

const fallos = [];

/* ---- 1. Señales que NO se pueden quitar --------------------------------- */
const bloque = s.match(/const SENALES\s*=\s*\[([\s\S]*?)\]/);
if (!bloque) {
  fallos.push('No se encuentra la lista SENALES. ¿Se ha renombrado? Revisa este verificador.');
} else {
  const declaradas = [...bloque[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const OBLIGATORIAS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
  for (const ev of OBLIGATORIAS) {
    if (!declaradas.includes(ev)) {
      fallos.push(
        `Falta «${ev}» en SENALES. Sin él, esa forma de usar el software no `
        + 'cuenta como actividad y el sistema puede echar a alguien que está delante.',
      );
    }
  }
}

/* ---- 2. El registrador no puede ignorar actividad ----------------------- */
const reg = s.match(/const registrar\s*=\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s*\};/);
if (!reg) {
  fallos.push('No se encuentra la función `registrar`. Revisa este verificador.');
} else if (/if\s*\(\s*avisando\.current\s*\)\s*return/.test(reg[1])) {
  fallos.push(
    'El registrador vuelve a IGNORAR la actividad mientras el aviso está en '
    + 'pantalla. Eso echa a gente que sigue trabajando: si hay actividad, no hay '
    + 'inactividad. El aviso debe retirarse solo, no exigir que se pulse un botón.',
  );
}

/* ---- 3. Bloque 170: la actividad se comparte entre pestañas ------------- */
if (!/leerCompartida\(\)/.test(s) || !/ultimaActividad\(/.test(s)) {
  fallos.push(
    'El reloj de inactividad ya no lee la actividad de las OTRAS pestañas. Con dos '
    + 'pestañas abiertas, la que no se usa cierra la sesión de la que sí (bloque 170).',
  );
}

/* ---- 4. Bloque 170: una sola renovación a la vez ------------------------ */
const CLIENTE = path.join(__dirname, '..', 'src', 'api', 'client.ts');
if (fs.existsSync(CLIENTE)) {
  const c = fs.readFileSync(CLIENTE, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, ' ');
  const llamadas = (c.match(/\/auth\/refresh`/g) || []).length;
  if (!/let enVuelo/.test(c) || !/function renovarUnaVez/.test(c)) {
    fallos.push(
      'api/client.ts ya no tiene la renovación ÚNICA (renovarUnaVez/enVuelo). Varias '
      + 'peticiones que caducan a la vez renuevan con el mismo token, el servidor lo toma '
      + 'por robo y cierra la sesión (bloque 170).',
    );
  }
  if (llamadas !== 1) {
    fallos.push(
      `api/client.ts llama a /auth/refresh en ${llamadas} sitios; debe ser UNO, dentro de `
      + 'renovarAhora. Una segunda llamada suelta vuelve a abrir la carrera del bloque 170.',
    );
  }
}

if (fallos.length) {
  console.error('');
  console.error('  LA SESIÓN PUEDE ECHAR A ALGUIEN QUE ESTÁ TRABAJANDO');
  console.error('  ------------------------------------------------------------');
  console.error('  Ya pasó una vez, en mitad de una exposición delante de un');
  console.error('  ingeniero. No puede volver a pasar.');
  console.error('');
  for (const f of fallos) console.error('  · ' + f);
  console.error('');
  console.error('  Archivos: src/auth/useInactivity.ts · src/api/client.ts');
  console.error('');
  process.exit(1);
}

console.log('Sesión verificada: el ratón cuenta, trabajar retira el aviso, las pestañas comparten actividad y se renueva una sola vez.');
process.exit(0);
