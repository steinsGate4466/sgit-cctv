/* =============================================================================
   VERIFICADOR 16 · LOS BOTONES SE ALINEAN
   =============================================================================

   DE DÓNDE SALE, textual del usuario:

       «arregla ese botón y todos los botones encajonados perfectamente»

   Y tenía razón. El fallo era de una línea:

       .btn-mini    { min-height: 34px; }
       .btn-primary { min-height: 42px; }

   OCHO PÍXELES. En cualquier barra donde convivan los dos —la ficha del
   activo, la cabecera de casi todas las pantallas— eso se ve como una fila de
   botones que no cuadran. No rompe nada, no lo ve el compilador, no lo ven las
   pruebas: se ve ABRIENDO la pantalla. Que es, otra vez, la lección del
   bloque 64.

   -----------------------------------------------------------------------------
   QUÉ VIGILA, EXACTAMENTE

   Que las clases de botón declaren su altura con `var(--alto-boton)` y NO con
   un número escrito a mano. Con dos números sueltos, el día que alguien toque
   uno los botones se vuelven a desalinear y nadie sabrá por qué.

   -----------------------------------------------------------------------------
   POR QUÉ NO INTENTA MÁS QUE ESO

   Se podría intentar detectar «filas que mezclan botones de familias
   distintas» leyendo el JSX. No se hace: exigiría entender la maquetación, y
   la primera versión daría falsos positivos a mansalva.

   > Un verificador que grita cuando no pasa nada se ignora a la semana, y
   > entonces no sirve el día que grita de verdad.

   Esto sólo mira la hoja de estilos, no admite interpretación, y caza el fallo
   exacto que se cometió. Se prefiere que se escape algo antes que inventarse
   un hallazgo — la misma regla que `verificar:botones`.

   Probado reintroduciendo el fallo: se pone `min-height: 34px` en `.btn-mini`
   y sale con código 1, con archivo y línea.
============================================================================= */
const fs = require('fs');
const path = require('path');

const CSS = path.join(__dirname, '..', 'src', 'styles.css');

/** Las familias de botón que conviven en una misma barra de acciones. */
const FAMILIAS = ['.btn-mini', '.btn-primary'];

/** Quita comentarios para no leer un ejemplo escrito dentro de uno. */
function sinComentarios(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

function main() {
  if (!fs.existsSync(CSS)) {
    /* Si no encuentra lo que vigila, AVISA en vez de dar luz verde. Un
       verificador que no encuentra su objetivo es un verificador apagado
       (lección del `verificar:cable`, bloque 74). */
    console.error('[verificar:botones-alto] No encuentro src/styles.css. No se ha comprobado nada.');
    process.exit(2);
  }

  const bruto = fs.readFileSync(CSS, 'utf8');
  const limpio = sinComentarios(bruto);
  const lineas = limpio.split('\n');
  const fallos = [];

  /* 1 · La variable tiene que existir Y FUERA DE TODA `@media`.
         -------------------------------------------------------------------
         FALLO DE MI PRIMERA VERSIÓN, cazado al probarla: bastaba con buscar
         `--alto-boton:` en cualquier parte del archivo. Al borrar la
         declaración de escritorio, la del bloque móvil seguía ahí y el
         verificador daba VERDE — mientras en escritorio `var(--alto-boton)`
         no resolvía y los botones se quedaban SIN altura mínima. O sea:
         verde justo en el caso peor.

         Es el mismo error de siempre en este proyecto con otra cara —un
         patrón más flojo de lo necesario acaba leyendo otra cosa—, y aquí
         además convertía el verificador en una mentira, que es peor que no
         tenerlo. Ahora se cuentan las llaves para saber si la declaración
         está dentro de una `@media` o no. */
  let profundidad = 0;
  let raizOk = false;
  for (const l of lineas) {
    /* `=== 0` y no `<= 1`. Con `<= 1` seguía dando verde: dentro de una
       `@media` la profundidad al empezar la línea vale exactamente 1, así que
       la declaración móvil contaba como si fuera de raíz. Segunda vez que este
       verificador se equivoca a favor, y las dos por ser demasiado permisivo. */
    if (profundidad === 0 && /--alto-boton\s*:/.test(l)) raizOk = true;
    for (const ch of l) {
      if (ch === '{') profundidad++;
      else if (ch === '}') profundidad--;
    }
  }
  if (!raizOk) {
    fallos.push({
      linea: 0,
      texto: 'Falta --alto-boton FUERA de toda @media. Dentro de una, en escritorio'
        + ' el var() no resuelve y los botones se quedan sin altura mínima.',
    });
  }

  /* 2 · Ninguna familia declara su altura con un número escrito a mano.
         Se mira SÓLO cuando la clase es el selector completo de la regla: una
         regla acotada como `.hr-acc .btn-mini` es un ajuste local legítimo y
         marcarla sería un falso positivo. */
  lineas.forEach((l, i) => {
    const m = /^\s*([^{}]+?)\s*\{(.*)$/.exec(l);
    if (!m) return;
    const selector = m[1].trim();
    const cuerpo = m[2];
    if (!FAMILIAS.includes(selector)) return;
    const alto = /min-height\s*:\s*([^;]+);/.exec(cuerpo);
    if (!alto) return;
    if (!alto[1].includes('var(--alto-boton)')) {
      fallos.push({
        linea: i + 1,
        texto: `${selector} fija su altura a mano (${alto[1].trim()}).`
          + ' Tiene que ser var(--alto-boton), o las familias se desalinean.',
      });
    }
  });

  /* 3 · Las dos familias tienen que declarar altura. Que una la tenga y la
         otra no es exactamente el desajuste que esto viene a evitar, sólo que
         más difícil de ver: una queda con la altura del navegador. */
  for (const f of FAMILIAS) {
    const re = new RegExp(`^\\s*\\${f}\\s*\\{[^}]*min-height`, 'm');
    if (!re.test(limpio)) {
      fallos.push({
        linea: 0,
        texto: `${f} no declara min-height. Al lado de la otra familia, no cuadra.`,
      });
    }
  }

  if (fallos.length) {
    console.error('\n[verificar:botones-alto] Los botones no van a cuadrar:\n');
    for (const f of fallos) {
      console.error(`  src/styles.css${f.linea ? ':' + f.linea : ''}  ${f.texto}`);
    }
    console.error(
      '\n  Motivo: `.btn-mini` medía 34 px y `.btn-primary` 42. Ocho píxeles de'
      + '\n  diferencia hacen que una barra de acciones se vea encajonada.'
      + '\n  Arreglo: min-height: var(--alto-boton) en las dos.\n',
    );
    process.exit(1);
  }

  console.log(
    `Botones: ${FAMILIAS.length} familias con la misma altura (var(--alto-boton)). Cuadran.`,
  );
}

main();
