#!/usr/bin/env node
/**
 * DESFASE ENTRE schema.prisma Y LAS MIGRACIONES — SIN BASE DE DATOS.
 *
 * POR QUÉ EXISTE
 * La CI tiene un paso que hace exactamente esta comprobación:
 *
 *     npx prisma migrate diff --from-migrations ./prisma/migrations \
 *                             --to-schema-datamodel ./prisma/schema.prisma
 *
 * Pero necesita una base de datos "sombra" para funcionar. Es decir: sólo se
 * entera uno cuando ya ha hecho push y GitHub le manda el correo de fallo.
 * Ese es el aviso que llega tarde y de mal humor.
 *
 * Esto hace la comprobación LEYENDO: monta el esquema que resultaría de
 * aplicar todas las migraciones en orden, y lo compara con schema.prisma.
 * No necesita base de datos, tarda medio segundo, y corre antes del push.
 *
 * NO SUSTITUYE al paso de la CI: `migrate diff` compara con todo el detalle
 * de PostgreSQL y esto compara tablas, columnas y tipos enumerados, que es
 * donde se produce el 95% de los desfases. Lo que hace es que casi nunca
 * llegues a ver ese correo.
 *
 * Uso:  node scripts/verificar-migraciones.js
 */
const fs = require('fs');
const path = require('path');

const DIR_MIG = path.join(__dirname, '..', 'prisma', 'migrations');
const SCHEMA = path.join(__dirname, '..', 'prisma', 'schema.prisma');

// ---------------------------------------------------------------- SCHEMA

/** Modelos de schema.prisma -> tabla real y columnas reales. */
function leerSchema() {
  const txt = fs.readFileSync(SCHEMA, 'utf8');
  const tablas = new Map();   // nombreTabla -> Set(columnas)
  const enums = new Set();

  for (const m of txt.matchAll(/enum\s+(\w+)\s*\{/g)) enums.add(m[1]);

  for (const m of txt.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    const modelo = m[1];
    const cuerpo = m[2];
    const mapa = /@@map\("([^"]+)"\)/.exec(cuerpo);
    const tabla = mapa ? mapa[1] : modelo;
    const cols = new Set();

    for (const linea of cuerpo.split('\n')) {
      const l = linea.trim();
      if (!l || l.startsWith('//') || l.startsWith('@@') || l.startsWith('///')) continue;
      const campo = /^(\w+)\s+([\w\[\]?]+)/.exec(l);
      if (!campo) continue;
      const [, nombre, tipo] = campo;

      // Las relaciones no son columnas. Se distinguen porque su tipo es otro
      // MODELO (empieza en mayúscula y no es un tipo escalar ni un enum).
      const base = tipo.replace(/[\[\]?]/g, '');
      const escalares = ['String', 'Int', 'BigInt', 'Float', 'Decimal', 'Boolean', 'DateTime', 'Json', 'Bytes'];
      const esRelacion = /^[A-Z]/.test(base) && !escalares.includes(base) && !enums.has(base);
      if (esRelacion) continue;
      // Las listas escalares (String[]) sí son columnas; las listas de
      // relación ya se han descartado arriba.

      const nombreCol = (/@map\("([^"]+)"\)/.exec(l) || [])[1] || nombre;
      cols.add(nombreCol);
    }
    tablas.set(tabla, cols);
  }
  return { tablas, enums };
}

// ------------------------------------------------------------ MIGRACIONES

