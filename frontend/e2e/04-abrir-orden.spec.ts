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
       formulario exige además el equipo, así que el `required` del navegador
       bloqueaba el envío: la petición NO SALÍA y la prueba fallaba veinte
       segundos después con «no aparece en la lista» — un mensaje que apunta a
       la lista cuando el problema estaba en el formulario.

       Y MI SEGUNDA VERSIÓN FUE PEOR, porque parecía arreglada: cogí
       `modal.locator('select').first()` creyendo que era la zona. El primer
       desplegable del formulario es **Tipo**, así que la prueba CAMBIABA EL
       TIPO DE ORDEN y seguía sin rellenar el obligatorio. Es, van ocho, la
       firma de este proyecto: *un patrón más flojo de lo necesario acaba
       leyendo otra cosa.* Se apunta por ETIQUETA, que es lo que el usuario ve.

       CUÁL ES EL OBLIGATORIO DEPENDE DEL TIPO, y por eso no se toca:
         · el tipo por defecto es PREVENTIVO  → exige **Activo**
         · si fuera MAPEO                     → exigiría «Zona a levantar»
       La prueba deja el tipo como nace y rellena el equipo, que es lo que
       hace una persona. */
    /* SE APUNTA AL <label> Y SE BAJA AL <select>, y no con `getByLabel`.
       -----------------------------------------------------------------------
       `getByLabel('Activo', { exact: true })` NO ENCUENTRA NADA, y el motivo
       merece quedar escrito porque volverá a pasar: aquí el control va DENTRO
       de su etiqueta —`<label>Activo <select>…</select></label>`— y el nombre
       accesible de un `<select>` incluye el texto de su opción elegida. O sea
       que ese campo no se llama «Activo» sino «Activo — selecciona —».

       Con `exact` no casa nunca; sin `exact` casaría también con cualquier
       otra etiqueta que contenga la palabra. Lo que no se equivoca es apuntar
       al `<label>` que EMPIEZA por «Activo» y bajar al desplegable de dentro.
       `/^\s*Activo\b/` no casa con «Actividad / descripción», que es la
       trampa evidente. */
    const activo = modal
      .locator('label')
      .filter({ hasText: /^\s*Activo\b/ })
      .locator('select');
    const opciones = await activo.locator('option').count();
    if (opciones <= 1) {
      throw new Error(
        `\n\n  El desplegable de activo trae ${opciones} opción(es).\n`
        + '  Si es 0, la prueba no encontró el campo: mira la etiqueta.\n'
        + '  Si es 1, es sólo el «— selecciona —» y NO HAY EQUIPOS cargados:\n'
        + '  eso, si pasa en planta, es un fallo del software (mira que\n'
        + '  GET /assets/options responda 200 y traiga filas).\n\n',
      );
    }
    await activo.selectOption({ index: 1 });
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
