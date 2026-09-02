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
 * Sale de una variable porque los códigos son DATO DE PLANTA y este proyecto
 * no inventa datos de planta. Si no está, la prueba lo dice en vez de
 * inventarse `AA-CAM-T1-001` y fallar con «no encontrado».
 */
export function activoDePrueba(): string {
  return credencial('E2E_ACTIVO');
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
