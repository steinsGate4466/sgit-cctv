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
  /** nombre de índice -> tabla. Sirve para comparar con los @@index/@@unique. */
  const indices = new Map();
  /** nombre de FK -> texto de la cláusula, para ver si trae ON UPDATE. */
  const fks = new Map();

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

    // ÍNDICES. Se guardan por NOMBRE porque es lo que compara `migrate diff`:
    // un índice correcto con el nombre equivocado cuenta como uno de más y
    // otro de menos. Fue lo que pasó con
    // notificaciones_salientes_estado_idx sobre (estado, proximoIntento).
    for (const m of sql.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([\w.]+)"?\s+ON\s+"?([\w.]+)"?\s*(?:USING\s+(\w+)\s*)?\(([^)]*)\)/gi)) {
      indices.set(m[1], {
        tabla: m[2].replace(/^public\./, ''),
        metodo: (m[3] || 'btree').toLowerCase(),
        columnas: m[4].split(',').map((c) => c.trim().replace(/"/g, '')),
      });
    }
    for (const m of sql.matchAll(/DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?"?([\w.]+)"?/gi)) indices.delete(m[1]);
    for (const m of sql.matchAll(/ALTER\s+INDEX\s+(?:IF\s+EXISTS\s+)?"?([\w.]+)"?\s+RENAME\s+TO\s+"?([\w.]+)"?/gi)) {
      const v = indices.get(m[1]);
      if (v) { indices.delete(m[1]); indices.set(m[2], v); }
    }

    // CLAVES FORÁNEAS. Prisma genera SIEMPRE ON DELETE ... ON UPDATE ...;
    // escribir sólo la primera hace que vea una clave distinta.
    for (const m of sql.matchAll(/ADD\s+CONSTRAINT\s+"?([\w.]+)"?\s+FOREIGN\s+KEY[\s\S]*?(?=;)/gi)) {
      fks.set(m[1], m[0]);
    }
    for (const m of sql.matchAll(/DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?"?([\w.]+)"?/gi)) fks.delete(m[1]);

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
  return { tablas, enums, carpetas, indices, fks };
}

// ------------------------------------------------------------ COMPARACIÓN

const S = leerSchema();
const M = leerMigraciones();
const problemas = [];
/**
 * Los problemas de ÍNDICE van APARTE, y esta separación tiene una historia.
 *
 * El nombre mal escrito de `ventanas_parada_inicioPrevisto_idx` llegó a la CI
 * porque en la copia donde se preparó el bloque faltaba la carpeta del
 * baseline. Sin ella, este script salía por la puerta de "falta historial"
 * ANTES de mirar los índices — y el fallo, que no dependía del historial
 * para nada, viajó hasta GitHub.
 *
 * Los índices se comparan por NOMBRE contra el esquema. Eso no necesita saber
 * qué tablas existían antes: sólo hace falta ver las migraciones que hay. Así
 * que ahora se avisan SIEMPRE, incluso cuando el resto de la comparación no
 * se puede hacer.
 */
const problemasIndice = [];
// Se declara aquí arriba porque la comprobación de índices ya lo usa.
const sobran = [];

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
// ---- ÍNDICES declarados en el esquema pero que ninguna migración crea ----
//
// Es el fallo que ya nos comió dos veces: crear el índice en el SQL y
// olvidar el @@index, o al revés. Aquí se cazan los dos sentidos.
{
  const txt = fs.readFileSync(SCHEMA, 'utf8');
  for (const m of txt.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    const cuerpo = m[2];
    const mapa = /@@map\("([^"]+)"\)/.exec(cuerpo);
    const tabla = mapa ? mapa[1] : m[1];
    for (const idx of cuerpo.matchAll(/@@(index|unique)\(\[([^\]]+)\]\)/g)) {
      const cols = idx[2].split(',').map((c) => c.trim());
      const sufijo = idx[1] === 'unique' ? 'key' : 'idx';
      const esperado = `${tabla}_${cols.join('_')}_${sufijo}`;
      const enMig = [...M.indices.keys()].includes(esperado);
      if (!enMig) {
        // Se guarda la TABLA además del mensaje: cuando falta historial hay
        // que poder quedarse sólo con las tablas cuyo CREATE TABLE sí se ha
        // leído. Los índices del baseline no son un fallo, es que no está.
        problemasIndice.push({
          tabla,
          texto: `Índice "${esperado}" (${tabla}: ${cols.join(', ')}) está en schema.prisma ` +
            'pero ninguna migración lo crea con ESE nombre.',
        });
      }
    }
  }
  /* ---- EL SENTIDO CONTRARIO: índice en el SQL que el esquema no declara ----
     Este es el que rompió la CI #89. La migración del bloque 26 creaba
     `locations_criticidadProduccion_idx` y el `@@index` no estaba en el
     esquema. `prisma migrate diff` lo ve como un índice de más y lo marca
     como desfase — con razón: si alguien regenera la migración desde el
     esquema, ese índice desaparece sin que nadie lo decida.

     Se recogen también los `@unique` de CAMPO (no sólo los `@@unique` de
     modelo): generan `<tabla>_<campo>_key` y sin contarlos saldrían decenas
     de falsos positivos. */
  const declarados = new Set();
  {
    const txt = fs.readFileSync(SCHEMA, 'utf8');
    for (const m of txt.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
      const cuerpo = m[2];
      const mapa = /@@map\("([^"]+)"\)/.exec(cuerpo);
      const tabla = mapa ? mapa[1] : m[1];
      for (const idx of cuerpo.matchAll(/@@(index|unique)\(\[([^\]]+)\]\)/g)) {
        const cols = idx[2].split(',').map((c) => c.trim());
        declarados.add(`${tabla}_${cols.join('_')}_${idx[1] === 'unique' ? 'key' : 'idx'}`);
      }
      // `campo Tipo @unique` y `campo Tipo @unique @map("otro_nombre")`
      for (const u of cuerpo.matchAll(/^\s*(\w+)\s+[\w?[\]]+[^\n]*@unique[^\n]*$/gm)) {
        const linea = u[0];
        const col = /@map\("([^"]+)"\)/.exec(linea)?.[1] || u[1];
        declarados.add(`${tabla}_${col}_key`);
      }
    }
  }

  for (const [nombre, i] of M.indices) {
    if (i.metodo !== 'btree') {
      sobran.push(`índice ${nombre} (${i.metodo}: Prisma no sabe expresarlo)`);
      continue;
    }
    // Sólo se exige para tablas cuyo CREATE TABLE se ha leído: si falta el
    // baseline, los índices antiguos no son un fallo, es que no está.
    if (!declarados.has(nombre) && M.tablas.has(i.tabla)) {
      problemasIndice.push({
        tabla: i.tabla,
        texto: `Índice "${nombre}" lo CREA una migración y el esquema no lo declara. ` +
          `Añade @@index a ${i.tabla} o la CI lo marcará como desfase (pasó en la #89).`,
      });
    }
  }
}

