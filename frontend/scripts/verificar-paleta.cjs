#!/usr/bin/env node
/* =============================================================================
   VERIFICADOR 22 (frontend) · NINGÚN COLOR SE ESCRIBE A MANO
   -----------------------------------------------------------------------------
   DE DÓNDE SALE (bloque 116)

   El barrido del 17/09 encontró **136 colores escritos a mano en 45 tonos
   distintos** repartidos por los estilos en línea. Entre ellos SEIS rojos para
   decir exactamente lo mismo —`#991b1b`, `#8c1414`, `#b91c1c`, `#b3261e`,
   `#dc2626`, `#c0392b`— y CINCO ámbares.

   POR QUÉ ES UN DEFECTO Y NO UNA MANÍA:

     1. EL MISMO ESTADO SE VE DE DOS COLORES según la pantalla. «Crítico» en
        Activos y «crítico» en Grabadores no eran el mismo rojo, y la vista lo
        nota aunque nadie sepa decir qué falla.
     2. CAMBIAR LA PALETA ERA IMPOSIBLE: 136 sitios a mano, y el que se olvide
        se queda con el color viejo para siempre.
     3. UN MODO OSCURO PARA EL PÚLPITO DE NOCHE, impensable. Ese turno existe.
     4. EN UNA EXPOSICIÓN RESTA. Parece hecho por dos personas distintas.

   -----------------------------------------------------------------------------
   POR QUÉ NO LO CAZABA `verificar:clases`

   Porque no son clases: son estilos en línea. `verificar:clases` compara los
   nombres de clase del código contra la hoja; un `style={{ color: '#b91c1c' }}`
   no pasa por ahí en ningún momento.

   -----------------------------------------------------------------------------
   QUÉ COMPRUEBA

   Que ninguna propiedad de color de un estilo en línea —`color`, `background`,
   `border`, `fill`, `stroke`…— lleve un `#rrggbb`. Todas tienen que apuntar a
   una variable de `styles.css`, que es donde vive la paleta:

       --crit-texto / --crit-fondo / --crit-borde
       --warn-texto / --warn-fondo / --warn-borde
       --ok-texto   / --ok-fondo   / --ok-borde
       --info / --info-texto / --info-fondo / --info-borde
       --bg --card --text --muted --border --navy --steel

   Y comprueba que la variable citada EXISTA: un `var(--crit-text)` mal escrito
   no da error en ninguna parte, simplemente no pinta — que es el mismo fallo
   silencioso que persigue `verificar:clases`.

   -----------------------------------------------------------------------------
   LO QUE NO MIRA, PARA NO GRITAR DE MÁS

   · `styles.css`: ahí es donde los colores DEBEN estar escritos.
   · Los colores que vienen del SERVIDOR (`c.hex` de la norma de rotulado): son
     un dato de planta, no una decisión de diseño. Un cable amarillo es
     amarillo, y la paleta de la aplicación no manda sobre eso.
   · `rgba(...)` en sombras: no son color de marca.

   PROBADO REINTRODUCIENDO EL FALLO: se devuelve un `color: '#b91c1c'` a una
   pantalla y sale con código 1 señalando archivo y línea.
============================================================================= */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const HOJA = path.join(SRC, 'styles.css');

const sinComentarios = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:'"\w])\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));

/** Propiedades de estilo en línea que pintan color. */
const PROPS = /(color|background|backgroundColor|borderColor|border|borderLeft|borderTop|borderBottom|borderRight|fill|stroke|outline)\s*:\s*'([^']*)'/g;

function archivos(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', 'dist', 'generated'].includes(e.name)) continue;
      archivos(p, acc);
    } else if (/\.tsx?$/.test(e.name)) acc.push(p);
  }
  return acc;
}

// Las variables que la hoja define de verdad.
const css = fs.readFileSync(HOJA, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const definidas = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));

const aMano = [];
const inventadas = [];

for (const f of archivos(SRC)) {
  const t = sinComentarios(fs.readFileSync(f, 'utf8'));
  const linea = (i) => t.slice(0, i).split('\n').length;

  for (const m of t.matchAll(PROPS)) {
    if (/#[0-9a-fA-F]{3,8}/.test(m[2])) {
      aMano.push({
        archivo: path.relative(SRC, f).replace(/\\/g, '/'),
        linea: linea(m.index),
        prop: m[1],
        valor: m[2].slice(0, 40),
      });
    }
    for (const v of m[2].matchAll(/var\(\s*(--[\w-]+)/g)) {
      if (!definidas.has(v[1])) {
        inventadas.push({
          archivo: path.relative(SRC, f).replace(/\\/g, '/'),
          linea: linea(m.index),
          variable: v[1],
        });
      }
    }
  }
}

if (!aMano.length && !inventadas.length) {
  console.log(`[verificar:paleta] OK — ningún color a mano; ${definidas.size} variables en la hoja.`);
  process.exit(0);
}

for (const x of aMano) {
  console.error(`  [ERROR] ${x.archivo}:${x.linea} — ${x.prop}: '${x.valor}' lleva el color escrito a mano`);
}
for (const x of inventadas) {
  console.error(`  [ERROR] ${x.archivo}:${x.linea} — var(${x.variable}) no existe en styles.css: no pinta nada`);
}
console.error(
  '\nLa paleta vive en `styles.css`. Un color escrito a mano hace que el mismo'
  + '\nestado se vea distinto en dos pantallas, y deja el cambio de paleta —o un'
  + '\nmodo oscuro para el turno de noche— fuera de alcance.'
  + '\n\nUsa la variable que corresponda:'
  + '\n    crítico  var(--crit-texto) var(--crit-fondo) var(--crit-borde)'
  + '\n    aviso    var(--warn-texto) var(--warn-fondo) var(--warn-borde)'
  + '\n    bien     var(--ok-texto)   var(--ok-fondo)   var(--ok-borde)'
  + '\n    informa  var(--info)  var(--info-texto)  var(--info-fondo)\n',
);
process.exit(1);
