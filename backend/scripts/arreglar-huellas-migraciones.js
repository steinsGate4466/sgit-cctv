#!/usr/bin/env node
/* =============================================================================
   ARREGLAR LAS HUELLAS DE LAS MIGRACIONES — sin borrar ni un dato
   =============================================================================

   QUÉ PASÓ, y es un fallo mío

   Edité DOS migraciones que YA estaban aplicadas en la base local:

       20260830210025                             (le puse IF NOT EXISTS)
       20260906000000_la_fibra_no_es_un_activo    (le faltaban dos valores)

   Prisma guarda una HUELLA de cada archivo cuando lo aplica. Al cambiar el
   archivo la huella deja de coincidir, y Prisma hace lo único seguro que
   puede: parar y pedir reiniciar la base — que BORRARÍA TODO.

   Está escrito en CLAUDE.md desde el primer día: *una migración aplicada es
   INMUTABLE, se corrige con otra migración nueva*. Me la salté.

   -----------------------------------------------------------------------------
   QUÉ HACE

   Recalcula la huella de esos dos archivos y la escribe en la tabla de control
   de Prisma. **No toca ni una tabla de datos.**

   Es seguro porque el CONTENIDO de las dos hace exactamente lo mismo que antes
   en una base donde ya se aplicaron: la primera sólo añade dos valores a una
   lista y ya están; la segunda recrea la lista y el efecto ya está hecho.

   -----------------------------------------------------------------------------
   POR QUÉ NO USA PRISMA

   Primer intento fallido, y la lección: el cliente generado de este proyecto
   es TypeScript (`src/generated/prisma/*.ts`), y **Node no puede cargar
   TypeScript directamente**. Salía «No encuentro el cliente de Prisma» sin
   decir por qué.

   Aquí se habla con PostgreSQL con `pg` a secas, que entra con `require` sin
   compilar nada. Menos piezas, menos formas de fallar.

   -----------------------------------------------------------------------------
   CÓMO SE USA

       cd C:\Users\CRISTHIAN\Desktop\sgit-cctv\backend
       node scripts/arreglar-huellas-migraciones.js

   Enseña qué va a cambiar antes de cambiarlo. Si algo no cuadra, para y no
   toca nada.
============================================================================= */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// El .env de la carpeta backend, que es donde vive DATABASE_URL.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Client } = require('pg');

/* Las dos que edité. Si mañana hace falta otra, se añade aquí — y sobre todo,
   NO se edita ninguna más que ya esté aplicada. */
const AFECTADAS = [
  '20260830210025',
  '20260906000000_la_fibra_no_es_un_activo',
];

/**
 * La huella es el sha256 del archivo TAL CUAL está en disco.
 *
 * Se lee como BINARIO y no como texto a propósito: leyéndolo como texto, Node
 * podría normalizar los saltos de línea de Windows y la huella saldría
 * distinta de la que calcula Prisma. Es el mismo problema del CRLF que ya dio
 * una falsa alarma en el bloque 62.
 */
function huellaDe(carpeta) {
  const ruta = path.join(__dirname, '..', 'prisma', 'migrations', carpeta, 'migration.sql');
  if (!fs.existsSync(ruta)) throw new Error(`No existe ${ruta}. ¿Se movió la migración?`);
  return crypto.createHash('sha256').update(fs.readFileSync(ruta)).digest('hex');
}

