import { test, expect } from '@playwright/test';
import { entrar, vigilarConsola } from './apoyo';

/* =============================================================================
   RECORRIDO 4 · CONVERTIR LA INCIDENCIA EN ORDEN
   -----------------------------------------------------------------------------
   «Sin orden no se interviene» — palabras del usuario, bloque 72. Una
   incidencia que se queda en incidencia no mueve a nadie.

   Aquí vivía el bug de la CADENA ROTA del bloque 64, que es el más caro de
   todos los que ha tenido este software porque no se ve NUNCA:

       OM sin fecha → sale «—» → nunca vence → no entra en el backlog
                    → el % de cumplimiento del preventivo miente
                    → y con él el reparto correctivo/preventivo

   **Toda orden abierta desde el QR nacía muerta para los indicadores.** No
   rompe nada. No lo ve el compilador. Se ve mirando una orden y viendo un
   guion donde debería haber una fecha.
============================================================================= */

test.describe('4 · De incidencia a orden', () => {
  test('la orden nace CON FECHA — nunca vacía', async ({ page }) => {
    const errores = vigilarConsola(page);
    await entrar(page);
    await page.goto('/maintenance');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /nueva|crear|generar|\+/i }).first().click();

    /* EL VALOR POR DEFECTO ES HOY, no vacío. Abrir una orden significa
       intervenir ahora; `null` no es ningún dato, «hoy» sí lo es. */
    const fecha = page.locator('input[type="date"]').first();
    await expect(fecha).toHaveValue(/\d{4}-\d{2}-\d{2}/, { timeout: 10_000 });

    expect(errores, `Errores en consola: ${errores.join(' | ')}`).toHaveLength(0);
  });

  test('la orden creada aparece en la lista CON su fecha pintada', async ({ page }) => {
    await entrar(page);
    await page.goto('/maintenance');
    await page.waitForLoadState('networkidle');

    const marca = `E2E ${Date.now()}`;
    await page.getByRole('button', { name: /nueva|crear|generar|\+/i }).first().click();

    const actividad = page.getByLabel(/actividad|trabajo|descripci[óo]n/i).first();
    await actividad.fill(`Prueba automática ${marca}`);
    await page.getByRole('button', { name: /guardar|crear|generar/i }).last().click();

    const fila = page.locator('tr', { hasText: marca }).first();
    await expect(fila).toBeVisible({ timeout: 20_000 });

    /* LA FILA NO PUEDE TENER UN GUION DONDE VA LA FECHA. Ése era el síntoma
       exacto: «—» en la columna de programada. Se comprueba que hay algo con
       pinta de fecha en la fila. */
    await expect(fila).toContainText(/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}/);
  });

  test('los gráficos NO enseñan el nombre interno de la columna', async ({ page }) => {
    /* BUG 4 DEL BLOQUE 64: cinco `<Tooltip>` de recharts sin `formatter`
       enseñaban «value : 3» al pasar el ratón. Lo caza `verificar:graficos`
       leyendo el código; esto lo caza EN PANTALLA, que es donde se vio. */
    await entrar(page);
    await page.goto('/indicadores');
    await page.waitForLoadState('networkidle');

    const texto = await page.locator('body').innerText();
    expect(texto, 'Un gráfico está enseñando el nombre interno de una columna')
      .not.toMatch(/\bvalue\s*:|\bname\s*:\s*\w/);
  });
});
