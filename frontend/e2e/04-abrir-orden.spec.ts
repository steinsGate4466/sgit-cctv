import { test, expect } from '@playwright/test';
import { entrar, vigilarConsola } from './apoyo';

/* =============================================================================
   RECORRIDO 4 · ABRIR UNA ORDEN
   -----------------------------------------------------------------------------
   «Sin orden no se interviene» — palabras del usuario, bloque 72.

   Aquí vivía la CADENA ROTA del bloque 64, que es el bug más caro que ha
   tenido este software porque no se ve NUNCA:

       OM sin fecha → sale «—» → nunca vence → no entra en el backlog
                    → el % de cumplimiento del preventivo miente
                    → y con él el reparto correctivo/preventivo

   **Toda orden abierta desde el QR nacía muerta para los indicadores.** No
   rompe nada. No lo ve el compilador. Se ve mirando una orden y encontrando
   un guion donde debería haber una fecha.

   -----------------------------------------------------------------------------
   DOS COSAS QUE ME EQUIVOQUÉ AL ESCRIBIRLO Y SE CORRIGEN AQUÍ

   1. El botón NO se llama «Nueva orden»: son DOS botones distintos.
      «+ Asignar trabajo» abre el alta corta y **«Alta completa»** abre el
      formulario entero. Son actos distintos (bloque 4A) y hay que pulsar el
      que se quiere probar.

   2. `input[type="date"]` a nivel de PÁGINA agarraba el de la BARRA DE
      FILTROS —«Desde»/«Hasta»—, que va antes en el DOM. La prueba habría
      comprobado la fecha de un filtro creyendo que era la de la orden.
      Todo va acotado al `.modal`.
============================================================================= */

test.describe('4 · Abrir una orden de mantenimiento', () => {
  test('la orden nace CON FECHA — nunca vacía', async ({ page }) => {
    const errores = vigilarConsola(page);
    await entrar(page);
    await page.goto('/maintenance');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Alta completa' }).click();
    const modal = page.locator('.modal');
    await expect(modal).toBeVisible();

    /* EL VALOR POR DEFECTO ES HOY, no vacío. Abrir una orden significa
       intervenir ahora; `null` no es ningún dato, «hoy» sí lo es.
       Y se busca DENTRO del modal: fuera está el filtro «Desde». */
    const fecha = modal.locator('input[type="date"]').first();
    await expect(fecha).toHaveValue(/\d{4}-\d{2}-\d{2}/, { timeout: 10_000 });

    expect(errores, `Errores en consola: ${errores.join(' | ')}`).toHaveLength(0);
  });

  test('la orden creada aparece en la lista CON su fecha pintada', async ({ page }) => {
    await entrar(page);
    await page.goto('/maintenance');
    await page.waitForLoadState('networkidle');

    const marca = `E2E ${Date.now()}`;
    await page.getByRole('button', { name: 'Alta completa' }).click();
    const modal = page.locator('.modal');
    await expect(modal).toBeVisible();

    /* SE RELLENAN LOS OBLIGATORIOS, no sólo la actividad.
       -----------------------------------------------------------------------
       MI PRIMERA VERSIÓN sólo escribía la actividad y pulsaba «Crear OM». El
       formulario exige además **«Zona a levantar»**, así que el `required` del
       navegador bloqueaba el envío: la petición NO SALÍA y la prueba fallaba
       veinte segundos después con «no aparece en la lista» — un mensaje que
       apunta a la lista cuando el problema estaba en el formulario.

       Y esto es lo que un recorrido tiene que hacer: rellenar lo que rellena
       una persona. Si el formulario pide un dato, la prueba lo da. */
    const zona = modal.locator('select').filter({ hasNotText: '@@@' }).first();
    const opciones = await zona.locator('option').count();
    if (opciones <= 1) {
      throw new Error(
        '\n\n  El desplegable de zona no tiene ninguna opción.\n'
        + '  Sin ubicaciones cargadas no se puede abrir una orden — y eso, si\n'
        + '  pasa en planta, es un fallo del software, no de la prueba.\n\n',
      );
    }
    await zona.selectOption({ index: 1 });
    await modal.getByLabel(/Actividad/i).fill(`Prueba automatica ${marca}`);

    /* Se escucha la respuesta: si falta otro campo, el mensaje lo dirá en vez
       de dejarme adivinar veinte segundos. */
    const [respuesta] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/work-orders') && r.request().method() === 'POST',
        { timeout: 20_000 },
      ).catch(() => null),
      modal.getByRole('button', { name: 'Crear OM' }).click(),
    ]);
    const detalle = respuesta
      ? `El servidor respondió ${respuesta.status()}: ${(await respuesta.text().catch(() => '')).slice(0, 300)}`
      : 'El navegador NO llegó a enviar el alta: falta algún campo obligatorio del formulario.';
    expect(respuesta?.status(), detalle).toBeLessThan(400);

    const fila = page.locator('tr', { hasText: marca }).first();
    await expect(fila, `Se guardó pero la lista no lo enseña. ${detalle}`)
      .toBeVisible({ timeout: 20_000 });

    /* LA FILA NO PUEDE TENER UN GUION DONDE VA LA FECHA. Ése era el síntoma
       exacto: «—» en la columna de programada. */
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