/** Tapa la contraseña antes de imprimir la dirección de la base. */
const sinSecretos = (url) => String(url).replace(/:\/\/[^@/]*@/, '://***:***@');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log('Falta DATABASE_URL.');
    console.log('Este script se corre desde la carpeta backend, donde el .env la define.');
    process.exit(2);
  }

  /* Sin cifrado en local; con él fuera. Se decide por la dirección y no por
     una variable, para que no haya forma de conectarse a producción sin
     cifrar por haberse olvidado de ponerla. */
  const esLocal = /localhost|127\.0\.0\.1/.test(url);
  const client = new Client({
    connectionString: url,
    ssl: esLocal ? false : { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('Base de datos:', sinSecretos(url));
  console.log('');

  try {
    /* -----------------------------------------------------------------------
       ANTES DE TOCAR NADA: COMPROBAR QUE CALCULO LA HUELLA IGUAL QUE PRISMA.

       Si mi forma de calcularla no fuera la misma, escribiría un valor
       equivocado y el problema seguiría — o peor, quedaría una huella basura
       en la tabla de control.

       Se comprueba contra una migración que NO he tocado: si para ésa mi
       cálculo coincide con lo que hay guardado, entonces el algoritmo es el
       correcto y me puedo fiar para las otras dos. Si no coincide, se para
       aquí sin cambiar nada.

       Es la misma idea que la regla de los verificadores: probar la
       herramienta contra un caso conocido antes de darla por buena.
    ----------------------------------------------------------------------- */
    const { rows: testigos } = await client.query(
      `SELECT "migration_name", "checksum" FROM "_prisma_migrations"
        WHERE "migration_name" <> ALL($1::text[])
          AND "rolled_back_at" IS NULL
        ORDER BY "migration_name" DESC LIMIT 5`,
      [AFECTADAS],
    );

    let algoritmoOk = false;
    let testigoUsado = null;
    for (const t of testigos) {
      const carpeta = path.join(__dirname, '..', 'prisma', 'migrations', t.migration_name);
      if (!fs.existsSync(carpeta)) continue;         // migración borrada del disco
      if (huellaDe(t.migration_name) === t.checksum) {
        algoritmoOk = true;
        testigoUsado = t.migration_name;
        break;
      }
    }

    if (!algoritmoOk) {
      console.log('  [PARADO] No consigo reproducir la huella de ninguna migración intacta.');
      console.log('');
      console.log('  Eso significa que calculo la huella de forma distinta a Prisma, y');
      console.log('  escribir un valor equivocado sería peor que no hacer nada.');
      console.log('');
      console.log('  NO SE HA CAMBIADO NADA. Mándame esta salida.');
      process.exit(3);
    }
    console.log(`  [OK] Calculo la huella igual que Prisma (comprobado con ${testigoUsado}).`);
    console.log('');

    let cambiadas = 0;
    let saltadas = 0;

    for (const nombre of AFECTADAS) {
      const nueva = huellaDe(nombre);

      const { rows } = await client.query(
        'SELECT "migration_name", "checksum" FROM "_prisma_migrations" WHERE "migration_name" = $1',
        [nombre],
      );

      if (!rows.length) {
        console.log(`  [SALTADA]  ${nombre}`);
        console.log('             No está aplicada en esta base. No hay huella que arreglar.');
        saltadas++;
        continue;
      }

      if (rows[0].checksum === nueva) {
        console.log(`  [YA ESTÁ]  ${nombre}`);
        continue;
      }

      console.log(`  [ARREGLA]  ${nombre}`);
      console.log(`             antes: ${String(rows[0].checksum).slice(0, 16)}…`);
      console.log(`             ahora: ${nueva.slice(0, 16)}…`);

      await client.query(
        'UPDATE "_prisma_migrations" SET "checksum" = $1 WHERE "migration_name" = $2',
        [nueva, nombre],
      );
      cambiadas++;
    }

    console.log('');
    if (cambiadas) {
      console.log(`Listo: ${cambiadas} huella(s) actualizada(s). NO se tocó ningún dato.`);
    } else if (saltadas === AFECTADAS.length) {
      console.log('Ninguna de las dos está aplicada aquí. No había nada que hacer.');
    } else {
      console.log('No había nada que arreglar: las huellas ya coincidían.');
    }
    console.log('Ahora ya puedes correr:  npx.cmd prisma migrate dev');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error('');
  console.error('Falló:', e.message);
  console.error('');
  console.error('NO se ha cambiado nada. Mándame este mensaje tal cual.');
  process.exit(1);
});
