/* =============================================================================
   VERIFICADOR 14 — EL DESPLIEGUE
   -----------------------------------------------------------------------------
   POR QUÉ EXISTE
   El 13/08/2026 una auditoría encontró que el contenedor de producción
   arrancaba con `prisma db push`. Ese comando NO aplica migraciones: compara
   el esquema con la base y la sincroniza directo, y PUEDE ELIMINAR COLUMNAS.
   Prisma lo documenta como herramienta de prototipado.

   Llevaba meses ahí. Con la base vacía nunca pasó nada, así que nada avisó. Y
   el comentario del propio Dockerfile decía «aplica las migraciones
   versionadas» — el comentario y el comando llevaban tiempo mintiéndose.

   Es la misma familia de fallos que persigue el resto de verificadores: algo
   que NO se rompe, que funciona todos los días, y que un día se lleva un dato
   por delante.

   -----------------------------------------------------------------------------
   QUÉ COMPRUEBA
   Siete reglas sobre los Dockerfile. Ninguna es de estilo: cada una tapa algo
   que se puede perder o que una revisión de contenedores va a marcar.
============================================================================= */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', '..');
let errores = 0;
let avisos = 0;
const fallar = (f, t) => { errores++; console.error(`  [ERROR] ${f}: ${t}`); };
const avisar = (f, t) => { avisos++; console.log(`  [AVISO] ${f}: ${t}`); };

/** Quita los comentarios para no analizar lo que sólo está explicado. */
const sinComentarios = (txt) =>
  txt.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');

const REGLAS = [
  {
    nombre: 'db push en producción',
    aplica: () => true,
    revisa(txt, f) {
      if (/prisma\s+db\s+push/.test(txt)) {
        fallar(f,
          '`prisma db push` en la imagen. NO aplica migraciones: sincroniza el ' +
          'esquema y puede ELIMINAR COLUMNAS. Usa `prisma migrate deploy`.');
      }
    },
  },
  {
    nombre: 'la semilla en cada arranque',
    aplica: () => true,
    revisa(txt, f) {
      if (/CMD[\s\S]*seed/.test(txt)) {
        fallar(f,
          'La semilla se ejecuta al arrancar el contenedor. Corre en CADA ' +
          'despliegue y puede reescribir datos. Déjala como paso manual.');
      }
    },
  },
  {
    nombre: 'errores tragados con || true',
    aplica: () => true,
    revisa(txt, f) {
      if (/CMD[\s\S]*\|\|\s*true/.test(txt)) {
        fallar(f, 'Hay un `|| true` en el arranque: esconde el fallo y nadie se entera.');
      }
    },
  },
  {
    nombre: 'instalación reproducible',
    aplica: () => true,
    revisa(txt, f) {
      if (/RUN\s+npm\s+install(?!\s+-g)/.test(txt)) {
        fallar(f,
          '`npm install` en la imagen. Puede resolver versiones distintas a las ' +
          'del lock: dos despliegues del mismo commit con librerías diferentes. ' +
          'Usa `npm ci`.');
      }
      if (/npm\s+install\s+-g\s+[\w@/-]+(?!@[\d.])\s*(&&|$|\n)/.test(txt)) {
        avisar(f, 'Instalación global sin versión fija: cada reconstrucción puede traer otra.');
      }
    },
  },
  {
    nombre: 'dependencias de desarrollo en producción',
    aplica: (f) => /backend/.test(f),
    revisa(txt, f) {
      const copiaTodo = /COPY\s+--from=\w+[^\n]*\/node_modules/.test(txt);
      const poda = /npm\s+prune\s+--omit=dev|npm\s+ci\s+--omit=dev/.test(txt);
      if (copiaTodo && !poda) {
        fallar(f,
          'Copia el node_modules completo sin podar. La imagen se lleva jest, ' +
          'ts-node y el CLI de Nest, con sus avisos de seguridad. Añade ' +
          '`npm prune --omit=dev`.');
      }
    },
  },
  {
    nombre: 'el contenedor corre como root',
    aplica: () => true,
    revisa(txt, f) {
      if (!/^\s*USER\s+\w+/m.test(txt)) {
        fallar(f, 'No declara USER: corre como root. Es lo primero que mira una revisión.');
      }
    },
  },
  {
    nombre: 'sin comprobación de salud',
    aplica: () => true,
    revisa(txt, f) {
      if (!/HEALTHCHECK/.test(txt)) {
        avisar(f, 'Sin HEALTHCHECK: un contenedor colgado se ve «verde» indefinidamente.');
      }
    },
  },
];

