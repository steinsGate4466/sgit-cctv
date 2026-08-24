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
