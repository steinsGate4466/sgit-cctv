/* =============================================================================
   VERIFICADOR — CLASES QUE EL CÓDIGO USA Y LA HOJA DE ESTILOS NO DEFINE
   -----------------------------------------------------------------------------
   POR QUÉ EXISTE

   El 23/08/2026 el usuario mandó una captura del diálogo «Cómo se llega a este
   equipo»: el campo de texto salía montado sobre su propio rótulo. Al ir a
   arreglarlo se hizo un barrido comparando TODAS las clases escritas en los
   .tsx contra las declaradas en styles.css. Salieron cuatro que no existían, y
   una de ellas era gorda:

     · `est-*`        13 usos en SIETE pantallas. CERO reglas en la hoja.
                      El estado de cada equipo —OPERATIVO, FUERA_SERVICIO,
                      MANTENIMIENTO— salía como texto gris plano. En
                      Grabadores es la columna que dice qué cámara está caída.
     · `page-head`    la franja del filtro de tren, en 4 pantallas
     · `ta-pulsable`  las filas de tabla que llevan a algún sitio
     · `crono-texto`  el texto de la línea de tiempo de una cámara caída

   NINGUNA rompía nada. El navegador ignora una clase que no existe: no hay
   error en consola, no falla el build, el typecheck pasa y las pruebas pasan.
   Simplemente el elemento sale sin formato. Por eso llevaban meses ahí.

   Y estuvo a punto de pasar otra vez el mismo día: al escribir el botón de
   reportar del púlpito se usó `btn-secundario`, que tampoco existe. Se pilló
   de casualidad mirando el CSS por otro motivo.

   -----------------------------------------------------------------------------
   POR QUÉ NO LO CAZA NADA MÁS

   ESLint mira JavaScript, no CSS. TypeScript comprueba tipos, y `className` es
   un texto cualquiera. `verificar-cascada` mira conflictos DENTRO de la hoja.
   Nadie compara los dos lados. Esto lo hace.

   -----------------------------------------------------------------------------
   LO QUE APRENDIMOS ESCRIBIÉNDOLO: NO GRITAR DE MÁS

   La primera versión daba siete resultados y TRES eran falsos: clases armadas
   al vuelo como `'marca-' + tono` o `'cam-pie-' + x`, que la expresión regular
   cortaba por la mitad y reportaba como `marca-` y `cam-pie-`.

   Un verificador que se equivoca es peor que no tenerlo: enseña al equipo a
   ignorarlo, y entonces no sirve el día que acierta. Así que aquí las clases
   que acaban en guion —trozo de una clase dinámica— se saltan, y se comprueba
   en su lugar que exista al menos UNA regla con ese prefijo.
============================================================================= */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const SRC = path.join(RAIZ, 'src');
const HOJA = path.join(SRC, 'styles.css');

/* Clases que no vienen de nuestra hoja y por tanto no se exigen. Cada una
   lleva su motivo: una lista de excepciones sin explicar es una lista que
   crece sola hasta vaciar el verificador. */
const DE_FUERA = new Set([
  // Ninguna por ahora. El proyecto no usa librerías de estilos externas: todo
  // el CSS es propio y está en un solo archivo. Si algún día entra una, va
  // aquí CON SU MOTIVO.
]);

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

// ---- 1. Lo que la hoja de estilos DEFINE ----
// Se quitan los comentarios primero: un `.clase` mencionado dentro de una
// explicación no la define, y darla por buena escondería el fallo real.
const css = fs.readFileSync(HOJA, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const definidas = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));

// ---- 2. Lo que el código USA ----
const usadas = new Map(); // clase -> [ 'archivo:linea', ... ]
/* Cadenas de varias clases en un literal, para el barrido del bloque 113. */
const cadenas = [];
const anota = (clase, archivo, linea) => {
  if (!usadas.has(clase)) usadas.set(clase, []);
  usadas.get(clase).push(`${path.relative(SRC, archivo).replace(/\\/g, '/')}:${linea}`);
};

