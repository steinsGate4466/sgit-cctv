#!/usr/bin/env node
/* =============================================================================
   PROBAR LA RESTAURACIÓN DE UN RESPALDO — bloque 174
   -----------------------------------------------------------------------------
   Estaba escrito en CLAUDE.md desde el bloque 15 como deuda: «Restauración del
   respaldo NUNCA probada». Un respaldo que nunca se ha restaurado no es un
   respaldo: es un archivo que esperamos que sirva. El día que haga falta es el
   peor día para descubrir que le faltaba algo.

   QUÉ HACE: compara la base ORIGINAL con la RESTAURADA, tabla por tabla.

       node scripts/probar-restauracion.js <url-original> <url-restaurada> [--en-vivo]

   · Las dos tienen que tener las MISMAS tablas.
   · `_prisma_migrations` tiene que tener las mismas migraciones (si faltara
     una, el despliegue intentaría aplicarla otra vez sobre datos reales).
   · Filas por tabla:
       – sin --en-vivo (las dos bases quietas): IGUALES, tabla a tabla;
       – con --en-vivo (la original sigue recibiendo trabajo, como Railway en
         la CI): la restaurada no puede tener MÁS filas que la original, y las
         tablas que casi no cambian (roles, permisos, usuarios, ubicaciones)
         tienen que coincidir exactas.
   · Una tabla vacía en la restaurada que en la original tiene filas es un
     fallo SIEMPRE: es lo que se pierde cuando un volcado sale a medias.

   Sale con código 1 y dice qué tabla falla. No escribe nada en ninguna base.
============================================================================= */
'use strict';
const { Client } = require('pg');

const ESTABLES = ['roles', 'permissions', 'role_permissions', 'users', 'locations', '_prisma_migrations'];

async function conteos(url) {
  const ssl = /sslmode=require|railway|rlwy/.test(url) ? { rejectUnauthorized: false } : undefined;
  const c = new Client({ connectionString: url, ssl });
  await c.connect();
  try {
    const t = await c.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
    );
    const r = {};
    for (const { tablename } of t.rows) {
      const q = await c.query(`SELECT count(*)::bigint AS n FROM "${tablename.replace(/"/g, '""')}"`);
      r[tablename] = Number(q.rows[0].n);
    }
    let migraciones = [];
    if ('_prisma_migrations' in r) {
      const m = await c.query('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name');
      migraciones = m.rows.map((x) => x.migration_name);
    }
    return { tablas: r, migraciones };
  } finally {
    await c.end();
  }
}

async function main() {
  const [origen, restaurada, ...resto] = process.argv.slice(2);
  const enVivo = resto.includes('--en-vivo');
  if (!origen || !restaurada) {
    console.error('Uso: node scripts/probar-restauracion.js <url-original> <url-restaurada> [--en-vivo]');
    process.exit(2);
  }
  const [a, b] = await Promise.all([conteos(origen), conteos(restaurada)]);
  const fallos = [];

  const ta = Object.keys(a.tablas), tb = Object.keys(b.tablas);
  for (const t of ta) if (!(t in b.tablas)) fallos.push(`falta la tabla «${t}» en la restaurada`);
  for (const t of tb) if (!(t in a.tablas)) fallos.push(`la restaurada tiene una tabla que la original no: «${t}»`);

  const ma = new Set(a.migraciones), mb = new Set(b.migraciones);
  for (const m of ma) if (!mb.has(m)) fallos.push(`falta la migración ${m} en la restaurada`);

  let filas = 0;
  for (const t of ta) {
    if (!(t in b.tablas)) continue;
    const x = a.tablas[t], y = b.tablas[t];
    filas += y;
    if (x > 0 && y === 0) { fallos.push(`«${t}»: la original tiene ${x} filas y la restaurada NINGUNA`); continue; }
    if (!enVivo || ESTABLES.includes(t)) {
      if (x !== y) fallos.push(`«${t}»: ${x} filas en la original, ${y} en la restaurada`);
    } else if (y > x) {
      fallos.push(`«${t}»: la restaurada tiene MÁS filas (${y}) que la original (${x})`);
    }
  }

  if (fallos.length) {
    console.error('\n  LA RESTAURACIÓN NO CUADRA\n  -------------------------');
    for (const f of fallos) console.error('  · ' + f);
    console.error('');
    process.exit(1);
  }
  console.log(`Restauración comprobada: ${ta.length} tablas, ${filas} filas, ${b.migraciones.length} migraciones. `
    + (enVivo ? 'Original en uso: las tablas estables cuadran exactas y ninguna tiene filas de más.' : 'Todo cuadra fila a fila.'));
}

main().catch((e) => { console.error('No se pudo comparar: ' + (e?.message || e)); process.exit(1); });
