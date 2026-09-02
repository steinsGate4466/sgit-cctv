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

   -----------------------------------------------------------------------------
   TODO SE BUSCA DENTRO DEL MODAL, y no en la pantalla entera.

   La pantalla de Incidencias tiene una BARRA DE FILTROS con sus propios
   `<label>Buscar`, `<label>Desde`, `<label>Hasta`… y esos campos aparecen
   ANTES en el DOM que los del formulario. Un `.first()` a nivel de página
   agarra el del filtro y la prueba falla señalando algo que está bien.

   Es el mismo error que este proyecto lleva cazándose desde el verificador 9:
   un patrón más flojo de lo necesario acaba leyendo otra cosa.
============================================================================= */

test.describe('3 · Reportar una incidencia', () => {
  test('se crea y APARECE en la lista', async ({ page }) => {
    const errores = vigilarConsola(page);
    await entrar(page);
    await page.goto('/incidents');
    await page.waitForLoadState('networkidle');

    const antes = await page.locator('table.tabla tbody tr').count();

    await page.getByRole('button', { name: 'Nueva incidencia' }).click();
    const modal = page.locator('.modal');
    await expect(modal).toBeVisible();

    /* Marca de tiempo en el título: así la prueba encuentra SU incidencia y
       no una de otra ejecución. Sin esto, la segunda vez que corre pasaría
       en verde aunque no hubiera creado nada. */
    const marca = `E2E ${Date.now()}`;
    await modal.getByLabel('Título').fill(`Prueba automatica ${marca}`);
    await modal.getByRole('button', { name: 'Crear incidencia' }).click();

    /* SE COMPRUEBA QUE APARECE, no que el formulario se cerró.
       El bug era exactamente ése: el formulario se cerraba SIEMPRE, hubiera
       ido bien o mal. Que se cierre no demuestra nada. */
    await expect(page.getByText(marca).first()).toBeVisible({ timeout: 20_000 });

    const despues = await page.locator('table.tabla tbody tr').count();
    expect(despues, 'La lista no creció: se guardó de mentira').toBeGreaterThan(antes);

    expect(errores, `Errores en consola: ${errores.join(' | ')}`).toHaveLength(0);
  });

  test('el formulario no se cierra en silencio si algo falla', async ({ page }) => {
    /* Se corta la petición A PROPÓSITO para provocar el fallo. Es la única
       forma de comprobar el bug original: que el formulario se cerraba igual
       y el aviso —que vive dentro— desaparecía con él.

       Lo que se exige es lo mínimo defendible: o sigue abierto para poder
       enseñar el error, o hay un aviso visible fuera. Lo que NO puede pasar
       es que desaparezca todo sin decir nada. */
    await entrar(page);
    await page.goto('/incidents');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Nueva incidencia' }).click();
    const modal = page.locator('.modal');
    await modal.getByLabel('Título').fill('Prueba de fallo E2E');

    await page.route('**/incidents', (r) => r.abort('failed'), { times: 1 });
    await modal.getByRole('button', { name: 'Crear incidencia' }).click();

    const sigueAbierto = await modal.isVisible().catch(() => false);
    const hayAviso = await page.locator('.error, .aviso-error, .modal-overlay')
      .first().isVisible().catch(() => false);

    expect(
      sigueAbierto || hayAviso,
      'El formulario se cerró y no quedó ningún aviso: el usuario no sabe que falló',
    ).toBe(true);
  });
});
