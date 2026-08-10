/**
 * DE DÓNDE VIENE CADA PETICIÓN
 * =============================================================================
 *
 * LO PRIMERO, PORQUE SI NO ALGUIEN LO VA A PEDIR Y VOY A TENER QUE INVENTARLO:
 *
 *   ** UN SERVIDOR WEB NO PUEDE VER LA MAC DEL CLIENTE. NUNCA. **
 *
 * La dirección MAC es de capa 2 y muere en el primer salto. Lo que llega al
 * servidor es la MAC del último router del camino — en planta, la del gateway,
 * la MISMA para todo el mundo. En Railway, la del balanceador de Railway.
 * Cualquier software que diga "detecté la MAC del usuario" desde un navegador
 * está mintiendo o está leyendo un dato inútil.
 *
 * Entonces, ¿cómo se sabe DESDE QUÉ PC entró alguien? Con tres datos que sí
 * existen, y cada uno tapa el agujero del anterior:
 *
 *   1. LA IP DE ORIGEN — la da la red. Sirve poco sola: en planta todos salen
 *      por la misma IP pública. Dentro de la red sí distingue.
 *
 *   2. EL REGISTRO DE EQUIPOS CONOCIDOS — una tabla que mantiene el técnico de
 *      redes: "10.20.3.14 = PC Púlpito Tren 2, MAC 00:1A:2B:…". La MAC entra
 *      AQUÍ, A MANO, sacada de la reserva DHCP o de la tabla MAC del switch,
 *      que es donde de verdad vive. No se detecta: se declara, y por eso es
 *      editable desde la pantalla.
 *
 *   3. EL IDENTIFICADOR DE APARATO — un número que el navegador guarda y manda
 *      en cada petición. Sobrevive al cambio de IP (un celular que salta de
 *      wifi a datos sigue siendo el mismo aparato). No es un dato de seguridad
 *      por sí solo —se puede borrar y falsificar— pero contesta "¿fue el mismo
 *      aparato de siempre?", que es la pregunta que se hace de verdad cuando
 *      algo huele mal.
 *
 * Los tres juntos dan una respuesta honesta. Uno solo, no.
 */

/** Cabecera donde el navegador manda su identificador de aparato. */
export const CABECERA_DISPOSITIVO = 'x-dispositivo';

/**
 * Deja la IP en algo que una persona pueda leer.
 *
 * OJO CON `x-forwarded-for`: es una lista, y **la escribe quien quiera**. Sólo
 * es de fiar porque delante hay un proxy (Railway) que la reescribe. La
 * primera entrada es el cliente; las siguientes, los proxies del camino.
 */
export function normalizarIp(ip?: string | null): string | null {
  if (!ip) return null;
  let v = String(ip).trim();
  if (!v) return null;
  if (v.startsWith('sistema')) return v; // tareas automáticas del propio sistema
  if (v.includes(',')) v = v.split(',')[0].trim();
  if (v.startsWith('::ffff:')) v = v.slice(7);
  if (v === '::1' || v === '127.0.0.1') return 'local (servidor)';
  return v.slice(0, 60);
}

/**
 * Convierte el `User-Agent` —una línea de 200 caracteres ilegible— en algo que
 * alguien reconozca como suyo: "Chrome en Windows", "Safari en iPhone".
 *
 * El orden de las comprobaciones importa: Edge y Chrome se anuncian ambos como
 * "Chrome", y Chrome en Android también dice "Safari". Si se pregunta en el
 * orden equivocado, todo acaba siendo Chrome.
 */
export function resumirAgente(ua?: string | null): string | null {
  if (!ua) return null;
  const s = String(ua);

  let navegador = 'Navegador desconocido';
  if (/Edg\//.test(s)) navegador = 'Edge';
  else if (/OPR\/|Opera/.test(s)) navegador = 'Opera';
  else if (/SamsungBrowser/.test(s)) navegador = 'Samsung Internet';
  else if (/Firefox\//.test(s)) navegador = 'Firefox';
  else if (/Chrome\//.test(s)) navegador = 'Chrome';
  else if (/Safari\//.test(s)) navegador = 'Safari';

  let sistema = '';
  if (/Windows NT 10|Windows NT 11/.test(s)) sistema = 'Windows';
  else if (/Windows/.test(s)) sistema = 'Windows (versión antigua)';
  else if (/Android/.test(s)) sistema = 'Android';
  else if (/iPhone/.test(s)) sistema = 'iPhone';
  else if (/iPad/.test(s)) sistema = 'iPad';
  else if (/Mac OS X/.test(s)) sistema = 'Mac';
  else if (/Linux/.test(s)) sistema = 'Linux';

  return (sistema ? `${navegador} en ${sistema}` : navegador).slice(0, 120);
}

/** ¿Es un teléfono o una tablet? Sirve para saber si el mapeo se hizo en campo. */
export function esMovil(ua?: string | null): boolean {
  return /Android|iPhone|iPad|Mobile/i.test(String(ua || ''));
}

/**
 * Saca el identificador de aparato de la cabecera, saneado.
 *
 * Sale de fuera, así que se trata como veneno: sólo letras, números y guiones,
 * y como mucho 64 caracteres. Va a acabar en la auditoría y en una pantalla.
 */
export function idDispositivo(cabeceras: any): string | null {
  const v = cabeceras?.[CABECERA_DISPOSITIVO];
  if (!v || typeof v !== 'string') return null;
  const limpio = v.replace(/[^A-Za-z0-9-]/g, '').slice(0, 64);
  return limpio.length >= 8 ? limpio : null;
}

/**
 * Todo el origen de una petición, en un objeto.
 * Se usa igual en el interceptor de auditoría y en el login.
 */
export function origenDe(req: any) {
  const ua = req?.headers?.['user-agent'] as string | undefined;
  return {
    ip: normalizarIp((req?.headers?.['x-forwarded-for'] as string) || req?.ip || null),
    dispositivo: resumirAgente(ua),
    dispositivoId: idDispositivo(req?.headers),
    movil: esMovil(ua),
  };
}
