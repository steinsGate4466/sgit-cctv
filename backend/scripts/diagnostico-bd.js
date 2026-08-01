// ============================================================================
//  SGIT-CCTV — DIAGNOSTICO DE DESFASE ENTRE EL ESQUEMA Y LA BASE REAL
//
//  POR QUE EXISTE
//  El 30/07/2026 faltaban en produccion una tabla y dos columnas que su
//  migracion decia haber creado. Causa: la migracion se edito DESPUES de
//  aplicarse. El CI no lo vio porque aplica las migraciones sobre una base
//  LIMPIA, donde todo funciona. Esto comprueba la base de VERDAD.
//
//  ---------------------------------------------------------------------------
//  POR QUE LEE EL ESQUEMA EN EL MOMENTO Y NO LLEVA UNA LISTA DENTRO
//
//  La primera version llevaba las 42 tablas y 389 columnas EMPOTRADAS, tal
//  como estaban el dia que se escribio. Dos bloques despues (3D y 3D-bis) esa
//  lista ya estaba vieja: no conocia work_order_materials.status ni ninguna de
//  las columnas nuevas, asi que NO habria detectado que faltaran.
//
//  Un verificador desactualizado es PEOR que no tener ninguno: da tranquilidad
//  falsa. Y la tranquilidad falsa es exactamente lo que nos llevo al desastre.
//
//  Ahora lee prisma/schema.prisma cada vez que se ejecuta. No se puede quedar
//  atras porque no guarda nada.
//  ---------------------------------------------------------------------------
//
//  QUE HACE
//   1) Lee el registro de migraciones (_prisma_migrations) con su estado.
//   2) Compara TODAS las tablas, columnas y tipos enumerados del esquema
//      actual contra los que existen de verdad.
//   3) Imprime SOLO las diferencias y sale con codigo 1 si falta algo, para
//      que sirva en el CI.
//
//  NO MODIFICA NADA. Es de solo lectura.
//
//  USO
//    cd backend
//    npm run verificar:bd                          (usa DATABASE_URL)
//    node scripts/diagnostico-bd.js "postgresql://..."
// ============================================================================
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

// ---------------------------------------------------------------------------
//  Lectura del esquema. Se saca de aqui lo que la base DEBERIA tener.
// ---------------------------------------------------------------------------
function leerEsquema() {
  const ruta = path.join(__dirname, '..', 'prisma', 'schema.prisma');
  if (!fs.existsSync(ruta)) {
    throw new Error(`No se encuentra el esquema en ${ruta}`);
  }
  const src = fs.readFileSync(ruta, 'utf8');

  const enums = [...src.matchAll(/^enum\s+(\w+)\s*\{/gm)].map((m) => m[1]);

  // Primero los nombres de modelo: hacen falta para distinguir una RELACION
  // (que no es columna) de un campo escalar.
  const nombresModelo = new Set([...src.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]));

  const esperado = {};
  for (const m of src.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const cuerpo = m[2];

    // El nombre real de la tabla puede diferir del modelo: @@map("...").
    const mapa = cuerpo.match(/@@map\("([^"]+)"\)/);
    const tabla = mapa ? mapa[1] : m[1];

    const columnas = [];
    for (const linea of cuerpo.split('\n')) {
      const t = linea.trim();
      if (!t || t.startsWith('//') || t.startsWith('@@')) continue;

      const f = t.match(/^(\w+)\s+(\w+)(\[\])?(\??)(.*)$/);
      if (!f) continue;
      const [, campo, tipo, lista, , resto] = f;

      // Una relacion no es una columna: la columna es su campo de clave ajena,
      // que se declara aparte.
      if (nombresModelo.has(tipo)) continue;
      // Las listas escalares (ej. WorkOrderType[]) las guarda Postgres como
      // array en la misma tabla, pero se omiten para no dar falsos positivos:
      // el comparador solo mira nombres.
      if (lista) continue;

      const conMapa = (resto || '').match(/@map\("([^"]+)"\)/);
      columnas.push(conMapa ? conMapa[1] : campo);
    }
    esperado[tabla] = columnas.sort();
  }

  return { esperado, enums };
}

