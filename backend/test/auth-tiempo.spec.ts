import * as argon2 from 'argon2';

/**
 * ENUMERACIÓN DE USUARIOS POR TIEMPO DE RESPUESTA
 *
 * El mensaje de error del login ya era el mismo para «este correo no existe»
 * y «la contraseña está mal». Pero el TIEMPO no lo era: si el usuario no
 * existía se saltaba `argon2.verify` entero y la respuesta llegaba en 2 ms en
 * lugar de 100.
 *
 * Con esa diferencia se averigua qué correos son de usuarios reales sin
 * acertar ni una contraseña. Y con esa lista ya se ataca de verdad — o se
 * hace phishing dirigido, que en una planta funciona mejor que la fuerza
 * bruta.
 *
 * Esta prueba comprueba que verificar contra el hash señuelo cuesta lo mismo
 * que verificar contra uno real, que es lo que hace que el reloj no cuente
 * nada.
 */

// El mismo señuelo que usa el servicio.
const HASH_SENUELO =
  '$argon2id$v=19$m=65536,t=3,p=4$c2VudWVsby1zaW4tdXNv$' +
  'YnVzY2FzLXVuLXNlY3JldG8tYXF1aS1ub2hheS1uYWRh';

describe('login · el reloj no debe delatar si el usuario existe', () => {
  it('el hash señuelo NO valida ninguna contraseña', async () => {
    // Si por accidente validara, cualquiera entraría con un correo inventado.
    // Es la comprobación que de verdad importa de todo este arreglo.
    for (const intento of ['', 'admin', '123456', 'senuelo-sin-uso']) {
      const ok = await argon2.verify(HASH_SENUELO, intento).catch(() => false);
      expect(ok).toBe(false);
    }
  });

  it('verificar el señuelo cuesta un tiempo parecido a verificar uno real', async () => {
    const real = await argon2.hash('una-contrasena-cualquiera');

    const medir = async (hash: string) => {
      const t = process.hrtime.bigint();
      await argon2.verify(hash, 'lo-que-sea').catch(() => false);
      return Number(process.hrtime.bigint() - t) / 1e6; // ms
    };

    // Se descarta la primera medición de cada uno: la primera llamada a argon2
    // incluye la reserva de memoria y siempre sale más lenta.
    await medir(real); await medir(HASH_SENUELO);

    const tReal = await medir(real);
    const tSenuelo = await medir(HASH_SENUELO);

    /* El umbral es GENEROSO a propósito. Esta prueba no mide rendimiento: sólo
       tiene que fallar si alguien quita el señuelo y la rama del usuario
       inexistente vuelve a costar casi cero. Un umbral estrecho convertiría
       una prueba de seguridad en una prueba que falla sola en una máquina
       cargada, y esa acaba borrada. */
    expect(tSenuelo).toBeGreaterThan(tReal * 0.2);
  });
});
