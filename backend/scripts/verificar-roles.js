/* =============================================================================
   VERIFICADOR 12 — ROLES Y PERMISOS, DE PUNTA A PUNTA
   -----------------------------------------------------------------------------
   QUÉ COMPRUEBA
   El control de acceso está repartido en cinco sitios que nadie obliga a
   coincidir:

     1. `prisma/seed.ts`                 — el catálogo REAL: qué permisos y
                                            roles existen en la base.
     2. `@RequirePermissions('x')`        — lo que el backend exige.
     3. `src/modules/roles/catalogo-permisos.ts` — lo que el ingeniero ve al
                                            armar un rol.
     4. `can('x')` en el frontend         — lo que decide si se pinta un botón.
     5. `user.role === 'Nombre'`          — comprobaciones por NOMBRE de rol.

   Si uno se desincroniza, no revienta nada: el sistema sigue funcionando y
   simplemente DEJA DE PROTEGER, o esconde una pantalla para siempre. Es el
   peor tipo de fallo, porque no se nota hasta que alguien audita.

   Los tres desfases que busca:

     · Un permiso EXIGIDO por un endpoint que no existe en el catálogo.
       Nadie lo tendrá nunca -> el endpoint queda muerto para todo el mundo.
     · Un permiso del catálogo que NADIE exige.
       Se puede marcar en un rol y no sirve de nada: da falsa sensación.
     · Un NOMBRE DE ROL escrito a mano en el código que no existe en la
       semilla. La comprobación nunca se cumple -> la restricción no existe,
       o la función no se ejecuta jamás.

   Y avisa (sin fallar) de la deuda estructural: cada `role === 'texto'` es
   una regla que no se puede cambiar desde la pantalla de Roles. Se pueden
   permitir algunas, pero hay que saber cuántas hay y dónde.
============================================================================= */
const fs = require('fs');
const path = require('path');

const RAIZ_BACK = path.join(__dirname, '..');
const RAIZ_FRONT = path.join(RAIZ_BACK, '..', 'frontend', 'src');

/** Lee todos los .ts/.tsx de un árbol. */
function archivos(dir, exts = ['.ts', '.tsx']) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', 'dist', '.git'].includes(e.name)) continue;
      out.push(...archivos(p, exts));
    } else if (exts.includes(path.extname(e.name))) out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(path.join(RAIZ_BACK, '..'), p).replace(/\\/g, '/');

// --- 1. El catálogo real: la semilla -----------------------------------------
const seed = fs.readFileSync(path.join(RAIZ_BACK, 'prisma', 'seed.ts'), 'utf8');

const bloquePermisos = seed.match(/const PERMISSIONS\s*=\s*\[([\s\S]*?)\];/);
if (!bloquePermisos) { console.error('No encuentro PERMISSIONS en seed.ts'); process.exit(1); }
const PERMISOS_SEMILLA = new Set(
  [...bloquePermisos[1].matchAll(/'([^']+)'/g)].map((m) => m[1]),
);

const bloqueRoles = seed.match(/const ROLES:\s*Record<string,\s*string\[\]>\s*=\s*\{([\s\S]*?)\n\};/);
if (!bloqueRoles) { console.error('No encuentro ROLES en seed.ts'); process.exit(1); }
/* Claves de primer nivel. OJO: un rol puede recibir un array literal
   (`'Técnico': [`) o una constante (`'Jefe de Mantenimiento': PERMISSIONS,`).
   La primera versión de esta expresión sólo veía la primera forma y daba por
   inexistente al rol con más poder del sistema — un falso positivo que habría
   mandado a corregir algo que estaba bien. */
const ROLES_SEMILLA = new Set(
  [...bloqueRoles[1].matchAll(/^\s{2}'([^']+)':\s*(?:\[|[A-Z_]+\s*,)/gm)].map((m) => m[1]),
);

