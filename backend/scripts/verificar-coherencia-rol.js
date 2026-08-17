/* =============================================================================
   VERIFICADOR 18 — UN ROL DE OBSERVACIÓN NO PUEDE LLEVAR LLAVES DE OPERACIÓN
   -----------------------------------------------------------------------------
   POR QUÉ EXISTE

   Se vio en planta: un usuario con rol de Producción tenía en el menú
   Gabinetes, Cableado, Electricidad, Campañas de mapeo, Conexiones, Mi
   bandeja, Dashboard e Indicadores. Todo el módulo de infraestructura.

   Nadie lo hizo mal a propósito. Pasó por dos motivos a la vez:

     1. Las pantallas de Producción colgaban de permisos de MANTENIMIENTO.
        Para ver «Mi cobertura» había que dar `dashboard.read`, que abre el
        tablero de gestión entero. Corregido en el bloque 42 con `cobertura.mirar`
        y `activos.mirar`.

     2. La pantalla de Roles deja armar un rol marcando cuarenta casillas, y
        nada avisa de que acabas de darle a un observador las llaves del
        módulo de infraestructura.

   Este verificador ataca el segundo. No puede impedir que alguien marque
   casillas en producción —eso es un dato, no código— pero sí impide que las
   PLANTILLAS de la semilla, que es de donde salen los roles nuevos, vuelvan a
   nacer incoherentes.

   -----------------------------------------------------------------------------
   QUÉ ES UN ROL DE OBSERVACIÓN

   El que tiene alguna llave `*.mirar`. Esa familia se creó justo para esto:
   son permisos de sólo lectura, estrechos, y de una sola pantalla.

   Un rol puede ser observador Y operador a la vez —el Jefe de Producción mira
   sus cámaras y además ve el tablero, y está bien— así que la lista de
   EXENTOS existe y cada nombre lleva escrito su porqué. Lo que NO puede pasar
   es que se añada una exención sin motivo.
============================================================================= */
const fs = require('fs');
const path = require('path');

const SEED = path.join(__dirname, '..', 'prisma', 'seed.ts');

/** La familia de llaves estrechas de observación (bloques 39 y 42). */
const MIRAR = /\.mirar$/;

/**
 * Permisos que abren módulos que un observador no debería tener.
 *
 * No están TODOS los permisos de escritura: están los que ABREN UNA SECCIÓN
 * DEL MENÚ. Es lo que se vio en la pantalla, y es lo que molesta.
 */
const DE_OPERACION = {
  'asset.read': 'abre el módulo de Activos y con él la sección INFRAESTRUCTURA entera',
  'asset.create': 'dar de alta equipos es de Mantenimiento',
  'asset.update': 'editar la ficha técnica es de quien la mantiene',
  'asset.delete': 'borrar activos',
  'wo.read': 'abre las trescientas órdenes de la planta; para ver la de su cámara está om.mirar',
  'wo.update': 'trabajar la orden es de campo',
  'wo.approve': 'aprobar órdenes',
  'inventory.read': 'el almacén es de Mantenimiento',
  'inventory.manage': 'mover el almacén',
  'credential.read': 'las credenciales de los equipos',
  'credential.manage': 'gestionar credenciales',
  'monitor.manage': 'configurar el monitoreo',
  'user.manage': 'administrar personas',
  'role.manage': 'administrar roles',
  'audit.read': 'la auditoría del sistema',
};

/**
 * Roles a los que se les permite ser observadores Y operadores.
 * CADA UNO LLEVA SU MOTIVO ESCRITO, y el verificador exige que lo lleve.
 */
const EXENTOS = {
  'Jefe de Mantenimiento':
    'Es el administrador del sistema: tiene todos los permisos por definición.',
  'Jefe de Producción':
    'Arrastra permisos de lectura de Mantenimiento por compatibilidad con los '
    + 'usuarios que ya lo tienen. Está SECTORIZADO igual que el Jefe de Tren, '
    + 'así que sólo los aplica sobre su propia línea. Al migrar esos usuarios a '
    + '«Jefe de Tren» esta exención se borra.',
};

const texto = fs.readFileSync(SEED, 'utf8');

/* Los comentarios se quitan antes de buscar. La lección de `verificar-roles`:
   un verificador que castiga documentar el porqué acaba enseñando a no
   documentarlo, y estas plantillas necesitan su explicación al lado. */
const limpio = texto
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Extrae `'Nombre del rol': [ 'perm', 'perm' ]` del bloque ROLES. */
function plantillas() {
  const bloque = limpio.match(/const ROLES:[\s\S]*?\n\};/);
  if (!bloque) {
    console.error('No se encontró el bloque `const ROLES` en la semilla.');
    process.exit(1);
  }
  const out = [];
  const re = /'([^']+)':\s*(\[[\s\S]*?\]|PERMISSIONS)/g;
  let m;
  while ((m = re.exec(bloque[0])) !== null) {
    const nombre = m[1];
    if (m[2] === 'PERMISSIONS') { out.push({ nombre, todos: true, permisos: [] }); continue; }
    const permisos = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    out.push({ nombre, todos: false, permisos });
  }
  return out;
}

let errores = 0;
const roles = plantillas();

console.log(`\nCoherencia de rol: ${roles.length} plantillas en la semilla.\n`);

for (const r of roles) {
  const esObservador = r.permisos.some((p) => MIRAR.test(p));
  if (!esObservador && !r.todos) continue;

  if (EXENTOS[r.nombre]) {
    console.log(`  [EXENTO] ${r.nombre}`);
    console.log(`           ${EXENTOS[r.nombre]}`);
    continue;
  }
  if (r.todos) {
    errores++;
    console.error(`  [ERROR] ${r.nombre} recibe TODOS los permisos y no está exento.`);
    continue;
  }

  const chocan = r.permisos.filter((p) => DE_OPERACION[p]);
  if (chocan.length) {
    errores++;
    console.error(`  [ERROR] ${r.nombre} es un rol de observación (tiene ${
      r.permisos.filter((p) => MIRAR.test(p)).join(', ')}) pero lleva:`);
    for (const p of chocan) console.error(`            · ${p} — ${DE_OPERACION[p]}`);
  } else {
    console.log(`  [OK] ${r.nombre}: ${r.permisos.length} permisos, ninguno de operación.`);
  }
}

/* Y al revés: una exención escrita para un rol que ya no existe es basura que
   con el tiempo tapa un rol nuevo con el mismo nombre. */
for (const nombre of Object.keys(EXENTOS)) {
  if (!roles.some((r) => r.nombre === nombre)) {
    errores++;
    console.error(`\n  [ERROR] Hay una exención escrita para «${nombre}», que ya no existe en la semilla.`);
    console.error('          Bórrala: una exención huérfana acabaría cubriendo a un rol futuro con ese nombre.');
  }
}

if (errores) {
  console.error(
    `\n${errores} problema(s) de coherencia.\n`
    + 'Un rol de observación con permisos de operación le abre a Producción el\n'
    + 'módulo de Mantenimiento entero. Si el caso es legítimo, añádelo a EXENTOS\n'
    + 'CON SU MOTIVO en scripts/verificar-coherencia-rol.js.\n',
  );
  process.exit(1);
}
console.log('\nCoherente: ningún rol de observación lleva llaves de operación.');