const archivos = ['backend/Dockerfile', 'frontend/Dockerfile']
  .map((r) => ({ rel: r, abs: path.join(RAIZ, r) }))
  .filter((x) => fs.existsSync(x.abs));

if (!archivos.length) {
  console.log('No hay Dockerfile que revisar.');
  process.exit(0);
}

for (const { rel, abs } of archivos) {
  const txt = sinComentarios(fs.readFileSync(abs, 'utf8'));
  for (const regla of REGLAS) {
    if (regla.aplica(rel)) regla.revisa(txt, rel);
  }
}

/* =============================================================================
   LOS FLUJOS DE INTEGRACION CONTINUA — anadido en el bloque 47
   -----------------------------------------------------------------------------
   NACE DE UN FALLO REAL, Y DE LOS QUE PEOR SE DIAGNOSTICAN.

   El trabajo «Arranque real» declara `NODE_ENV: production` a nivel de job,
   porque es el modo en el que corre Pisco. Pero esa variable la ve TODO el
   trabajo, `npm ci` incluido — y npm, al leer NODE_ENV=production, se salta
   las devDependencies SIN DECIR NADA y termina en verde.

   El trabajo moria tres pasos despues con `sh: 1: nest: not found`, que
   apunta al compilador de NestJS y no tiene nada que ver: el paso culpable
   habia salido con una marca verde.

   Es exactamente el patron que este proyecto persigue: el paso que falla no
   es el que se queja. Por eso la regla se comprueba sola.
   ============================================================================= */
const YAML_DIR = path.join(RAIZ, '.github', 'workflows');
let flujos = 0;

if (fs.existsSync(YAML_DIR)) {
  for (const nombre of fs.readdirSync(YAML_DIR).filter((x) => /\.ya?ml$/.test(x))) {
    const rel = `.github/workflows/${nombre}`;
    const txt = fs.readFileSync(path.join(YAML_DIR, nombre), 'utf8');
    flujos++;

    /* Se parte por trabajo para no confundir un `NODE_ENV` de un job con el
       `npm ci` de otro. Los jobs son las claves con dos espacios de sangria. */
    const bloques = txt.split(/\n(?=  \w[\w-]*:\n)/);
    for (const bloque of bloques) {
      const enProduccion = /NODE_ENV:\s*['"]?production['"]?/.test(bloque);
      if (!enProduccion) continue;
      for (const linea of bloque.split('\n')) {
        /* Solo lineas de EJECUCION. Se aprendio en el acto: la primera version
           se quejaba del comentario que explica esta misma regla, porque la
           frase menciona `npm ci`. Un verificador que salta con su propia
           documentacion ensena a silenciarlo. */
        if (/^\s*#/.test(linea)) continue;
        if (!/^\s*(run:|-)\s/.test(linea)) continue;
        if (!/npm ci\b/.test(linea)) continue;
        if (/--include=dev/.test(linea)) continue;
        fallar(
          rel,
          'un trabajo con NODE_ENV=production ejecuta `npm ci` sin '
          + '`--include=dev`. npm se saltara las devDependencies en silencio y '
          + 'el paso de compilar morira con «nest: not found», tres pasos mas '
          + 'abajo y sin relacion aparente.',
        );
      }
    }
  }
}

console.log(`\nDespliegue: ${archivos.length} Dockerfile y ${flujos} flujo(s) de CI revisados contra ${REGLAS.length} reglas.`);

if (errores) {
  console.error(`\n${errores} problema(s) que pueden costar datos o superficie de ataque.`);
  console.error('Ninguno rompe el despliegue: por eso llevaban meses ahí.');
  process.exit(1);
}
if (avisos) console.log(`${avisos} aviso(s), ninguno bloqueante.`);
else console.log('Sin hallazgos.');