// --- 2. Lo que exige el backend ----------------------------------------------
const exigidos = new Map();   // permiso -> [archivos]
for (const f of archivos(path.join(RAIZ_BACK, 'src'))) {
  if (f.endsWith('.spec.ts')) continue;
  const txt = fs.readFileSync(f, 'utf8');
  for (const m of txt.matchAll(/@RequirePermissions\(([^)]*)\)/g)) {
    for (const p of m[1].matchAll(/'([^']+)'/g)) {
      if (!exigidos.has(p[1])) exigidos.set(p[1], []);
      exigidos.get(p[1]).push(rel(f));
    }
  }
}

// --- 3. El catálogo que ve el ingeniero --------------------------------------
const catTxt = fs.readFileSync(
  path.join(RAIZ_BACK, 'src', 'modules', 'roles', 'catalogo-permisos.ts'), 'utf8');
const EN_CATALOGO = new Set([...catTxt.matchAll(/code:\s*'([^']+)'/g)].map((m) => m[1]));

// --- 4. Lo que usa el frontend -----------------------------------------------
const enFront = new Map();
for (const f of archivos(RAIZ_FRONT)) {
  const txt = fs.readFileSync(f, 'utf8');
  for (const m of txt.matchAll(/\bcan\(\s*'([^']+)'\s*\)/g)) {
    if (!enFront.has(m[1])) enFront.set(m[1], []);
    enFront.get(m[1]).push(rel(f));
  }
}

// --- 5. Comprobaciones por NOMBRE de rol -------------------------------------
const porNombre = new Map();  // nombre -> [archivos]
const PATRONES = [
  /role\s*===\s*'([^']+)'/g,
  /role\s*!==\s*'([^']+)'/g,
  /ROL_[A-Z_]*\s*=\s*'([^']+)'/g,
  /rol\s*===\s*'([^']+)'/g,
  /name:\s*\{\s*in:\s*\[([^\]]+)\]/g,
];
for (const f of [...archivos(path.join(RAIZ_BACK, 'src')), ...archivos(RAIZ_FRONT)]) {
  if (f.endsWith('.spec.ts')) continue;
  const txt = fs.readFileSync(f, 'utf8');
  for (const re of PATRONES) {
    for (const m of txt.matchAll(re)) {
      for (const g of String(m[1]).matchAll(/'?([A-ZÁÉÍÓÚÑ][^',]*)'?/g)) {
        const nombre = g[1].trim().replace(/^'|'$/g, '');
        // Se filtran los enums en MAYÚSCULAS (CERRADA, ALTA…): no son roles.
        if (!nombre || nombre === nombre.toUpperCase()) continue;
        if (!porNombre.has(nombre)) porNombre.set(nombre, []);
        if (!porNombre.get(nombre).includes(rel(f))) porNombre.get(nombre).push(rel(f));
      }
    }
  }
}

// =============================================================================
//  Informe
// =============================================================================
let errores = 0;
const avisar = (t) => console.log('  \x1b[33m[AVISO]\x1b[0m ' + t);
const fallar = (t) => { errores++; console.log('  \x1b[31m[ERROR]\x1b[0m ' + t); };

console.log(`Catálogo: ${PERMISOS_SEMILLA.size} permisos, ${ROLES_SEMILLA.size} roles en la semilla.\n`);

// A) Permisos exigidos que no existen -> endpoint inalcanzable para todos.
console.log('A) Permisos que el backend exige y NO están en el catálogo');
let a = 0;
for (const [p, files] of [...exigidos].sort()) {
  if (!PERMISOS_SEMILLA.has(p)) {
    fallar(`«${p}» se exige en ${files.length} sitio(s) y nadie puede tenerlo.`);
    console.log('           ' + [...new Set(files)].slice(0, 3).join(', '));
    a++;
  }
}
if (!a) console.log('   Ninguno. Todo lo que se exige se puede conceder.');

// B) Permisos del frontend que no existen -> botón escondido para siempre.
console.log('\nB) Permisos que el frontend consulta y NO están en el catálogo');
let b = 0;
for (const [p, files] of [...enFront].sort()) {
  if (!PERMISOS_SEMILLA.has(p)) {
    fallar(`«${p}» se consulta con can() y no existe: ese botón no se pinta nunca.`);
    console.log('           ' + [...new Set(files)].slice(0, 3).join(', '));
    b++;
  }
}
if (!b) console.log('   Ninguno.');

