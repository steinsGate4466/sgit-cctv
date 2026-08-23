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
import { defineConfig, env } from 'prisma/config';

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

  datasource: {
    url: env('DATABASE_URL'),
  },
});