/** Aplica mentalmente todas las migraciones y devuelve el esquema resultante. */
function leerMigraciones() {
  const tablas = new Map();
  const enums = new Set();

  const carpetas = fs.readdirSync(DIR_MIG, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();   // el mismo orden en que las aplica Prisma

  for (const c of carpetas) {
    const f = path.join(DIR_MIG, c, 'migration.sql');
    if (!fs.existsSync(f)) continue;
    // Sin comentarios: un CREATE TABLE dentro de una nota no cuenta.
    const sql = fs.readFileSync(f, 'utf8')
      .replace(/--[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');

    for (const m of sql.matchAll(/CREATE\s+TYPE\s+"?(\w+)"?/gi)) enums.add(m[1]);
    for (const m of sql.matchAll(/DROP\s+TYPE\s+(?:IF\s+EXISTS\s+)?"?(\w+)"?/gi)) enums.delete(m[1]);

    // CREATE TABLE ... ( ... )
    for (const m of sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([\w.]+)"?\s*\(([\s\S]*?)\n\s*\)\s*;/gi)) {
      const tabla = m[1].replace(/^public\./, '');
      const cols = tablas.get(tabla) || new Set();
      for (const linea of m[2].split('\n')) {
        const l = linea.trim().replace(/,$/, '');
        if (!l) continue;
        if (/^(CONSTRAINT|PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK)\b/i.test(l)) continue;
        const col = /^"([^"]+)"/.exec(l);
        if (col) cols.add(col[1]);
      }
      tablas.set(tabla, cols);
    }

    // ALTER TABLE se procesa por SENTENCIA COMPLETA, no por trozo.
    //
    // Prisma genera esto:
    //
    //     ALTER TABLE "work_orders" ALTER COLUMN "assetId" DROP NOT NULL,
    //     ADD COLUMN     "locationId" TEXT,
    //     ADD COLUMN     "requestedBy" TEXT;
    //
    // Es UNA sentencia con varias cláusulas separadas por comas. La primera
    // versión de este verificador buscaba el patrón 'ALTER TABLE ... ADD
    // COLUMN' pegado, así que sólo veía la primera cláusula —y ni eso, si la
    // primera era un ALTER COLUMN—. Resultado: 22 columnas dadas por
    // ausentes que llevaban meses en la base.
    //
    // Ahora se parte por ';' y dentro de cada sentencia se buscan TODAS las
    // cláusulas. Es como lo lee PostgreSQL.
    for (const sentencia of sql.split(';')) {
      const cab = /ALTER\s+TABLE\s+(?:ONLY\s+)?"?([\w.]+)"?/i.exec(sentencia);
      if (!cab) continue;
      const tabla = cab[1].replace(/^public\./, '');

      for (const m of sentencia.matchAll(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/gi)) {
        if (!tablas.has(tabla)) tablas.set(tabla, new Set());
        tablas.get(tabla).add(m[1]);
      }
      for (const m of sentencia.matchAll(/DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?"([^"]+)"/gi)) {
        tablas.get(tabla)?.delete(m[1]);
      }
      for (const m of sentencia.matchAll(/RENAME\s+COLUMN\s+"([^"]+)"\s+TO\s+"([^"]+)"/gi)) {
        const t = tablas.get(tabla);
        if (t) { t.delete(m[1]); t.add(m[2]); }
      }
    }
    for (const m of sql.matchAll(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?"?([\w.]+)"?/gi)) {
      tablas.delete(m[1].replace(/^public\./, ''));
    }
    for (const m of sql.matchAll(/ALTER\s+TABLE\s+"?([\w.]+)"?\s+RENAME\s+TO\s+"?([\w.]+)"?/gi)) {
      const viejo = m[1].replace(/^public\./, '');
      if (tablas.has(viejo)) { tablas.set(m[2].replace(/^public\./, ''), tablas.get(viejo)); tablas.delete(viejo); }
    }
  }
  return { tablas, enums, carpetas };
}

// ------------------------------------------------------------ COMPARACIÓN

const S = leerSchema();
const M = leerMigraciones();
const problemas = [];