for (const p of archivos(SRC)) {
  const t = fs.readFileSync(p, 'utf8');
  const lineaDe = (i) => t.slice(0, i).split('\n').length;

  // className="a b c"
  for (const m of t.matchAll(/className="([^"{}]+)"/g)) {
    for (const c of m.group?.[1]?.split(/\s+/) ?? m[1].split(/\s+/)) {
      if (c) anota(c, p, lineaDe(m.index));
    }
  }
  // className={'a b' + (x ? ' c' : '')}  y  className={`a ${x}`}
  for (const m of t.matchAll(/className=\{[`']([^`'$]+)/g)) {
    for (const c of m[1].split(/\s+/)) if (c) anota(c, p, lineaDe(m.index));
  }
  // ' clase' sueltas dentro de una expresión de className
  for (const m of t.matchAll(/className=\{[^}]*?'\s([\w-]+)'/g)) {
    anota(m[1], p, lineaDe(m.index));
  }

  /* EL HUECO QUE SE ESCAPÓ — bloque 113.
     -------------------------------------------------------------------------
     Los tres barridos de arriba cogen la clase pegada a la llave
     (`className={'a b' + ...}`) y las que van precedidas de espacio dentro de
     la expresión (`? ' activa' : ''`). Lo que NO cogen es el PRIMER literal de
     un ternario cuando delante hay una condición:

         className={edad >= VIEJO ? 'edad-dato viejo' : 'edad-dato'}
                                     ^^^^^^^^^^^^^^^ invisible para los tres

     Se coló escribiendo esta misma pantalla: `viejo` no existía en la hoja, el
     verificador dijo verde, y el aviso de «dato viejo» habría salido sin
     formato — que es EXACTAMENTE el fallo que este verificador existe para
     cazar. Un verificador con un agujero es peor que no tenerlo, porque da
     permiso para no mirar.

     CÓMO SE CIERRA SIN EMPEZAR A GRITAR DE MÁS. Dentro de una expresión de
     `className` hay literales que NO son clases: comparaciones contra un
     estado (`o.status === 'ABIERTA' ? ...`), claves, textos. Marcarlos todos
     llenaría el informe de ruido y el verificador se acabaría ignorando.

     La señal que se usa: un literal cuyas palabras son TODAS con pinta de
     clase —minúsculas y guiones— y donde al menos UNA ya está definida en la
     hoja. Eso ya no es una comparación: es una cadena de clases, y entonces
     sus hermanas TAMBIÉN tienen que existir. `'ABIERTA'` no entra (mayúsculas
     y ninguna regla la define); `'edad-dato viejo'` sí, porque `edad-dato`
     está en la hoja. Prefiero que se me escape uno antes que inventarme uno.
     La comprobación real se hace abajo, cuando ya se sabe qué define la hoja. */
  /* Y LAS TABLAS DE CLASES — bloque 108.
     Muchas pantallas guardan la clase en un objeto y la sacan por índice:

         const TONO = { GRAVE: { clase: 'card peligro' }, ... };
         <div className={TONO[x].clase} />

     El literal NO está dentro de un `className={...}`, así que todos los
     barridos de arriba lo pierden. Pasó escribiendo `ReemplazoDelActivo`: la
     clase `aviso` no existía en la hoja, el verificador dio verde, y el
     recuadro habría salido sin formato — el mismo fallo que este archivo
     existe para cazar, entrando por otra puerta.

     La señal, estrecha a propósito: el literal es el valor de una clave que se
     LLAMA `clase`, `className` o `cls`. Un texto guardado en una clave con ese
     nombre es una clase; no hay ambigüedad que valga. */
  for (const m of t.matchAll(/\b(?:clase|className|cls)\s*:\s*'([^'\n]+)'/g)) {
    const palabras = m[1].trim().split(/\s+/).filter(Boolean);
    if (!palabras.length) continue;
    if (!palabras.every((c) => /^[a-z][a-z0-9-]*$/.test(c))) continue;
    cadenas.push({
      palabras,
      siempre: true,   // la clave se llama `clase`: ya dijo lo que es
      sitio: `${path.relative(SRC, p).replace(/\\/g, '/')}:${lineaDe(m.index)}`,
    });
  }

  for (const m of t.matchAll(/className=\{([\s\S]{0,400}?)\}/g)) {
    for (const lit of m[1].matchAll(/'([^'\\\n]*)'/g)) {
      const palabras = lit[1].trim().split(/\s+/).filter(Boolean);
      if (palabras.length < 2) continue;              // una sola: ya la cogen los de arriba
      if (!palabras.every((c) => /^[a-z][a-z0-9-]*$/.test(c))) continue;
      cadenas.push({ palabras, sitio: `${path.relative(SRC, p).replace(/\\/g, '/')}:${lineaDe(m.index)}` });
    }
  }
}

