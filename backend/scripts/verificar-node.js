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

/**
 * Fin de vida oficial.
 * Fuente: github.com/nodejs/Release/blob/main/schedule.json
 */
const FIN_DE_VIDA = {
  16: '2023-09-11',
  18: '2025-04-30',
  20: '2026-04-30',
  22: '2027-04-30',
  24: '2028-04-30',
  26: '2029-04-30',
};

/* =============================================================================
   ENTRADA EN MANTENIMIENTO — el hueco que dejó pasar Node 22 (bloque 51-N)
   -----------------------------------------------------------------------------
   Este verificador sólo miraba el FIN DE VIDA. Node 22 entró en mantenimiento
   el 21/10/2025 y aquí no sonó nada, porque técnicamente le quedaba año y
   medio de parches de seguridad. El proyecto se quedó en 22 hasta que el
   usuario lo notó a mano en agosto de 2026, diez meses después.

   Mantenimiento significa: SÓLO parches críticos y de seguridad. Ni
   correcciones de rendimiento, ni compatibilidad con librerías nuevas, ni
   arreglos de fallos normales. Es la antesala del fin de vida y es EL momento
   de planificar el salto — no ocho meses antes de que muera, con prisa.

   Mismo argumento que el resto del archivo: una versión en mantenimiento no
   se rompe, sigue funcionando exactamente igual. Por eso nadie la actualiza.
============================================================================= */
const ENTRA_EN_MANTENIMIENTO = {
  18: '2023-10-18',
  20: '2024-10-22',
  22: '2025-10-21',
  24: '2026-10-20',
  26: '2027-10-20',
};

/** Cuándo hay que volver a mirar estas dos tablas. */
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

/* La versión con la que se ejecuta también se mira contra el mantenimiento.
   Es el aviso más útil de los dos: dice que TU máquina va por detrás, y eso
   es lo que hace que algo funcione en local y falle en el contenedor. */
const mantActual = ENTRA_EN_MANTENIMIENTO[mayorActual];
if (mantActual && dias(mantActual) < 0 && finActual && dias(finActual) >= 0) {
  avisar(
    `Node ${mayorActual} está en mantenimiento desde el ${mantActual}: sólo parches críticos.`,
  );
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

// ---- 3. Que las versiones declaradas no estén muertas NI EN MANTENIMIENTO ----
for (const v of declaradas.keys()) {
  const n = Number(v);
  const fin = FIN_DE_VIDA[n];
  if (fin && dias(fin) < 0) {
    fallar(`Se declara Node ${v}, que murió el ${fin}.`);
    continue;
  }

  /* Mantenimiento: sólo parches críticos. Es AVISO y no error a propósito —
     obligar a saltar el mismo día que una versión entra en mantenimiento
     rompería despliegues por calendario, no por necesidad. Pero tiene que
     SONAR: a Node 22 no le sonó nada durante diez meses. */
  const mant = ENTRA_EN_MANTENIMIENTO[n];
  if (mant && dias(mant) < 0) {
    const meses = Math.round(Math.abs(dias(mant)) / 30);
    const activa = Object.entries(ENTRA_EN_MANTENIMIENTO)
      .filter(([k, f]) => dias(f) > 0 && FIN_DE_VIDA[Number(k)])
      .sort((a, b) => Number(a[0]) - Number(b[0]))[0];
    avisar(
      `Node ${v} está EN MANTENIMIENTO desde el ${mant} (hace ${meses} meses): ` +
      'sólo parches críticos, sin correcciones normales ni compatibilidad nueva.' +
      (activa ? ` La LTS activa hoy es Node ${activa[0]}.` : ''),
    );
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
