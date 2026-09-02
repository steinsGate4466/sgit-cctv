import { test, expect } from '@playwright/test';
import { entrar, vigilarConsola } from './apoyo';

/* =============================================================================
   RECORRIDO 3 · REPORTAR UNA INCIDENCIA
   -----------------------------------------------------------------------------
   Aquí vivía el bug número 3 del bloque 64, y es el que mejor explica por qué
   existe todo este archivo:

   > «Reportar avería no hace nada». Se cerraba el formulario aunque la
   > respuesta viniera vacía, y el aviso de error vive DENTRO de ese
   > formulario: al cerrarlo se volvía invisible.

   El usuario veía la pantalla volver atrás en silencio y concluía —con razón—
   que el software no funciona. **Eso no lo caza ningún typecheck.**
============================================================================= */

test.describe('3 · Reportar una incidencia', () => {
  test('se crea y APARECE en la lista', async ({ page }) => {
    const errores = vigilarConsola(page);
    await entrar(page);
    await page.goto('/incidents');
    await page.waitForLoadState('networkidle');

    const antes = await page.locator('table.tabla tbody tr').count();

    await page.getByRole('button', { name: /nueva|reportar|\+/i }).first().click();

    /* Marca de tiempo en el título: así la prueba encuentra SU incidencia y
       no una de otra ejecución. Sin esto, la segunda vez que corre pasaría
       en verde aunque no hubiera creado nada. */
    const marca = `E2E ${Date.now()}`;
    const titulo = page.getByLabel(/t[ií]tulo|descripci[óo]n|qu[ée] pasa/i).first();
    await titulo.fill(`Prueba automática ${marca}`);

    await page.getByRole('button', { name: /guardar|crear|reportar|enviar/i }).last().click();

    /* SE COMPRUEBA QUE APARECE, no que el formulario se cerró.
       El bug era exactamente ése: el formulario se cerraba SIEMPRE, hubiera
       ido bien o mal. Que se cierre no demuestra nada. */
    await expect(page.getByText(marca).first()).toBeVisible({ timeout: 20_000 });

    const despues = await page.locator('table.tabla tbody tr').count();
    expect(despues, 'La lista no creció: se guardó de mentira').toBeGreaterThan(antes);

    expect(errores, `Errores en consola: ${errores.join(' | ')}`).toHaveLength(0);
  });

  test('un formulario incompleto DICE qué falta, no se queda muerto', async ({ page }) => {
    /* BLOQUE 67, el hallazgo de fondo: 32 botones se apagaban porque faltaba
       un dato y NINGUNO decía cuál. Un `disabled` de verdad no se puede
       pulsar, no dispara eventos y no hay forma de preguntarle por qué. El
       usuario ve el botón muerto y concluye que el software está roto.

       La decisión fue: si falta un dato, el botón SE QUEDA VIVO, se puede
       pulsar, no envía nada y dice qué falta. Esto lo fija. */
    await entrar(page);
    await page.goto('/incidents');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /nueva|reportar|\+/i }).first().click();

    const enviar = page.getByRole('button', { name: /guardar|crear|reportar|enviar/i }).last();

    /* El botón NO puede estar `disabled` a secas: tiene que ser pulsable para
       poder explicarse. `aria-disabled` sí — le dice al lector de pantalla
       que no está disponible sin sacarlo del recorrido del teclado. */
    await expect(enviar).toBeEnabled();

    await enviar.click();
    /* Y al pulsarlo con el formulario vacío, aparece el motivo. Antes de
       pulsar NO se enseña: pintar «falta el nombre» al abrir un formulario
       vacío es regañar a alguien por no haber empezado. */
    await expect(
      page.locator('[class*="motivo"], [class*="falta"], .aviso-error, .error').first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