// C) Nombres de rol escritos a mano que no existen en la semilla.
console.log('\nC) Nombres de rol comparados en el código que NO existen en la semilla');
let c = 0;
for (const [nombre, files] of [...porNombre].sort()) {
  if (!ROLES_SEMILLA.has(nombre)) {
    fallar(`El rol «${nombre}» se compara en el código y no existe: la regla nunca se cumple.`);
    console.log('           ' + files.slice(0, 3).join(', '));
    c++;
  }
}
if (!c) console.log('   Ninguno.');

// D) Permisos que existen pero nadie exige -> falsa sensación de control.
console.log('\nD) Permisos del catálogo que NADIE exige (aviso, no error)');
const huerfanos = [...PERMISOS_SEMILLA].filter((p) => !exigidos.has(p) && !enFront.has(p)).sort();
if (huerfanos.length) {
  avisar(`${huerfanos.length}: se pueden marcar en un rol y no protegen nada.`);
  console.log('           ' + huerfanos.join(', '));
} else console.log('   Ninguno.');

// E) Permisos sin describir en el catálogo del ingeniero.
console.log('\nE) Permisos sin descripción en la pantalla de Roles (aviso)');
const sinDescribir = [...PERMISOS_SEMILLA].filter((p) => !EN_CATALOGO.has(p)).sort();
if (sinDescribir.length) {
  avisar(`${sinDescribir.length}: salen como código suelto y se marcan «por si acaso».`);
  console.log('           ' + sinDescribir.join(', '));
} else console.log('   Ninguno.');

// E2) Al revés: descrito en la pantalla pero inexistente en el catálogo real.
console.log('\nE2) Permisos descritos en la pantalla de Roles que NO existen');
let e2 = 0;
for (const p of [...EN_CATALOGO].sort()) {
  if (!PERMISOS_SEMILLA.has(p)) {
    fallar(`«${p}» se ofrece al armar un rol y no existe: se marca y no hace nada.`);
    e2++;
  }
}
if (!e2) console.log('   Ninguno.');

// G) Las PLANTILLAS: perfiles listos que ofrece la pantalla de Roles.
//    Una plantilla con un permiso inexistente se aplica «bien» y deja al rol
//    con menos de lo que promete, sin decir nada.
console.log('\nG) Plantillas de rol con permisos que no existen');
let g = 0;
{
  const bloque = catTxt.match(/PLANTILLAS_DE_ROL[\s\S]*?\n\];/);
  if (bloque) {
    for (const p of bloque[0].matchAll(/nombre:\s*'([^']+)'[\s\S]*?permisos:\s*\[([^\]]*)\]/g)) {
      const fuera = [...p[2].matchAll(/'([^']+)'/g)]
        .map((x) => x[1]).filter((c) => !PERMISOS_SEMILLA.has(c));
      if (fuera.length) {
        fallar(`La plantilla «${p[1]}» ofrece permisos que no existen: ${fuera.join(', ')}.`);
        g++;
      }
    }
  }
}
if (!g) console.log('   Ninguna. Todas las plantillas conceden permisos reales.');

// F) Deuda estructural: reglas por nombre de rol.
console.log('\nF) Reglas atadas al NOMBRE del rol (deuda, no error)');
const sitios = new Set();
for (const files of porNombre.values()) for (const f of files) sitios.add(f);
if (sitios.size) {
  avisar(`${porNombre.size} rol(es) comparados por nombre en ${sitios.size} archivo(s).`);
  console.log('           Esas reglas NO se pueden cambiar desde la pantalla de Roles:');
  console.log('           renombrar el rol en la base las desactiva en silencio.');
  for (const [n, f] of porNombre) console.log(`           · «${n}» -> ${f.join(', ')}`);
} else console.log('   Ninguna.');

console.log('');
if (errores) {
  console.error(`Roles: ${errores} desfase(s) que rompen el control de acceso.`);
  process.exit(1);
}
console.log('Roles verificados: el catálogo, el backend y el frontend dicen lo mismo.');
