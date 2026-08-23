/* =============================================================================
   VERIFICADOR — ¿EL CONTENEDOR VA A PODER ARRANCAR?
   -----------------------------------------------------------------------------
   POR QUÉ EXISTE

   El 23/08/2026, migrando a Prisma 7, la compilación salió PERFECTA. Sin un
   error, sin un aviso. Las 926 pruebas en verde, los 18 verificadores en
   verde, `npm run build` sin decir nada.

   Y el contenedor no arrancó:

       Error: Cannot find module '/app/dist/main.js'

   El motivo: Prisma 7 obliga a poner `prisma.config.ts` en la raíz del
   backend, y ese archivo no estaba excluido de la compilación. TypeScript
   deduce la raíz de salida del ancestro común de lo que compila; al entrar un
   archivo de la raíz, la salida entera se corrió de `dist/main.js` a
   `dist/src/main.js`.

   Nada de eso es un error de TypeScript. Es una consecuencia, y es invisible
   salvo que alguien mire la carpeta `dist` — que nadie mira.

   -----------------------------------------------------------------------------
   QUÉ COMPRUEBA

   Que los DOS puntos de entrada que el contenedor invoca existen de verdad,
   exactamente donde se les llama:

     · `dist/main.js`        -> el CMD del Dockerfile
     · `dist/prisma/seed.js` -> lo que declara prisma.config.ts

   Es una comprobación tonta. Y es exactamente la que faltaba.
============================================================================= */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const DIST = path.join(RAIZ, 'dist');

/** Puntos de entrada: [ruta relativa a dist, quién la invoca]. */
const ENTRADAS = [
  ['main.js', 'el CMD del Dockerfile (`node dist/main.js`)'],
  [path.join('prisma', 'seed.js'), 'prisma.config.ts (`node dist/prisma/seed.js`)'],
];

let errores = 0;
const fallar = (t) => { errores++; console.error('  [ERROR] ' + t); };

if (!fs.existsSync(DIST)) {
  console.error('\nNo existe la carpeta `dist`. Ejecuta `npm run build` antes de esto.\n');
  process.exit(1);
}

console.log('\nPuntos de entrada del contenedor:\n');

for (const [rel, quien] of ENTRADAS) {
  const abs = path.join(DIST, rel);
  if (fs.existsSync(abs)) {
    const kb = Math.round(fs.statSync(abs).size / 1024);
    console.log(`  [OK] dist/${rel.replace(/\\/g, '/')}  (${kb} kB)  <- ${quien}`);
    continue;
  }

  /* Si no está donde toca, se busca por el árbol: saber DÓNDE acabó es la
     mitad del diagnóstico. La primera vez costó cuatro reinicios en Railway
     precisamente por no tener esta pista. */
  const nombre = path.basename(rel);
  const encontrados = [];
  (function buscar(dir, prof = 0) {
    if (prof > 4) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) buscar(p, prof + 1);
      else if (e.name === nombre) encontrados.push(path.relative(RAIZ, p).replace(/\\/g, '/'));
    }
  })(DIST);

  fallar(
    `Falta dist/${rel.replace(/\\/g, '/')}, que es lo que invoca ${quien}.`
    + (encontrados.length
      ? `\n          Está en: ${encontrados.join(', ')}`
        + '\n          Es la raíz de salida, que se corrió. Revisa las exclusiones de'
        + '\n          tsconfig.build.json: algún .ts de la raíz del backend entró en la'
        + '\n          compilación y movió el ancestro común.'
      : '\n          No aparece en ninguna parte de dist. ¿Compiló de verdad?'),
  );
}

if (errores) {
  console.error(
    '\nArranque: el contenedor NO podría arrancar con esta compilación.'
    + '\nEsto no lo caza `npm run build` —compila sin quejarse— ni las pruebas.'
    + '\nSe descubre al desplegar, y por eso existe este verificador.\n',
  );
  process.exit(1);
}

console.log('\nArranque verificado: los puntos de entrada están donde el contenedor los busca.\n');
