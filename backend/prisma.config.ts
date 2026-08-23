/* =============================================================================
   CONFIGURACIÓN DE LA HERRAMIENTA PRISMA — bloque 52
   -----------------------------------------------------------------------------
   POR QUÉ EXISTE ESTE ARCHIVO

   Hasta Prisma 6, la configuración vivía en tres sitios a la vez: la URL de la
   base en el bloque `datasource` del esquema, el script de semilla en una
   clave `prisma` dentro del package.json, y la carpeta de migraciones
   implícita. Prisma 6 ya avisaba en cada comando:

       warn The configuration property `package.json#prisma` is deprecated
            and will be removed in Prisma 7.

   Prisma 7 lo cumplió. Ahora todo eso se declara aquí, en un solo lugar.

   -----------------------------------------------------------------------------
   ESTE ARCHIVO ES PARA LA HERRAMIENTA, NO PARA LA APLICACIÓN

   Lo lee el comando `prisma` (generate, migrate, db seed, db execute). La
   aplicación NO lo usa: ella crea su cliente en `src/prisma/prisma.service.ts`
   con el adaptador de PostgreSQL.

   Son dos caminos distintos hacia la misma base y conviene tenerlo claro,
   porque si un día divergen —uno apuntando a producción y otro a local— el
   síntoma es una migración aplicada donde no tocaba.

   -----------------------------------------------------------------------------
   POR QUÉ HAY QUE CARGAR EL .env A MANO

   Prisma 7 dejó de leer el `.env` solo. Si falta esta primera línea, el
   comando arranca con `DATABASE_URL` vacía y falla diciendo que no encuentra
   la base — un error que apunta a la base cuando el problema es el archivo.

   En Railway no hay `.env`: las variables las inyecta la plataforma. Esta
   línea simplemente no encuentra archivo y sigue. No estorba.
============================================================================= */
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',

  migrations: {
    path: 'prisma/migrations',

    /* La semilla se ejecuta desde el JavaScript ya compilado, igual que antes.
       Se mantiene así —y no con `ts-node`— porque es lo que corre dentro del
       contenedor, donde no hay compilador de TypeScript instalado. Antes de
       `prisma db seed` hay que haber compilado: eso lo hace `npm run build`.

       LA RUTA CAMBIÓ de `dist/seed.js` a `dist/prisma/seed.js`, y no por
       capricho. La semilla se compilaba con `--rootDir prisma`, lo que exige
       que TODO lo que importa cuelgue de esa carpeta. Al pasar a Prisma 7,
       `seed.ts` importa el cliente desde `src/generated/prisma`, que está
       FUERA — y TypeScript se niega:

           error TS6059: File is not under 'rootDir'

       La raíz de compilación pasa a ser el backend entero (`--rootDir .`), y
       entonces la salida conserva la carpeta: `dist/prisma/seed.js`. */
    seed: 'node dist/prisma/seed.js',
  },

  /* ---------------------------------------------------------------------------
     POR QUÉ NO SE USA EL AYUDANTE `env('DATABASE_URL')`
     ---------------------------------------------------------------------------
     Ese ayudante es ESTRICTO: si la variable no existe, revienta al CARGAR
     este archivo, antes de saber siquiera qué comando se pidió. Y eso tumbó la
     construcción de la imagen en Railway:

         RUN npx prisma generate && npm run build
         Failed to load config file "/app" as a TypeScript/JavaScript module.
         Error: PrismaConfigEnvError: Cannot resolve environment variable:
                DATABASE_URL.

     El motivo es que Railway inyecta las variables AL EJECUTAR el contenedor,
     no al construirlo. Durante el `docker build` no hay ninguna — y no tiene
     por qué haberla: `prisma generate` lee el esquema y escribe archivos, NO
     se conecta a ninguna base.

     Así que la conexión se deja vacía si no está. No se pierde ninguna
     protección: el comando que SÍ necesita la base —`migrate deploy`, que
     corre al arrancar el contenedor, ya con las variables puestas— falla por
     su cuenta y con un mensaje claro si la cadena viene vacía.

     La regla, en una línea: construir no necesita base de datos; ejecutar sí.
     --------------------------------------------------------------------------- */
  datasource: {
    url: process.env.DATABASE_URL ?? '',

    /* La BASE DE SOMBRA: una base desechable donde `migrate diff` reproduce
       las migraciones para compararlas con el esquema. Antes se le pasaba al
       comando con `--shadow-database-url`; Prisma 7 eliminó ese parámetro y
       ahora se declara aquí.

       Si no hay una dedicada, se usa la misma dirección. Eso es lo que hacía
       ya la integración continua, donde la base es un contenedor efímero que
       se destruye al terminar. NUNCA se apunta a producción a mano. */
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL ?? process.env.DATABASE_URL ?? '',
  },
});
