import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

/* =============================================================================
   LA CONEXIÓN A LA BASE — Prisma 7 (bloque 52)
   -----------------------------------------------------------------------------
   QUÉ CAMBIÓ

   Hasta Prisma 6 esto eran cuatro líneas: heredar de `PrismaClient` y
   conectar. Por debajo, un motor escrito en Rust abría las conexiones y
   decidía tiempos de espera y certificados por su cuenta.

   Prisma 7 tiró ese motor. Ahora se usa el driver `pg` de Node directamente, a
   través de un ADAPTADOR. Eso es lo que hace la imagen mucho más pequeña y el
   arranque más rápido — pero también significa que dos decisiones que antes
   tomaba el motor por nosotros AHORA HAY QUE TOMARLAS AQUÍ.

   Las dos se descubren en producción, no en la laptop. Por eso están
   explicadas de más.
============================================================================= */

/**
 * ¿Hay que exigir un certificado SSL válido?
 *
 * PROBLEMA: el motor de Rust ignoraba certificados inválidos EN SILENCIO.
 * El driver `pg` no. Railway sirve PostgreSQL por SSL con un certificado que
 * no está firmado por una autoridad que Node reconozca de serie, así que al
 * desplegar aparece:
 *
 *     Error: P1010: User was denied access on the database <database>
 *
 * ...un mensaje que hace pensar en usuario y contraseña cuando el problema es
 * el certificado. Horas perdidas mirando donde no es.
 *
 * DECISIÓN: se mantiene el comportamiento que el sistema YA TENÍA con Prisma 5
 * —no validar la cadena de certificados— y se hace EXPLÍCITO en vez de
 * implícito. Es un cambio de versión, no el momento de endurecer la seguridad
 * de transporte: mezclar las dos cosas hace imposible saber cuál rompió qué.
 *
 * El tráfico VA CIFRADO igualmente. Lo que no se comprueba es quién firma el
 * certificado, y la conexión no sale de la red interna de Railway.
 *
 * PENDIENTE (bloque propio, después de la migración): montar el certificado de
 * Railway con `NODE_EXTRA_CA_CERTS` y poner esto en `true`.
 */
function exigirCertificadoValido(): boolean {
  // Se puede forzar desde el entorno sin tocar código, para poder endurecerlo
  // en Railway y comprobarlo antes de fijarlo aquí.
  if (process.env.DB_SSL_ESTRICTO === 'true') return true;
  return false;
}

/**
 * Tiempos de espera.
 *
 * PROBLEMA: Prisma 5 cortaba a los 5 segundos si no conseguía conexión. El
 * driver `pg` viene con `0`, que significa ESPERAR PARA SIEMPRE.
 *
 * Sin esto, una base que no responde no da error: deja peticiones colgadas.
 * Las conexiones se van agotando una a una y el sistema muere despacio, sin un
 * solo mensaje en el registro. El técnico ve «cargando» eterno y el
 * comprobador de salud sigue diciendo que todo va bien.
 *
 * Se replican los valores que el sistema tenía de hecho, para que este bloque
 * no cambie el comportamiento — sólo la implementación.
 */
const ESPERA_DE_CONEXION_MS = 5_000;   // lo que hacía Prisma 5
const ESPERA_DE_CONSULTA_MS = 30_000;  // una consulta de planta no dura más
const CONEXIONES_MAXIMAS = 10;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private static readonly log = new Logger('BaseDeDatos');

  constructor() {
    const url = process.env.DATABASE_URL;
    if (!url) {
      /* Antes esto fallaba más adelante y con un mensaje del motor. Fallar
         aquí, al construir, dice exactamente qué falta y por qué el
         contenedor no arranca. */
      throw new Error(
        'Falta DATABASE_URL. La aplicación no puede arrancar sin saber a qué base conectarse.',
      );
    }

    const estricto = exigirCertificadoValido();

    super({
      adapter: new PrismaPg({
        connectionString: url,
        ssl: { rejectUnauthorized: estricto },
        connectionTimeoutMillis: ESPERA_DE_CONEXION_MS,
        query_timeout: ESPERA_DE_CONSULTA_MS,
        max: CONEXIONES_MAXIMAS,
      }),
    });

    PrismaService.log.log(
      `Conexión configurada · certificado ${estricto ? 'ESTRICTO' : 'sin validar'} · `
      + `espera ${ESPERA_DE_CONEXION_MS / 1000}s · máximo ${CONEXIONES_MAXIMAS} conexiones`,
    );
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
