/* =============================================================================
   EL CLIENTE DE PRISMA PARA LOS SCRIPTS — bloque 52
   -----------------------------------------------------------------------------
   POR QUÉ EXISTE

   Hasta Prisma 6, `new PrismaClient()` sin argumentos funcionaba: el motor de
   Rust leía la URL del bloque `datasource` del esquema y se conectaba solo.

   Prisma 7 quitó ese motor. Ahora el constructor EXIGE un adaptador, y si no
   se lo das ni siquiera compila:

       error TS2554: Expected 1 arguments, but got 0.

   Eso afecta a los dos scripts que se conectan por su cuenta —la semilla y la
   demo—, porque no pasan por NestJS y por tanto no usan `PrismaService`.

   -----------------------------------------------------------------------------
   POR QUÉ UN ARCHIVO Y NO LA MISMA LÍNEA COPIADA EN LOS DOS

   Porque son decisiones de conexión, no una llamada trivial: el certificado
   SSL y el tiempo de espera. Copiadas en dos sitios, el día que se cambie una
   se cambiará en uno solo — y el que quede atrás será el que falle, de noche,
   ejecutando la semilla contra producción.

   Aquí es uno. Y replica a propósito lo que hace `src/prisma/prisma.service.ts`
   para la aplicación: mismo certificado, misma espera. Dos caminos distintos a
   la misma base NO pueden comportarse distinto.
============================================================================= */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  ESPERA_DE_CONEXION_MS,
  opcionesDeCifrado,
  urlDeLaBase,
} from '../src/prisma/conexion';

/**
 * Crea un cliente listo para usar en un script suelto.
 *
 * Falla aquí y con un mensaje claro si falta la variable. Antes, sin
 * `DATABASE_URL`, el error llegaba desde las tripas del motor y hablaba de la
 * base de datos cuando el problema era el archivo `.env`.
 */
export function clienteDeScript(): PrismaClient {
  const url = urlDeLaBase();

  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: url,
      // Mismo criterio que la aplicación, y del mismo archivo: cifrar sólo
      // cuando el tráfico sale del equipo. Ver src/prisma/conexion.ts.
      ssl: opcionesDeCifrado(url),
      connectionTimeoutMillis: ESPERA_DE_CONEXION_MS,
      /* Único valor que NO se comparte con la aplicación, y a propósito: la
         semilla inserta cientos de filas de una vez. Con los 30 segundos de
         una consulta de pantalla se cortaría a la mitad, dejando la base a
         medio sembrar — que es peor que no sembrar. */
      query_timeout: 120_000,
      max: 5,
    }),
  });
}
