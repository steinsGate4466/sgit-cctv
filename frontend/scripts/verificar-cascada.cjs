/* =========================================================================
   VERIFICADOR 11 — LA CASCADA DE styles.css
   -------------------------------------------------------------------------
   QUÉ BUSCA
   El mismo selector declarando la MISMA propiedad con valores distintos, en
   dos sitios diferentes de la hoja y fuera de cualquier @media.

   POR QUÉ IMPORTA
   Cuando pasa eso, gana el último que aparezca en el archivo. Funciona, pero
   nadie sabe cuál manda: se toca el de arriba, no cambia nada, y se acaba
   añadiendo una tercera regla más abajo. Así fue como esta hoja llegó a
   tener `input` definido en cuatro sitios con cuatro tamaños de letra.

   No es un error que rompa la pantalla. Es la razón por la que arreglar algo
   visual costaba tres intentos.

   EL UMBRAL
   Se fija en el número que había el día que se midió por primera vez. No
   exige arreglarlo todo de golpe —eso sería reescribir la hoja a ciegas—,
   pero impide que CREZCA. Cada bloque que consolide un puñado de reglas baja
   el umbral y lo deja bajado.

   Las parejas 100vh/100dvh y -webkit-* se excluyen: son la misma intención
   escrita dos veces para navegadores distintos, no un descuido.
   ========================================================================= */
const fs = require('path') && require('fs');
const path = require('path');

const UMBRAL = 5;
const RUTA = path.join(__dirname, '..', 'src', 'styles.css');

/** Duplicados legítimos: el segundo valor es el respaldo del primero. */
const EQUIVALENTES = [
  ['100vh', '100dvh'], ['100vw', '100dvw'],
  ['-webkit-fill-available', 'auto'],
];
function esRespaldo(valores) {
  return EQUIVALENTES.some(
    (par) => valores.length === 2 && par.every((v) => valores.some((x) => x.includes(v))),
  );
}

function reglasDe(css) {
  const limpio = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const reglas = [];
  const pilaAt = [];
  let buf = '';
  for (let i = 0; i < limpio.length; i++) {
    const ch = limpio[i];
    if (ch === '{') {
      const cabecera = buf.trim();
      buf = '';
      if (cabecera.startsWith('@')) { pilaAt.push(cabecera); continue; }
      let cuerpo = '';
      while (i + 1 < limpio.length && limpio[i + 1] !== '}') cuerpo += limpio[++i];
      i++;
      reglas.push({ selector: cabecera, cuerpo, at: pilaAt.join(' ') });
    } else if (ch === '}') {
      if (pilaAt.length) pilaAt.pop();
      buf = '';
    } else buf += ch;
  }
  return reglas;
}

const css = fs.readFileSync(RUTA, 'utf8');
const mapa = new Map();

for (const r of reglasDe(css)) {
  if (r.at) continue;                       // dentro de @media es legítimo
  const selectores = r.selector.split(',')
    .map((s) => s.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
  for (const s of selectores) {
    for (const decl of r.cuerpo.split(';')) {
      const corte = decl.indexOf(':');
      if (corte < 0) continue;
      const prop = decl.slice(0, corte).trim();
      const valor = decl.slice(corte + 1).trim();
      if (!prop || !valor || prop.startsWith('--')) continue;
      const clave = `${s} | ${prop}`;
      if (!mapa.has(clave)) mapa.set(clave, []);
      const vistos = mapa.get(clave);
      if (!vistos.includes(valor)) vistos.push(valor);
    }
  }
}

const conflictos = [...mapa.entries()]
  .filter(([, v]) => v.length > 1 && !esRespaldo(v))
  .sort((a, b) => b[1].length - a[1].length);

console.log(`Cascada: ${conflictos.length} propiedades declaradas dos o más veces (umbral ${UMBRAL}).`);
conflictos.slice(0, 12).forEach(([k, v]) => console.log(`   ${k}  ->  ${v.join('  |  ')}`));

if (conflictos.length > UMBRAL) {
  console.error(`\nLa hoja de estilos ganó ${conflictos.length - UMBRAL} conflictos nuevos.`);
  console.error('No añadas una regla al final para tapar otra: corrige la de arriba.');
  process.exit(1);
}
if (conflictos.length < UMBRAL) {
  console.log(`\nBajaron ${UMBRAL - conflictos.length}. Deja el umbral en ${conflictos.length} en este archivo.`);
}