// ---- CLAVES FORÁNEAS sin ON UPDATE ----
for (const [nombre, texto] of M.fks) {
  if (!/ON\s+UPDATE/i.test(texto)) {
    problemas.push(
      `La clave foránea "${nombre}" no declara ON UPDATE. Prisma genera siempre ` +
      'ON DELETE ... ON UPDATE ..., así que la verá como distinta y propondrá rehacerla.',
    );
  }
}

for (const e of S.enums) {
  if (!M.enums.has(e)) problemas.push(`Tipo enumerado "${e}" está en schema.prisma pero no en las migraciones.`);
}

// Al revés sólo se avisa, no se falla: una columna que existe en la base y ya
// no en el esquema puede ser algo conservado a propósito.
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
  console.error('  NO SE PUEDEN COMPARAR TABLAS NI COLUMNAS: falta historial.\n');
  console.error(`    Ninguna migración crea (con su clave primaria): ${faltanDelNucleo.join(', ')}.`);
  console.error('    Eso no es un desfase: son las tablas del núcleo, y existen');
  console.error('    desde el principio. Lo que falta es la migración que las creó.\n');
  console.error('    Comprueba que está la carpeta del baseline en prisma/migrations,');
  console.error('    y que la copia del repositorio está completa.\n');

  // LOS ÍNDICES SÍ SE PUEDEN COMPARAR AUNQUE FALTE EL HISTORIAL: se miran por
  // nombre contra las migraciones que hay. Salir sin decirlo fue exactamente
  // lo que dejó pasar el nombre mal escrito hasta la CI.
  /* Sólo las tablas que ALGUNA migración disponible crea de verdad (con su
     clave primaria). Las del baseline se saltan: sus índices existen, lo que
     no está es el archivo que los crea. Sin este filtro salían 27 avisos
     falsos y el mensaje útil quedaba enterrado — que es justo cómo muere un
     verificador. */
  const comparables = problemasIndice.filter(
    (p) => M.tablas.has(p.tabla) && M.tablas.get(p.tabla).has('id'),
  );
  if (comparables.length) {
    console.error('  PERO LOS ÍNDICES DE LAS TABLAS NUEVAS SÍ SE HAN COMPARADO:\n');
    comparables.forEach((p) => console.error('    · ' + p.texto));
    console.error('\n  Prisma nombra los índices como <tabla>_<campos>_idx, con el nombre');
    console.error('  COMPLETO del campo. Abreviarlo al escribir el SQL a mano hace que');
    console.error('  `prisma migrate dev` crea que falta el índice y lo duplique.\n');
    process.exit(1);
  }
  process.exit(2);
}

if (sobran.length) {
  console.log('  Existen en las migraciones y no en el esquema (suele ser a proposito):');
  console.log('    ' + sobran.slice(0, 12).join(', ') + (sobran.length > 12 ? ` … y ${sobran.length - 12} más` : ''));
  console.log('');
}

const todos = [...problemas, ...problemasIndice.map((p) => p.texto)];
if (todos.length) {
  console.error('  DESFASE — la CI va a fallar en "Migraciones":\n');
  todos.forEach((p) => console.error('    · ' + p));
  console.error('\n  Solucion: cd backend && npx prisma migrate dev --name <nombre-del-cambio>');
  console.error('  O escribe la migracion a mano, si prefieres controlar el SQL.\n');
  process.exit(1);
}

console.log('  Sin desfase: todo lo del esquema está creado por alguna migración.\n');
