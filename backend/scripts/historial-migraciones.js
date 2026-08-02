#!/usr/bin/env node
/**
 * ¿QUÉ MIGRACIONES CREE LA BASE QUE TIENE APLICADAS?
 *
 * Lee `_prisma_migrations` y la compara con las carpetas de prisma/migrations.
 * No cambia NADA: sólo informa. Existe porque el 01/08 `migrate deploy` falló
 * en la base local con "type LocationType already exists": la base tenía el
 * esquema entero pero su historial estaba vacío, así que Prisma intentó
 * crearlo todo otra vez desde el principio.
 *
 * Modos:
 *   node scripts/historial-migraciones.js           -> informe legible
 *   node scripts/historial-migraciones.js --faltan  -> sólo los nombres que
 *        hay que marcar como aplicados, uno por línea (para el script de PS)
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const DIR = path.join(__dirname, '..', 'prisma', 'migrations');
const soloFaltan = process.argv.includes('--faltan');

(async () => {
  const prisma = new PrismaClient();
  try {
    const carpetas = fs
      .readdirSync(DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();

    let filas = [];
    try {
      filas = await prisma.$queryRawUnsafe(
        'SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name',
      );
    } catch {
      // La tabla no existe: base virgen o creada con db push.
      filas = [];
    }

    const estado = new Map(
      filas.map((f) => [
        f.migration_name,
        f.rolled_back_at ? 'REVERTIDA' : f.finished_at ? 'APLICADA' : 'A MEDIAS',
      ]),
    );

    // Una migración cuenta como "hay que marcarla" si la base no la tiene
    // registrada como aplicada, PERO el esquema ya está ahí. Que el esquema
    // esté ahí se comprueba fuera, con verificar:bd; aquí solo se listan.
    const faltan = carpetas.filter((c) => estado.get(c) !== 'APLICADA');

    if (soloFaltan) {
      faltan.forEach((f) => console.log(f));
      return;
    }

    console.log('\n  CARPETA                                             ESTADO EN LA BASE');
    console.log('  ' + '-'.repeat(72));
    for (const c of carpetas) {
      console.log('  ' + c.padEnd(52) + (estado.get(c) || 'NO REGISTRADA'));
    }
    const sobran = [...estado.keys()].filter((k) => !carpetas.includes(k));
    if (sobran.length) {
      console.log('\n  Registradas en la base pero SIN carpeta (restos de otra rama):');
      sobran.forEach((s) => console.log('    ' + s + '  ->  ' + estado.get(s)));
    }
    console.log(`\n  ${carpetas.length} carpetas · ${filas.length} registros · ${faltan.length} sin marcar como aplicadas\n`);
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => {
  console.error('\n  No se pudo leer el historial:', e.message, '\n');
  process.exit(1);
});