for (const [tabla, cols] of S.tablas) {
  if (!M.tablas.has(tabla)) {
    problemas.push(`Tabla "${tabla}" está en schema.prisma pero NINGUNA migración la crea.`);
    continue;
  }
  const enMig = M.tablas.get(tabla);
  for (const c of cols) {
    if (!enMig.has(c)) {
      problemas.push(`Columna "${tabla}"."${c}" está en schema.prisma pero no en las migraciones.`);
    }
  }
}
for (const e of S.enums) {
  if (!M.enums.has(e)) problemas.push(`Tipo enumerado "${e}" está en schema.prisma pero no en las migraciones.`);
}

// Al revés sólo se avisa, no se falla: una columna que existe en la base y ya
// no en el esquema puede ser algo conservado a propósito.
const sobran = [];
for (const [tabla, cols] of M.tablas) {
  if (!S.tablas.has(tabla)) { sobran.push(`tabla ${tabla}`); continue; }
  for (const c of cols) if (!S.tablas.get(tabla).has(c)) sobran.push(`${tabla}.${c}`);
}

console.log(`\n  ${M.carpetas.length} migraciones · ${S.tablas.size} modelos · ${S.enums.size} enums\n`);

// ---------------------------------------------------------------------------
//  ¿FALTA HISTORIAL, O DE VERDAD HAY DESFASE?
//
//  Son dos situaciones distintas y confundirlas hace inútil la herramienta.
//  Si faltan las tablas del núcleo -usuarios, activos, ubicaciones- no es que
//  alguien haya cambiado el esquema sin migrar: es que no se están leyendo
//  todas las migraciones. Pasa cuando falta la carpeta del baseline, o cuando
//  se trabaja sobre una copia incompleta del repositorio.
//
//  Decirlo así evita que alguien vea doscientos errores, deduzca que la
//  herramienta miente y no la vuelva a mirar.
// ---------------------------------------------------------------------------
//  LA SEÑAL BUENA no es "falta la tabla": una tabla aparece en el mapa en
//  cuanto una migración posterior le hace ALTER TABLE ADD COLUMN, aunque
//  nunca se haya visto su CREATE TABLE. Así que una tabla del núcleo puede
//  existir con dos columnas y parecer que sólo le faltan las demás.
//
//  La señal fiable es que le falte su PROPIA CLAVE PRIMARIA: ninguna
//  migración crea una tabla sin `id`. Si `users` no tiene `id`, es que su
//  CREATE TABLE no se ha leído — falta historial, no hay desfase.
const NUCLEO = ['users', 'roles', 'assets', 'locations', 'work_orders', 'incidents'];
const faltanDelNucleo = NUCLEO.filter(
  (t) => S.tablas.has(t) && (!M.tablas.has(t) || !M.tablas.get(t).has('id')),
);
if (faltanDelNucleo.length >= 3) {
  console.error('  NO SE PUEDEN COMPARAR: falta historial de migraciones.\n');
  console.error(`    Ninguna migración crea (con su clave primaria): ${faltanDelNucleo.join(', ')}.`);
  console.error('    Eso no es un desfase: son las tablas del núcleo, y existen');
  console.error('    desde el principio. Lo que falta es la migración que las creó.\n');
  console.error('    Comprueba que está la carpeta del baseline en prisma/migrations,');
  console.error('    y que la copia del repositorio está completa.\n');
  process.exit(2);
}

if (sobran.length) {
  console.log('  Existen en las migraciones y no en el esquema (suele ser a proposito):');
  console.log('    ' + sobran.slice(0, 12).join(', ') + (sobran.length > 12 ? ` … y ${sobran.length - 12} más` : ''));
  console.log('');
}

if (problemas.length) {
  console.error('  DESFASE — la CI va a fallar en "Migraciones":\n');
  problemas.forEach((p) => console.error('    · ' + p));
  console.error('\n  Solucion: cd backend && npx prisma migrate dev --name <nombre-del-cambio>');
  console.error('  O escribe la migracion a mano, si prefieres controlar el SQL.\n');
  process.exit(1);
}

console.log('  Sin desfase: todo lo del esquema está creado por alguna migración.\n');
