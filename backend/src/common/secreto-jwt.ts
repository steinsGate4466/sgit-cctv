/**
 * SECRETO DE FIRMA DE LOS TOKENS.
 *
 * Antes esto era `process.env.JWT_SECRET || 'change_me_in_prod'`. Si la
 * variable faltaba en Railway, la aplicación arrancaba tan tranquila y
 * firmaba los tokens con un secreto que está escrito en el repositorio.
 * Cualquiera que leyera el código podía fabricarse un token de administrador
 * válido. Y no había ninguna señal: todo parecía funcionar.
 *
 * Ahora falla al arrancar, igual que ya hace CORS. Un sistema que no puede
 * protegerse no debe levantarse: es preferible un despliegue que no arranca
 * —y se ve— a uno que arranca abierto —y no se ve—.
 *
 * Fuera de producción se permite un valor de desarrollo para no estorbar.
 */
export function secretoJwt(): string {
  const s = process.env.JWT_SECRET;
  if (s && s.trim().length >= 16) return s;
  if (process.env.NODE_ENV === 'production') {
    // eslint-disable-next-line no-console
    console.error(
      '\n[ARRANQUE ABORTADO] Falta JWT_SECRET, o tiene menos de 16 caracteres.\n' +
      'Sin él los tokens se firmarían con un secreto conocido y cualquiera\n' +
      'podría fabricarse una sesión de administrador.\n' +
      'Ponlo en las variables del servicio:  JWT_SECRET=<cadena larga y aleatoria>\n',
    );
    process.exit(1);
  }
  return 'desarrollo_local_no_usar_en_produccion';
}

/**
 * SECRETO DEL REFRESH TOKEN.
 *
 * Tenía el mismo agujero que el de acceso y se me pasó al arreglar aquél:
 * `process.env.JWT_REFRESH_SECRET || 'change_me_refresh'`.
 *
 * Y es igual de grave, o más: con el secreto del refresh se fabrica un token
 * que el propio sistema cambia por uno de acceso. La puerta de atrás es tan
 * buena como la de delante.
 *
 * Falla al arrancar en producción, como los otros dos cierres en falso.
 */
export function secretoRefresh(): string {
  const s = process.env.JWT_REFRESH_SECRET;
  if (s && s.trim().length >= 16) return s;
  if (process.env.NODE_ENV === 'production') {
    // eslint-disable-next-line no-console
    console.error(
      '\n[ARRANQUE ABORTADO] Falta JWT_REFRESH_SECRET, o tiene menos de 16 caracteres.\n' +
      'Con ese secreto se fabrican tokens de refresco, que el sistema cambia\n' +
      'por tokens de acceso. Es tan grave como el JWT_SECRET.\n' +
      'Ponlo en las variables del servicio: JWT_REFRESH_SECRET=<cadena larga>\n',
    );
    process.exit(1);
  }
  return 'desarrollo_local_refresh_no_usar_en_produccion';
}

/* =============================================================================
   CUÁNTO DURA UN TOKEN — bloque 53
   -----------------------------------------------------------------------------
   POR QUÉ HACE FALTA ESTA FUNCIÓN

   Hasta NestJS 10 esto se escribía así, sin más:

       expiresIn: process.env.JWT_EXPIRES_IN || '900s'

   NestJS 11 trae tipos más estrictos para `expiresIn`, y ya no acepta un
   `string` cualquiera: exige un número de segundos o una duración con formato
   («900s», «15m», «7d»). Con la variable de entorno tal cual, la compilación
   falla:

       Type 'string' is not assignable to type 'number | StringValue'

   Se podría callar con un `as any` y seguir. NO se hace, porque el compilador
   está señalando un agujero de verdad: hasta hoy, si alguien escribía en
   Railway

       JWT_EXPIRES_IN=15minutos

   ...la librería no entendía ese formato y el token salía SIN CADUCIDAD. Una
   sesión eterna, sin un solo error en el registro y sin forma de notarlo
   mirando la pantalla.

   Así que se comprueba de verdad. Si el formato es válido, se usa. Si no, se
   avisa y se cae al valor por defecto — nunca a «sin caducidad».
============================================================================= */

/** Formato que entiende la librería: número + s | m | h | d. */
type Duracion = `${number}${'s' | 'm' | 'h' | 'd'}`;

const FORMATO_DURACION = /^\d+(s|m|h|d)$/;

/**
 * Lee una duración de las variables de entorno y la valida.
 *
 * @param variable  nombre de la variable, p. ej. `JWT_EXPIRES_IN`
 * @param pordefecto valor si no está declarada o está mal escrita
 */
export function duracionDeToken(variable: string, pordefecto: Duracion): Duracion {
  const v = (process.env[variable] || '').trim();
  if (!v) return pordefecto;

  if (!FORMATO_DURACION.test(v)) {
    /* Aviso y no caída: una duración mal escrita no justifica dejar la planta
       sin sistema. Pero tampoco se acepta en silencio, que es lo que pasaba
       antes. El registro lo dice y el sistema usa un valor seguro. */
    // eslint-disable-next-line no-console
    console.warn(
      `[AVISO] ${variable}="${v}" no tiene un formato válido. Se esperan cosas como ` +
      `900s, 15m, 8h o 7d. Se usa "${pordefecto}" en su lugar.\n` +
      '        Ojo: un formato no reconocido hacía que el token saliera SIN caducidad.',
    );
    return pordefecto;
  }
  return v as Duracion;
}
