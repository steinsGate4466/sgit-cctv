/* =============================================================================
   CÓMO SE CONECTA ESTE SISTEMA A POSTGRESQL — bloque 52
   -----------------------------------------------------------------------------
   POR QUÉ ESTE ARCHIVO EXISTE

   Prisma 7 quitó el motor escrito en Rust. Antes, ese motor decidía por su
   cuenta si usar cifrado, cuánto esperar y cuántas conexiones abrir. Ahora se
   usa el driver `pg` de Node directamente y esas decisiones son NUESTRAS.

   Las toma este archivo, y las toma UNA VEZ para los tres caminos que llegan a
   la base:

     · la aplicación   -> src/prisma/prisma.service.ts
     · la semilla      -> prisma/seed.ts
     · la demo         -> prisma/demo.ts

   Si esto estuviera copiado en tres sitios, el día que se cambie uno los otros
   dos se quedarían atrás — y el que se queda atrás es el que falla de noche,
   ejecutando la semilla contra producción.
============================================================================= */

/**
 * ¿Esta conexión debe ir cifrada?
 *
 * ================================================================
 *  ESTO NO ES UNA OPCIÓN QUE SE PUEDA PONER SIEMPRE
 * ================================================================
 *  La primera versión pasaba `ssl` SIEMPRE. Contra Railway funciona, porque su
 *  PostgreSQL admite cifrado. Pero pedirle cifrado a un servidor que NO lo
 *  tiene activado no degrada a texto plano: falla de golpe.
 *
 *      error: The server does not support SSL connections
 *
 *  Y eso se lo come todo lo que no es Railway: el PostgreSQL del `docker
 *  compose` de desarrollo, y el contenedor de PostgreSQL que levanta la
 *  integración continua para probar que la aplicación arranca. Los dos son
 *  bases efímeras en la misma máquina, sin certificado y sin necesidad de él.
 *
 *  La regla, entonces:
 *
 *    · Misma máquina (localhost / 127.0.0.1 / red interna de Docker) -> sin
 *      cifrado. El tráfico no sale del equipo; cifrarlo no protege de nada y
 *      rompe todos los entornos de prueba.
 *
 *    · Cualquier otro destino -> cifrado. Ahí el tráfico SÍ cruza una red.
 *
 *    · `sslmode` escrito en la propia dirección manda sobre todo lo anterior:
 *      si alguien lo pone a mano, es porque sabe lo que quiere.
 */
export function opcionesDeCifrado(url: string): { rejectUnauthorized: boolean } | false {
  // 1) Lo que diga la dirección, si lo dice, gana.
  const modo = /[?&]sslmode=([a-z-]+)/i.exec(url)?.[1]?.toLowerCase();
  if (modo === 'disable') return false;
  if (modo && modo !== 'prefer') return { rejectUnauthorized: exigirCertificadoValido() };

  // 2) Bases en la misma máquina o en la red interna de Docker: sin cifrado.
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    /* Dirección que no se puede analizar. Se elige el camino SEGURO —cifrar—
       porque suponer «es local» ante la duda es lo que expone tráfico real. */
    return { rejectUnauthorized: exigirCertificadoValido() };
  }

  const esLocal = host === 'localhost'
    || host === '127.0.0.1'
    || host === '::1'
    // Nombres de servicio de docker compose: no salen del equipo.
    || host === 'postgres'
    || host === 'db';

  return esLocal ? false : { rejectUnauthorized: exigirCertificadoValido() };
}

/**
 * ¿Se exige que el certificado esté firmado por una autoridad conocida?
 *
 * HOY NO, y es una decisión escrita, no un descuido.
 *
 * El motor de Rust de Prisma 5 ignoraba los certificados inválidos EN
 * SILENCIO. El de Railway no está firmado por una autoridad que Node reconozca
 * de serie, así que exigirlo de golpe rompería el despliegue con un mensaje
 * que además engaña:
 *
 *     P1010: User was denied access on the database
 *
 * ...que suena a usuario y contraseña cuando el problema es el certificado.
 *
 * Migrar de versión y endurecer la seguridad de transporte son dos cambios
 * distintos. Mezclarlos hace imposible saber cuál rompió qué. El tráfico VA
 * CIFRADO igualmente; lo que no se comprueba es quién firma.
 *
 * Se puede activar desde el entorno con `DB_SSL_ESTRICTO=true` para probarlo
 * en Railway antes de fijarlo. PENDIENTE: montar el certificado con
 * `NODE_EXTRA_CA_CERTS` y ponerlo a `true` por defecto.
 */
export function exigirCertificadoValido(): boolean {
  return process.env.DB_SSL_ESTRICTO === 'true';
}

/**
 * Tiempos y tamaño del grupo de conexiones.
 *
 * Prisma 5 cortaba a los 5 segundos si no conseguía conexión. El driver `pg`
 * viene con `0`, que significa ESPERAR PARA SIEMPRE — y eso no da error: deja
 * peticiones colgadas, agota las conexiones una a una y el sistema muere
 * despacio, sin una línea en el registro. El técnico ve «cargando» eterno y el
 * comprobador de salud sigue diciendo que todo va bien.
 *
 * Se replican los valores que el sistema tenía de hecho, para que este cambio
 * de versión no cambie el comportamiento: sólo la implementación.
 */
export const ESPERA_DE_CONEXION_MS = 5_000;
export const ESPERA_DE_CONSULTA_MS = 30_000;
export const CONEXIONES_MAXIMAS = 10;

/** La dirección de la base, o un error que dice exactamente qué falta. */
export function urlDeLaBase(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'Falta DATABASE_URL. Sin ella no se puede saber a qué base conectarse. '
      + 'En local se declara en backend/.env; en Railway, en las variables del servicio.',
    );
  }
  return url;
}

/** Resumen legible para el registro de arranque. Sin credenciales, nunca. */
export function describeConexion(url: string): string {
  let donde = 'destino no reconocible';
  try {
    const u = new URL(url);
    donde = `${u.hostname}:${u.port || 5432}${u.pathname}`;
  } catch { /* se queda el texto por defecto */ }

  const ssl = opcionesDeCifrado(url);
  const cifrado = ssl === false
    ? 'sin cifrar (base local)'
    : `cifrado, certificado ${ssl.rejectUnauthorized ? 'ESTRICTO' : 'sin validar'}`;

  return `${donde} · ${cifrado} · espera ${ESPERA_DE_CONEXION_MS / 1000}s `
    + `· máximo ${CONEXIONES_MAXIMAS} conexiones`;
}