const url = process.argv[2] || process.env.DATABASE_URL;
if (!url) {
  console.error('Falta la cadena de conexion. Pasala como argumento o en DATABASE_URL.');
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

// Nunca se imprime la cadena de conexion: lleva la contrasena.
function titulo(t) { console.log('\n' + '='.repeat(70) + '\n ' + t + '\n' + '='.repeat(70)); }

(async () => {
  try {
    const { esperado, enums } = leerEsquema();
    const nTablas = Object.keys(esperado).length;
    const nColumnas = Object.values(esperado).reduce((a, c) => a + c.length, 0);
    console.log(`Esquema leido en este momento: ${nTablas} tablas · ${nColumnas} columnas · ${enums.length} enums`);

    // ------------------------------------------------- 1. migraciones
    titulo('REGISTRO DE MIGRACIONES');
    let migs = [];
    try {
      migs = await prisma.$queryRawUnsafe(
        `SELECT migration_name, applied_steps_count,
                finished_at IS NOT NULL AS terminada,
                rolled_back_at IS NOT NULL AS revertida
         FROM _prisma_migrations ORDER BY started_at ASC`);
    } catch (e) {
      console.log('  No se pudo leer _prisma_migrations: ' + e.message.split('\n')[0]);
    }
    for (const m of migs) {
      const estado = m.revertida ? 'REVERTIDA' : (m.terminada ? 'ok' : 'SIN TERMINAR');
      const marca = estado === 'ok' ? '  ' : '>>';
      console.log(`${marca} ${String(m.migration_name).padEnd(48)} ${estado}  pasos=${m.applied_steps_count}`);
    }
    const problematicas = migs.filter((m) => m.revertida || !m.terminada);

    // ------------------------------------------------- 2. tablas y columnas
    const filas = await prisma.$queryRawUnsafe(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
       ORDER BY table_name, column_name`);
    const real = {};
    for (const f of filas) {
      if (!real[f.table_name]) real[f.table_name] = new Set();
      real[f.table_name].add(f.column_name);
    }

    titulo('TABLAS QUE FALTAN');
    const tablasFaltan = Object.keys(esperado).filter((t) => !real[t]).sort();
    if (!tablasFaltan.length) console.log(`  Ninguna. Las ${nTablas} tablas existen.`);
    else tablasFaltan.forEach((t) => console.log('  FALTA tabla: ' + t));

    titulo('COLUMNAS QUE FALTAN');
    let totalCols = 0;
    for (const t of Object.keys(esperado).sort()) {
      if (!real[t]) continue;
      const faltan = esperado[t].filter((c) => !real[t].has(c));
      if (faltan.length) {
        console.log(`  ${t}:`);
        faltan.forEach((c) => console.log('      FALTA  ' + c));
        totalCols += faltan.length;
      }
    }
    if (!totalCols) console.log(`  Ninguna. Las ${nColumnas} columnas existen.`);

    titulo('COLUMNAS DE SOBRA (existen en la base y no en el esquema)');
    let sobra = 0;
    for (const t of Object.keys(esperado).sort()) {
      if (!real[t]) continue;
      const extra = [...real[t]].filter((c) => !esperado[t].includes(c)).sort();
      if (extra.length) { console.log(`  ${t}: ` + extra.join(', ')); sobra += extra.length; }
    }
    if (!sobra) console.log('  Ninguna.');
    else {
      console.log('  (No siempre es un problema. Dos casos distintos:');
      console.log('    - columnas conservadas a proposito, como assets.train;');
      console.log('    - listas escalares como tools.suggestedFor, que este');
      console.log('      comparador omite. Eso es cosa mia, no un desfase.)');
    }

    // ------------------------------------------------- 3. enums
    titulo('TIPOS ENUMERADOS QUE FALTAN');
    const tipos = await prisma.$queryRawUnsafe(
      `SELECT t.typname FROM pg_type t
       JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE t.typtype = 'e' AND n.nspname = 'public'`);
    const existentes = new Set(tipos.map((x) => x.typname));
    const enumsFaltan = enums.filter((e) => !existentes.has(e));
    if (!enumsFaltan.length) console.log(`  Ninguno. Los ${enums.length} tipos existen.`);
    else enumsFaltan.forEach((e) => console.log('  FALTA enum: ' + e));

    // ------------------------------------------------- 4. veredicto
    titulo('VEREDICTO');
    const roto = tablasFaltan.length + totalCols + enumsFaltan.length;
    if (!roto) {
      console.log('  La base coincide con el esquema. No hay desfase.');
    } else {
      // Sale con error para que sirva en el CI: un desfase de produccion tiene
      // que ROMPER la comprobacion, no imprimir un aviso que nadie lee.
      process.exitCode = 1;
      console.log(`  ${tablasFaltan.length} tabla(s), ${totalCols} columna(s) y ${enumsFaltan.length} enum(s) sin crear.`);
      console.log('');
      console.log('  Esto NO se arregla relanzando las migraciones: las que');
      console.log('  figuran aplicadas no se vuelven a ejecutar. Hace falta una');
      console.log('  migracion de reparacion idempotente (ADD COLUMN IF NOT');
      console.log('  EXISTS), como 20260801000000_reparar_desfase_om.');
      console.log('');
      console.log('  Y la regla que evita que vuelva a pasar: una migracion ya');
      console.log('  aplicada es INMUTABLE. Lo que falto va en una NUEVA.');
    }
    if (problematicas.length) {
      console.log('');
      console.log('  ATENCION: hay migraciones marcadas REVERTIDA o SIN TERMINAR.');
    }
  } catch (e) {
    console.error('\nFALLO EL DIAGNOSTICO: ' + e.message.split('\n')[0]);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
