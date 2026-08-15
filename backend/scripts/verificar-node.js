/* =============================================================================
   VERIFICADOR 13 — ¿ESTAMOS CORRIENDO UN NODE MUERTO?
   -----------------------------------------------------------------------------
   POR QUÉ EXISTE
   El 30 de abril de 2026 murió Node 20 y el proyecto siguió corriendo sobre él
   tres meses y medio: sin parches de seguridad, en producción, y sin que nada
   avisara. El único indicio fue una nota de GitHub Actions que se perdió entre
   los registros del CI.

   Una versión sin soporte no se rompe: sigue funcionando exactamente igual. Por
   eso nadie la actualiza — hasta que sale un CVE y hay que hacerlo con prisa un
   viernes. Es la misma clase de deuda que las declaraciones de zona que caducan:
   invisible hasta que duele.

   -----------------------------------------------------------------------------
   QUÉ COMPRUEBA
     1. Que la versión con la que se está EJECUTANDO esto no esté muerta.
     2. Que los Dockerfile, el CI y `engines` digan TODOS lo mismo. Tres sitios
        que declaran la versión y nadie los obliga a coincidir: el clásico.

   Las fechas están escritas a mano y con fuente. Hay que revisarlas una vez al
   año — y este archivo lo dice en voz alta cuando toca.
============================================================================= */
const fs = require('fs');
const path = require('path');

/** Fin de vida oficial. Fuente: nodejs.org/en/about/eol */
const FIN_DE_VIDA = {
  16: '2023-09-11',
  18: '2025-04-30',
  20: '2026-04-30',
  22: '2027-04-30',
  24: '2028-04-30',
};
/** Cuándo hay que volver a mirar esta tabla. */
const REVISAR_TABLA_ANTES_DE = '2027-01-31';

const RAIZ = path.join(__dirname, '..', '..');
const hoy = new Date();
const dias = (f) => Math.round((new Date(f).getTime() - hoy.getTime()) / 86_400_000);

let errores = 0;
const fallar = (t) => { errores++; console.error('  [ERROR] ' + t); };
const avisar = (t) => console.log('  [AVISO] ' + t);

// ---- 1. La versión con la que corre esto ahora mismo ----
const mayorActual = Number(process.versions.node.split('.')[0]);
const finActual = FIN_DE_VIDA[mayorActual];
console.log(`Ejecutando sobre Node ${process.versions.node}.`);

if (!finActual) {
  avisar(`No tengo la fecha de fin de vida de Node ${mayorActual}. Actualiza la tabla de este archivo.`);
} else if (dias(finActual) < 0) {
  fallar(
    `Node ${mayorActual} llegó a su fin de vida el ${finActual} ` +
    `(hace ${Math.abs(dias(finActual))} días). NO recibe parches de seguridad.`,
  );
} else if (dias(finActual) < 120) {
  avisar(`Node ${mayorActual} muere el ${finActual}, dentro de ${dias(finActual)} días. Planifica el salto.`);
}

// ---- 2. Que los tres sitios digan lo mismo ----
const declaradas = new Map();   // version -> [donde]
const anota = (v, donde) => {
  if (!declaradas.has(v)) declaradas.set(v, []);
  declaradas.get(v).push(donde);
};

for (const rel of ['backend/Dockerfile', 'frontend/Dockerfile']) {
  const p = path.join(RAIZ, rel);
  if (!fs.existsSync(p)) continue;
  for (const m of fs.readFileSync(p, 'utf8').matchAll(/FROM\s+node:(\d+)/g)) anota(m[1], rel);
}

const wf = path.join(RAIZ, '.github', 'workflows');
if (fs.existsSync(wf)) {
  for (const f of fs.readdirSync(wf).filter((x) => /\.ya?ml$/.test(x))) {
    const t = fs.readFileSync(path.join(wf, f), 'utf8');
    for (const m of t.matchAll(/node-version:\s*'?(\d+)/g)) anota(m[1], `.github/workflows/${f}`);
  }
}

for (const rel of ['backend/package.json', 'frontend/package.json']) {
  const p = path.join(RAIZ, rel);
  if (!fs.existsSync(p)) continue;
  const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
  const rango = pkg.engines?.node;
  if (!rango) {
    fallar(`${rel} no declara \`engines.node\`. Sin eso, npm no avisa si alguien compila con otra versión.`);
    continue;
  }
  const m = /(\d+)/.exec(rango);
  if (m) anota(m[1], `${rel} (engines)`);
}

console.log(`\nVersiones declaradas: ${[...declaradas.keys()].sort().join(', ') || 'ninguna'}`);
for (const [v, donde] of [...declaradas].sort()) {
  console.log(`   Node ${v}  ->  ${donde.join(', ')}`);
}

if (declaradas.size > 1) {
  fallar(
    'El proyecto declara MÁS DE UNA versión de Node. Se compila con una y se ' +
    'ejecuta con otra, y eso se descubre en producción.',
  );
}

// ---- 3. Que las versiones declaradas no estén muertas ----
for (const v of declaradas.keys()) {
  const fin = FIN_DE_VIDA[Number(v)];
  if (fin && dias(fin) < 0) {
    fallar(`Se declara Node ${v}, que murió el ${fin}.`);
  }
}

// ---- 4. Recordatorio de mantener la tabla viva ----
if (dias(REVISAR_TABLA_ANTES_DE) < 0) {
  avisar(
    `La tabla de fechas de este archivo no se revisa desde antes de ${REVISAR_TABLA_ANTES_DE}. ` +
    'Compruébala en nodejs.org/en/about/eol y sube la fecha.',
  );
}

if (errores) {
  console.error(`\nNode: ${errores} problema(s). Una versión sin soporte no se rompe — sigue`);
  console.error('funcionando igual. Por eso nadie la actualiza, hasta que sale un CVE.');
  process.exit(1);
}
console.log('\nNode verificado: versión con soporte y declarada igual en todas partes.');
