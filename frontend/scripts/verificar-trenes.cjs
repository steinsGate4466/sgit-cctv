/* eslint-disable no-console */
/**
 * VERIFICADOR 19 (frontend) — EL TREN VIAJA EN EL ENLACE.
 *
 * =============================================================================
 *  DE QUÉ FALLO REAL NACE
 * =============================================================================
 *  Bloque 103. El usuario eligió el Tren 2 en «Por tren», pulsó «Qué está
 *  fallando», y la pantalla se abrió en el Tren 1.
 *
 *  Los enlaces no llevaban el tren, así que la pantalla de destino arrancaba
 *  con `t[0].code` — el primero de la lista. **Y no rompe nada**: enseña un
 *  tren de verdad, con datos de verdad. Sobrevivió a 1.270 pruebas, 20
 *  verificadores, cinco auditorías y siete recorridos. Lo cazó una persona
 *  mirando la pantalla.
 *
 *  Debajo había un segundo fallo, y es el que este verificador protege de
 *  verdad: cada pantalla llamaba «tren» a una cosa distinta —«Por tren» a la
 *  SIGLA (`T2`), las otras al CÓDIGO (`AASA-PISCO-T2`)—. Pasar el valor sin
 *  normalizar habría cerrado el síntoma dejando el mecanismo intacto.
 *
 * =============================================================================
 *  QUÉ COMPRUEBA, Y POR QUÉ SÓLO ESTO
 * =============================================================================
 *  Es PEQUEÑO a propósito, como el verificador 20 del backend. No revisa lo
 *  que TypeScript ya revisa; sólo protege lo que el compilador no puede ver:
 *  que alguien quite el parámetro, o vuelva a escribir la comparación a mano.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const leer = (p) => fs.readFileSync(path.join(SRC, p), 'utf8');
const fallos = [];

/* 1 · Los enlaces de «Por tren» que van a una pantalla CON pestañas de tren
       tienen que llevarlo. `/dependencias` queda fuera a propósito: no tiene
       pestañas, y pasarle un parámetro que ignora sería media puerta. */
const porTren = leer('pages/PorTren.tsx');
for (const destino of ['/mis-camaras', '/mis-activos']) {
  const re = new RegExp(`to=\\{?\`?${destino}\\?tren=`);
  if (!re.test(porTren)) {
    fallos.push(
      `src/pages/PorTren.tsx: el enlace a ${destino} no lleva "?tren=". `
      + 'Sin él la pantalla se abre en el primer tren de la lista y el usuario '
      + 'acaba mirando otro sector sin enterarse.',
    );
  }
}

/* 2 · Las pantallas de destino tienen que RESOLVER el tren pedido con la
       función común. Si alguien vuelve a poner `setCode(t[0].code)` a secas,
       el enlace deja de servir y nada más se entera. */
for (const p of ['pages/MisCamaras.tsx', 'pages/MisActivos.tsx']) {
  const texto = leer(p);
  if (!texto.includes('elegirTren(')) {
    fallos.push(
      `src/${p}: no llama a elegirTren(). Esta pantalla se abre desde «Por tren» `
      + 'con el tren en la dirección; sin resolverlo, arranca siempre en el primero.',
    );
  }
  if (/setCode\(\s*t\[0\]\.code\s*\)/.test(texto)) {
    fallos.push(
      `src/${p}: vuelve a fijar el primer tren de la lista a mano (setCode(t[0].code)). `
      + 'Eso es exactamente el bug del bloque 103.',
    );
  }
}

/* 3 · La comparación vive en UN sitio, y no se hace por subcadena suelta.
       Con includes('T1'), el Tren 1 alcanzaría también a un futuro Tren 10:
       es la regla que el backend fijó en el bloque 42. */
let trenes;
try {
  trenes = leer('trenes.ts');
} catch {
  fallos.push('Falta src/trenes.ts, que es donde vive la comparación de trenes.');
}
if (trenes) {
  if (!/export function mismoTren\b/.test(trenes)) {
    fallos.push('src/trenes.ts: ya no exporta mismoTren(), que es la única forma correcta de comparar dos trenes.');
  }
  const cuerpo = trenes.slice(trenes.indexOf('export function mismoTren'));
  const hasta = cuerpo.indexOf('export function', 1);
  const soloMismoTren = hasta > 0 ? cuerpo.slice(0, hasta) : cuerpo;
  if (soloMismoTren.includes('.includes(')) {
    fallos.push(
      'src/trenes.ts: mismoTren() compara por subcadena (.includes). Con eso el '
      + 'Tren 1 alcanzaría a un futuro Tren 10. Se exige coincidencia entera o '
      + 'precedida de guion (regla del bloque 42).',
    );
  }
  if (!soloMismoTren.includes('endsWith(')) {
    fallos.push('src/trenes.ts: mismoTren() ya no acepta el código largo (AASA-PISCO-T2) contra la sigla (T2).');
  }
}

if (fallos.length) {
  console.error('\n[verificar:trenes] FALLA\n');
  for (const f of fallos) console.error(`   · ${f}\n`);
  process.exit(1);
}
console.log('[verificar:trenes] OK — el tren viaja en el enlace y se compara en un solo sitio.');
