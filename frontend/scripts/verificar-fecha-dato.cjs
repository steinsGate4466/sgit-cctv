#!/usr/bin/env node
/* =============================================================================
   VERIFICADOR 23 (frontend) · TODA PANTALLA DICE DE CUÁNDO SON SUS DATOS
   -----------------------------------------------------------------------------
   DE DÓNDE SALE (bloque 112)

   Petición del usuario, repetida tres veces a lo largo del proyecto: «en cada
   dashboard siempre tiene que haber un apartado de fecha en la que se
   actualizó».

   El barrido dio la medida: de las 56 pantallas, **7** lo enseñaban. Las otras
   49 dejaban creer que lo que se ve es de ahora mismo.

   POR QUÉ IMPORTA, Y NO ES PRESENTACIÓN. En el púlpito de Laminación la
   pantalla lleva ocho horas abierta. El jefe de turno la mira de pasada, ve
   todo en verde, y está leyendo la madrugada. **La pantalla no parece rota:
   parece tranquila.** Es el mismo fallo que el bloque 42 arregló para una
   pantalla, sin arreglarlo para las otras 49.

   -----------------------------------------------------------------------------
   QUÉ COMPRUEBA, Y POR QUÉ ESAS TRES COSAS

   La solución del 112 no vive en las pantallas sino en TRES piezas, y basta
   que se caiga una para que las 56 vuelvan a callar. Las tres se comprueban:

     1. `api/client.ts` marca la hora en cada GET bueno. Sin esto no hay dato.
     2. `Layout.tsx` pinta `<FechaDelDato />`. Sin esto el dato existe y no se
        ve — que para el usuario es exactamente lo mismo que no existir.
     3. `FechaDelDato.tsx` se REINICIA al cambiar de ruta. Sin esto, una
        pantalla que aún no ha respondido hereda la hora de la anterior y dice
        «hace 3 s» sobre una tabla vacía: la misma mentira, con otra cara.

   La tercera es la que de verdad hay que vigilar. Las dos primeras, si
   desaparecen, se notan al abrir la aplicación; ésa no se nota nunca.

   -----------------------------------------------------------------------------
   POR QUÉ NO EXIGE NADA PANTALLA POR PANTALLA

   Porque la cabecera las cubre todas. Exigirlo además en cada una sería pedir
   dos veces lo mismo y llenaría el informe de ruido — y un verificador que
   grita cuando no pasa nada se ignora a la semana.

   PROBADO REINTRODUCIENDO EL FALLO: quitando el reinicio por ruta, quitando el
   componente de la cabecera y quitando la marca del interceptor. Los tres
   salen con código 1.
============================================================================= */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const leer = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');

const cliente = leer(path.join(SRC, 'api', 'client.ts'));
const layout = leer(path.join(SRC, 'components', 'Layout.tsx'));
const comp = leer(path.join(SRC, 'components', 'FechaDelDato.tsx'));

const fallos = [];

if (!comp) {
  fallos.push('No existe `components/FechaDelDato.tsx`: ninguna pantalla dice de cuándo son sus datos.');
} else if (!/reiniciarUltimaCarga\s*\(\s*\)/.test(comp) || !/loc\.pathname|location\.pathname/.test(comp)) {
  fallos.push(
    '`FechaDelDato.tsx` ya no se reinicia al cambiar de ruta. Una pantalla que '
    + 'todavía no ha respondido heredaría la hora de la anterior y diría «hace 3 s» '
    + 'sobre una tabla vacía.',
  );
}

if (!/ultimaCargaMs\s*=\s*Date\.now\(\)/.test(cliente)) {
  fallos.push(
    '`api/client.ts` ya no marca la hora de las respuestas buenas. Sin esa marca '
    + 'la cabecera no tiene nada que enseñar.',
  );
} else if (!/method[^\n]*get/i.test(cliente)) {
  fallos.push(
    'La marca de hora de `api/client.ts` ya no distingue los GET. Un POST que '
    + 'guarda algo no refresca lo que se ve: contarlo pondría el contador a cero '
    + 'enseñando datos viejos.',
  );
}

if (!/<FechaDelDato\s*\/>/.test(layout)) {
  fallos.push(
    '`Layout.tsx` ya no pinta `<FechaDelDato />`. El dato existiría y no se vería, '
    + 'que para quien mira la pantalla es lo mismo que no existir.',
  );
}

if (!fallos.length) {
  console.log('[verificar:fecha-dato] OK — la cabecera dice de cuándo son los datos, en las 56 pantallas.');
  process.exit(0);
}

for (const f of fallos) console.error(`  [ERROR] ${f}`);
console.error(
  '\nEl usuario lo pidió tres veces: «en cada dashboard siempre tiene que haber'
  + '\nun apartado de fecha en la que se actualizó». En el púlpito la pantalla'
  + '\nlleva ocho horas abierta; sin esto, el jefe de turno ve todo en verde y'
  + '\nestá leyendo la madrugada.\n',
);
process.exit(1);
