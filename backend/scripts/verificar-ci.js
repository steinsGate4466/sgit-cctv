#!/usr/bin/env node
/* =============================================================================
   VERIFICADOR 15 (backend) · LA CI CORRE **TODOS** LOS VERIFICADORES
   -----------------------------------------------------------------------------
   DE DÓNDE SALE. El usuario preguntó si la CI comprobaba de verdad todo lo que
   se corre en local. Se midió, y no:

       verificar:sql-roles    NUNCA se ejecutaba en la CI
       verificar:cable        NUNCA
       verificar:estructura   NUNCA  (recién escrito en el bloque 95)
       verificar:dto          NUNCA
       verificar-relaciones   NUNCA
       verificar-escrituras   NUNCA
       verificar-ambito       NUNCA  ← y éste es el de OWASP A01

   SIETE de dieciséis. El `ci.yml` llamaba a los verificadores UNO A UNO, con
   una lista escrita a mano que se fue quedando atrás: cada verificador nuevo
   nacía sin correr en la CI y nadie se enteraba, porque no falla nada — la CI
   sale verde igual.

   > **Un control que no se ejecuta no es un control.** Es la misma regla que
   > ya está escrita en este proyecto para el `|| true` del `npm audit`
   > (bloque 85) y para los verificadores que no se pueden poner en rojo
   > (bloque 9). Y una lista que hay que acordarse de ampliar es un agujero
   > con fecha.

   -----------------------------------------------------------------------------
   EL ARREGLO NO ES ACORDARSE MEJOR: es que la CI llame al AGREGADO
   (`npm run verificar`), que es la única lista. Si mañana se añade el número
   diecisiete, entra solo.

   Este verificador comprueba las tres cosas que pueden volver a romperlo:

     1. Que el `ci.yml` llame al agregado en los DOS proyectos.
     2. Que NO haya vuelto a aparecer una lista suelta de `verificar:x` — es
        exactamente cómo se desincronizó.
     3. Que TODO script `verificar-*.js` del disco esté dentro del agregado de
        su proyecto. Un verificador que existe y no está en la lista es un
        verificador apagado.

   Probado sacando `verificar:ambito` del agregado: sale con código 1 y lo
   nombra.
============================================================================= */

const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..');
const rojo = (t) => `\x1b[31m${t}\x1b[0m`;
const verde = (t) => `\x1b[32m${t}\x1b[0m`;

const hallazgos = [];
const apunta = (t) => hallazgos.push(t);

/* ── El flujo de la CI ────────────────────────────────────────────────────── */
const rutaCi = path.join(RAIZ, '.github', 'workflows', 'ci.yml');
if (!fs.existsSync(rutaCi)) {
  /* Si el archivo se movió se AVISA en vez de dar luz verde: un verificador
     que no encuentra lo que vigila es un verificador apagado (bloque 74). */
  console.error(rojo('\n  No se encuentra .github/workflows/ci.yml. Actualiza este verificador.\n'));
  process.exit(1);
}
const ci = fs.readFileSync(rutaCi, 'utf8');

/* 1 · el agregado se llama en los dos proyectos ---------------------------- */
for (const [proyecto, cuantos] of [['backend', 16], ['frontend', 18]]) {
  const re = new RegExp(
    `working-directory:\\s*${proyecto}\\s*\\n\\s*run:\\s*npm run verificar\\s*$`, 'm',
  );
  if (!re.test(ci)) {
    apunta(`La CI no llama a \`npm run verificar\` en ${proyecto}. `
      + `Son ${cuantos} verificadores que dejan de ejecutarse, y la CI sale verde igual.`);
  }
}

/* 2 · no han vuelto las listas sueltas ------------------------------------- */
const sueltos = [...ci.matchAll(/run:\s*npm run (verificar:[a-z-]+)/g)].map((m) => m[1]);
if (sueltos.length) {
  apunta('El `ci.yml` ha vuelto a llamar verificadores UNO A UNO: '
    + [...new Set(sueltos)].join(', ')
    + '. Así fue como se quedaron siete fuera. Se llama al agregado.');
}

/* 3 · todo script del disco está en el agregado de su proyecto ------------- */
for (const proyecto of ['backend', 'frontend']) {
  const dirScripts = path.join(RAIZ, proyecto, 'scripts');
  const pkgRuta = path.join(RAIZ, proyecto, 'package.json');
  if (!fs.existsSync(dirScripts) || !fs.existsSync(pkgRuta)) continue;

  const scripts = JSON.parse(fs.readFileSync(pkgRuta, 'utf8')).scripts || {};
  const agregado = scripts.verificar || '';
  if (!agregado) {
    apunta(`${proyecto}/package.json no tiene el script \`verificar\`. `
      + 'Sin un agregado, la CI tiene que enumerar y la lista se desincroniza.');
    continue;
  }

  /* Los que el agregado ejecuta de verdad, resueltos a su archivo. */
  const ejecutados = new Set();
  for (const nombre of agregado.match(/verificar:[a-z-]+/g) || []) {
    const cmd = scripts[nombre] || '';
    const m = cmd.match(/verificar-([a-z-]+)\.(?:js|cjs)/);
    if (m) ejecutados.add(m[1]);
  }

  for (const archivo of fs.readdirSync(dirScripts)) {
    const m = archivo.match(/^verificar-([a-z-]+)\.(?:js|cjs)$/);
    if (!m) continue;
    const nombre = m[1];
    /* `arranque` corre dentro de `npm run build`, no del agregado. Está
       declarado aquí para que la excepción sea explícita y no un olvido. */
    if (nombre === 'arranque') continue;
    if (!ejecutados.has(nombre)) {
      apunta(`${proyecto}/scripts/${archivo} existe pero NO está en `
        + '`npm run verificar`. Un verificador fuera del agregado no se ejecuta nunca.');
    }
  }
}

/* ── Informe ─────────────────────────────────────────────────────────────── */
if (hallazgos.length) {
  console.error(rojo('\n  LA CI NO COMPRUEBA TODO:\n'));
  for (const h of hallazgos) console.error(`   · ${h}\n`);
  console.error(rojo('  Un control que no se ejecuta no es un control.\n'));
  process.exit(1);
}

console.log(verde('CI: llama al agregado en los dos proyectos y ningún verificador queda fuera.'));