// ---- 3. Comparar ----
const problemas = [];
for (const [clase, sitios] of usadas) {
  if (DE_FUERA.has(clase) || definidas.has(clase)) continue;

  /* Clase cortada de una dinámica —`'est-' + estado`, `'marca-' + tono`—.
     No se exige la clase entera; se exige que EXISTA alguna regla con ese
     prefijo. Si no hay ninguna, el elemento sale sin formato pase lo que pase,
     y ése SÍ es el fallo que se busca (fue el caso de `est-`). */
  if (clase.endsWith('-')) {
    const hayAlguna = [...definidas].some((d) => d.startsWith(clase) && d.length > clase.length);
    if (!hayAlguna) {
      problemas.push({
        clase: clase + '*',
        sitios,
        nota: 'Se arma al vuelo y NO hay ni una regla con ese prefijo: sale siempre sin formato.',
      });
    }
    continue;
  }
  problemas.push({ clase, sitios });
}

/* Bloque 113: las cadenas de clases. Se comprueban AQUÍ y no arriba porque
   hace falta saber ya qué define la hoja para distinguir una cadena de clases
   de una comparación contra un texto cualquiera. */
for (const { palabras, sitio, siempre } of cadenas) {
  // Una clave llamada `clase:` no necesita confirmación: ya dijo lo que es.
  if (!siempre && !palabras.some((c) => definidas.has(c))) continue;
  for (const c of palabras) {
    if (DE_FUERA.has(c) || definidas.has(c)) continue;
    /* Trozo de una clase dinámica (`'marca marca-' + tono`). Se le aplica la
       MISMA regla que arriba y no una propia: basta con que exista alguna
       regla con ese prefijo. La primera versión de este barrido no lo hacía y
       sacó tres falsos positivos de golpe — justo lo que este archivo lleva
       dos pantallas de comentario diciendo que no hay que hacer. */
    if (c.endsWith('-')
        && [...definidas].some((d) => d.startsWith(c) && d.length > c.length)) continue;
    const ya = problemas.find((x) => x.clase === c);
    if (ya) { if (!ya.sitios.includes(sitio)) ya.sitios.push(sitio); continue; }
    problemas.push({
      clase: c,
      sitios: [sitio],
      nota: 'Va junto a otra clase que SÍ existe, así que es una clase y falta su regla.',
    });
  }
}

// ---- 4. Informe ----
console.log(`\nClases: ${usadas.size} distintas en el código, ${definidas.size} en la hoja de estilos.\n`);

if (!problemas.length) {
  console.log('Todas las clases que usa el código existen en styles.css.\n');
  process.exit(0);
}

for (const p of problemas.sort((a, b) => b.sitios.length - a.sitios.length)) {
  console.error(`  [ERROR] .${p.clase} — usada ${p.sitios.length} vez(ces) y NO existe en styles.css`);
  if (p.nota) console.error(`          ${p.nota}`);
  for (const s of p.sitios.slice(0, 5)) console.error(`          ${s}`);
  if (p.sitios.length > 5) console.error(`          …y ${p.sitios.length - 5} más`);
}

console.error(
  `\n${problemas.length} clase(s) sin definir.`
  + '\nEsto NO rompe nada: el navegador ignora la clase y el elemento sale sin'
  + '\nformato. No hay error en consola, el build pasa y las pruebas pasan.'
  + '\nSólo se ve mirando la pantalla — y por eso lleva meses ahí cuando aparece.\n',
);
process.exit(1);
