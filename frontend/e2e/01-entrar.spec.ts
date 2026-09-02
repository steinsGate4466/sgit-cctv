import { test, expect } from '@playwright/test';
import { entrarConCredenciales as entrar, vigilarConsola } from './apoyo';

/* =============================================================================
   RECORRIDO 1 · ENTRAR
   -----------------------------------------------------------------------------
   El más aburrido y el que más veces se ha roto. De los bugs del bloque 64,
   dos vivían aquí: la sesión que echaba al usuario mientras trabajaba, y el
   aviso de error que se pintaba dentro del formulario que se cerraba.

   Si esto falla, no hay nada más que probar.
============================================================================= */

test.describe('1 · Entrar al sistema', () => {
  test('con las credenciales buenas se llega al menú', async ({ page }) => {
    const errores = vigilarConsola(page);
    await entrar(page);

    /* Se comprueba que hay MENÚ, que es lo que significa «estoy dentro».
       Comprobar sólo la URL dejaría pasar el caso de la pantalla en blanco
       con la ruta correcta — que es exactamente cómo se ve un fallo del
       lazy-loading tras un despliegue (por eso existe lazy-con-reintento). */
    await expect(page.locator('nav, .sidebar').first()).toBeVisible();

    /* NINGÚN ERROR EN CONSOLA. Media prueba gratis: la pantalla puede
       pintarse entera y estar reventando en cada repintado. */
    expect(errores, `Errores en consola: ${errores.join(' | ')}`).toHaveLength(0);
  });

  test('con la contraseña mal, lo DICE — no se queda en silencio', async ({ page }) => {
    /* Éste es el bug número 3 del bloque 64 con otra cara: el formulario se
       cerraba aunque la respuesta viniera vacía, y el aviso vivía dentro del
       formulario. El usuario veía la pantalla volver atrás sin explicación y
       concluía —con razón— que el software no funciona.

       Lo que se fija aquí no es el texto exacto, es que HAY un mensaje. */
    await page.goto('/login');
    await page.getByLabel(/correo/i).fill('nadie@acerosarequipa.local');
    await page.getByLabel('Contraseña', { exact: true }).fill('esto-no-es-la-buena');
    await page.getByRole('button', { name: /ingresar|entrar/i }).click();

    const aviso = page.locator('.aviso-error, .error').first();
    await expect(aviso).toBeVisible({ timeout: 15_000 });
    /* Y que NO sea el «Request failed with status code 401» de axios, que es
       lo que veía el usuario antes del bloque 67 y no le sirve a nadie. */
    await expect(aviso).not.toContainText(/Request failed with status/i);
  });

  test('sin sesión, una ruta privada manda al login', async ({ page }) => {
    /* Sin esto, una pantalla protegida podría estar sirviéndose a cualquiera
       y no lo vería nadie: el backend devolvería 403 y la pantalla saldría
       vacía, que es el fallo del bloque 68. */
    await page.context().clearCookies();
    await page.goto('/indicadores');
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});
