import { Page, expect } from '@playwright/test';

/* =============================================================================
   APOYO PARA LOS RECORRIDOS
   =============================================================================

   LAS CREDENCIALES NO ESTÁN EN EL REPOSITORIO.

   Salen de variables de entorno. Es la regla del proyecto —ninguna contraseña
   pasa por el chat ni queda escrita— y además obliga a que cada quien apunte a
   SU entorno local: una contraseña escrita aquí sería la de la semilla, y el
   día que alguien la cambie las pruebas fallarían diciendo «login incorrecto»
   sin explicar por qué.

   Se copian de `.env.e2e.ejemplo`.
============================================================================= */

function credencial(nombre: string): string {
  const v = process.env[nombre];
  if (!v) {
    throw new Error(
      `\n\n  Falta la variable ${nombre}.\n`
      + `  Copia frontend/.env.e2e.ejemplo a .env.e2e y rellénalo con el\n`
      + `  usuario de TU entorno local (el de la semilla).\n\n`
      + `  Nunca se escriben credenciales en el repositorio.\n\n`,
    );
  }
  return v;
}

/**
 * Entra al sistema y espera a estar dentro de verdad.
 *
 * SE ESPERA A QUE APAREZCA EL MENÚ, no a que cambie la URL. La URL cambia en
 * cuanto React Router navega, antes de que la sesión esté cargada; si se
 * esperara sólo eso, la prueba siguiente podría pulsar sobre una pantalla que
 * todavía está montándose y fallar de forma intermitente — el peor tipo de
 * fallo, el que no se reproduce.
 */
export async function entrar(page: Page, quien: 'JEFE' | 'TECNICO' = 'JEFE') {
  const email = credencial(quien === 'JEFE' ? 'E2E_JEFE_EMAIL' : 'E2E_TECNICO_EMAIL');
  const pass = credencial(quien === 'JEFE' ? 'E2E_JEFE_PASSWORD' : 'E2E_TECNICO_PASSWORD');

  await page.goto('/login');
  await page.getByLabel(/correo/i).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(pass);
  await page.getByRole('button', { name: /ingresar|entrar/i }).click();

  /* Si las credenciales están mal, el mensaje del servidor sale en pantalla.
     Se comprueba antes de seguir para que el fallo diga QUÉ pasó y no
     «timeout esperando el menú», que no ayuda a nadie. */
  const error = page.locator('.aviso-error, .error').first();
  if (await error.isVisible({ timeout: 2000 }).catch(() => false)) {
    throw new Error(`No se pudo entrar: ${await error.innerText()}`);
  }

  await expect(page.locator('nav, .sidebar').first()).toBeVisible({ timeout: 20_000 });
}

/**
 * El código del activo con el que se trabaja.
 *
 * DOS CAMINOS, Y EL ORDEN IMPORTA:
 *
 *  1. `E2E_ACTIVO` si está puesta. Es lo que se usa en LOCAL, porque ahí
 *     interesa apuntar a un equipo concreto —mejor si su zona tiene declarada
 *     la intervención, para que el recorrido 2 compruebe además el aviso de
 *     seguridad.
 *
 *  2. Si no está, se le PREGUNTA A LA APLICACIÓN por el primero que haya.
 *     Es lo que pasa en la CI, donde la base se acaba de sembrar y nadie sabe
 *     qué códigos salieron.
 *
 * NO SE INVENTA UN CÓDIGO. Escribir `AA-CAM-T1-001` como valor por defecto
 * sería inventar un dato de planta, y la prueba fallaría con «no encontrado»
 * — un error que no dice nada sobre el software y hace perder media hora.
 * Preguntarle a la aplicación no es inventar: es descubrir.
 */
export async function activoDePrueba(page: Page): Promise<string> {
  const fijado = process.env.E2E_ACTIVO;
  if (fijado) return fijado;

  /* SE LEE DE LA PANTALLA, NO DE LA API.
     -------------------------------------------------------------------------
     MI PRIMERA VERSIÓN llamaba a `/assets` con `fetch` desde dentro de la
     página. Falló en la CI en medio segundo, y con razón: metía tres
     suposiciones que un recorrido no tiene por qué hacer —la URL base de la
     API, la forma de la respuesta y que el CORS del `fetch` manual pasara—.
     Cuando una de las tres falla, el error no dice cuál.

     Un recorrido debe usar la aplicación COMO LA USA UNA PERSONA. Si el
     código no se puede leer de la tabla de Activos, eso YA ES un fallo del
     software y la prueba debe caerse por ese motivo, no por una llamada
     paralela que nadie hace en la vida real. */
  await page.goto('/assets');
  await page.waitForLoadState('networkidle');

  const primera = page.locator('table.tabla tbody tr').first();
  if (!(await primera.isVisible().catch(() => false))) {
    throw new Error(
      '\n\n  La tabla de Activos salió VACÍA y `E2E_ACTIVO` no está puesta.\n'
      + '  Puede ser una de dos cosas, y las dos importan:\n'
      + '    · la semilla no creó ningún activo, o\n'
      + '    · este usuario no puede verlos (mira el aviso de la pantalla).\n\n'
      + '  En local: pon un código real en .env.e2e, de «Estructura de activos».\n\n',
    );
  }

  /* La primera celda lleva el código en negrita y el tipo debajo, así que se
     coge la PRIMERA LÍNEA. Partir por el salto es más estable que apuntar al
     `<div>` de dentro, que es maquetación y cambia. */
  const celda = (await primera.locator('td').first().innerText()).trim();
  const codigo = celda.split('\n')[0].trim();

  if (!codigo) {
    throw new Error(`\n\n  No pude leer el código del activo. La celda decía: "${celda}"\n\n`);
  }
  return codigo;
}

/**
 * Comprueba que NO hay un error de JavaScript suelto en la consola.
 *
 * Es media prueba gratis: la pantalla puede pintarse entera y estar tirando un
 * error en cada repintado. Se ignoran los ruidos conocidos que no son del
 * software (extensiones del navegador, favicon).
 */
export function vigilarConsola(page: Page): string[] {
  const errores: string[] = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/favicon|ERR_INTERNET_DISCONNECTED|ResizeObserver loop/i.test(t)) return;
    errores.push(t);
  });
  page.on('pageerror', (e) => errores.push(String(e)));
  return errores;
}
