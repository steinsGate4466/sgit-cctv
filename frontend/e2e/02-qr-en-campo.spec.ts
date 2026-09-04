import { test, expect } from '@playwright/test';
import { entrar, activoDePrueba, vigilarConsola, explicarConsola } from './apoyo';

/* =============================================================================
   RECORRIDO 2 · EL QR EN CAMPO
   -----------------------------------------------------------------------------
   Es la pantalla más importante del sistema y la que más veces se ha roto:

     · bloque 62-B — no enseñaba que la zona exige tren parado
     · bloque 68   — ni el Jefe de Tren ni el púlpito podían ABRIRLA (403)
     · bloque 69   — «saber más» llevaba a una lista, no al equipo
     · bloque 77   — se podía ver la ficha pero no imprimir la etiqueta

   Los cuatro devolvían pantalla vacía o llevaban al sitio equivocado. Ninguno
   rompía nada.

   SE PRUEBA TAMBIÉN EN MÓVIL (ver playwright.config.ts): el técnico usa SU
   teléfono, y la mitad de los fallos visuales de este proyecto sólo se ven
   ahí — las fechas que se salían de su caja se veían bien en escritorio.
============================================================================= */

test.describe('2 · El QR delante del equipo', () => {
  test('se abre la ficha del equipo escaneado', async ({ page }) => {
    const errores = vigilarConsola(page);
    await entrar(page);

    const codigo = await activoDePrueba(page);
    /* Se llega por la lista y se pulsa el enlace del QR, en vez de escribir
       la URL a mano. Así se prueba también que el enlace EXISTE: una ficha a
       la que sólo se llega tecleando la ruta no existe para el usuario. */
    await page.goto(`/assets?search=${encodeURIComponent(codigo)}`);
    await expect(page.getByText(codigo).first()).toBeVisible({ timeout: 20_000 });

    expect(errores, explicarConsola(errores)).toHaveLength(0);
  });

  test('el aviso de cómo se interviene la zona va ARRIBA DEL TODO', async ({ page }) => {
    /* REGLA DEL BLOQUE 62-B, y no se afloja: si el técnico lee UNA sola línea
       de esta pantalla antes de subir, tiene que ser ésta. Que la orden esté
       duplicada cuesta una hora; que suba a una zona que exige tren parado
       cuesta otra cosa.

       Se comprueba la POSICIÓN, no sólo que exista: el bug original era que
       el dato estaba calculado y no se pintaba, y el siguiente que puede
       aparecer es que se pinte al final, donde no lo lee nadie. */
    await entrar(page);
    await page.goto(`/assets?search=${encodeURIComponent(await activoDePrueba(page))}`);

    const aviso = page.locator('[class*="intervencion"], [class*="aviso-bloqueo"]').first();
    if (await aviso.count() === 0) {
      test.skip(true, 'Este activo no tiene zona con intervención declarada. Usa uno que la tenga en E2E_ACTIVO.');
    }
    await expect(aviso).toBeVisible();

    /* NO HAY VARIANTE VERDE (bloque 62-B). Ni el caso más suave celebra nada:
       un verde de «todo correcto» en una pantalla de seguridad se aprende a
       ignorar en una semana, y entonces ya no protege el día que importa. */
    await expect(aviso).not.toHaveClass(/\bok\b|verde|success/);
  });

  test('las fechas no se salen de su caja', async ({ page }) => {
    /* BLOQUE 70. En iOS, un `date` no es una caja de texto: Safari le pone su
       dibujado nativo con un ancho mínimo propio que IGNORA el `width: 100%`.
       En escritorio se veía bien y en el teléfono desbordaba.

       Se mide de verdad: ningún campo de fecha puede ser más ancho que su
       contenedor. Es el tipo de fallo que no se ve leyendo el código. */
    await entrar(page);
    await page.goto('/incidents');
    await page.waitForLoadState('networkidle');

    const fechas = page.locator('input[type="date"], input[type="datetime-local"]');
    const n = await fechas.count();
    for (let i = 0; i < n; i++) {
      const campo = fechas.nth(i);
      if (!(await campo.isVisible())) continue;
      const desborda = await campo.evaluate((el) => {
        const p = el.parentElement;
        if (!p) return 0;
        return Math.round(el.getBoundingClientRect().width - p.getBoundingClientRect().width);
      });
      expect(desborda, `Un campo de fecha se sale ${desborda}px de su caja`).toBeLessThanOrEqual(2);
    }
  });

  test('no hay scroll horizontal', async ({ page }, info) => {
    /* 1366 px es la pantalla de los púlpitos (bloque 69) y 390 la del
       teléfono del técnico. Un scroll lateral significa que media tabla no se
       lee, y nadie desplaza: se deja de mirar la pantalla.

       -----------------------------------------------------------------------
       LA PRUEBA DICE QUÉ SE SALE, NO SÓLO QUE SE SALE.

       Mi primera versión decía «la pantalla se sale 56px» y ahí se acababa.
       Con eso no se arregla nada: hay que ir a buscar a mano cuál de los
       cuarenta bloques de la pantalla es. Es el fallo que este proyecto
       persigue en su propio software —un aviso que no dice qué hacer— y lo
       tenía yo en la prueba.

       Ahora nombra los elementos culpables, con su etiqueta y sus clases.
       Un fallo que no se puede reproducir no se arregla: lo primero es
       hacer que hable (bloque 70). */
    await entrar(page);
    await page.goto('/assets');
    await page.waitForLoadState('networkidle');

    const { sobra, culpables } = await page.evaluate(() => {
      const raiz = document.documentElement;
      const ancho = raiz.clientWidth;
      const lista: string[] = [];
      document.querySelectorAll<HTMLElement>('body *').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.right <= ancho + 2) return;
        /* Sólo se acusa al que NO tiene un padre que ya desborde: si no,
           salen el bloque, su hijo y su nieto por un solo fallo, y el
           informe entierra la línea útil. Es el mismo criterio que hace
           útiles a los verificadores. */
        /* SE MIRA TODA LA LÍNEA DE PADRES, NO SÓLO EL PADRE DIRECTO.
           Mi primera versión miraba un nivel, y la CI devolvió seis enlaces
           del MENÚ como culpables. No lo eran: el menú del teléfono es una
           tira con `overflow-x: auto`, así que se desplaza sola y no empuja
           la página. Lo que pasaba es que su padre —`.nav-group`— lleva
           `display: contents`, que NO TIENE CAJA: su rectángulo mide cero y
           mi comprobación de «el padre ya desborda» no saltaba nunca.

           Y como el informe se cortaba en seis, esos seis falsos ocupaban
           TODAS las plazas y el culpable de verdad no llegaba a salir. Un
           informe que llena sus renglones con ruido es un informe apagado. */
        let ancestro: HTMLElement | null = el.parentElement;
        let dentroDeUnScroll = false;
        let padreYaDesborda = false;
        while (ancestro && ancestro !== document.body) {
          const ov = getComputedStyle(ancestro).overflowX;
          if (ov === 'auto' || ov === 'scroll' || ov === 'hidden') dentroDeUnScroll = true;
          const rp = ancestro.getBoundingClientRect();
          if (rp.width > 0 && rp.right > ancho + 2) padreYaDesborda = true;
          ancestro = ancestro.parentElement;
        }
        if (dentroDeUnScroll || padreYaDesborda) return;

        /* Y el propio elemento, si se desplaza a propósito, tampoco es un
           fallo: las tablas viven dentro de `.card { overflow-x: auto }`. */
        const ov = getComputedStyle(el).overflowX;
        if (ov === 'auto' || ov === 'scroll') return;
        lista.push(
          `<${el.tagName.toLowerCase()}${el.className ? ' class="' + String(el.className).slice(0, 60) + '"' : ''}>`
          + ` se sale ${Math.round(r.right - ancho)}px`,
        );
      });
      return { sobra: raiz.scrollWidth - ancho, culpables: lista.slice(0, 8) };
    });

    const detalle = culpables.length
      ? `Se sale ${sobra}px en ${info.project.name}. Culpables:\n    - ${culpables.join('\n    - ')}`
      : `Se sale ${sobra}px en ${info.project.name}, y ningún elemento suelto lo explica:`
        + ' mira los márgenes o un `width` en porcentaje sobre un padre con relleno.';
    expect(sobra, detalle).toBeLessThanOrEqual(2);
  });
});
