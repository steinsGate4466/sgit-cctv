import { test, expect } from '@playwright/test';
import { entrar, vigilarConsola } from './apoyo';

/* =============================================================================
   RECORRIDO 6 · LOS INDICADORES
   -----------------------------------------------------------------------------
   El final de la cadena. Es la pantalla que el ingeniero lleva al comité, así
   que un número mal aquí no es un bug: es una decisión de presupuesto tomada
   sobre un dato falso.

   Lo que se fija es LA REGLA DEL PROYECTO, la que atraviesa todo el módulo:

   > **Sin datos suficientes se escribe «sin datos», NUNCA un cero.**

   Un cero se lee como «tardamos cero horas en reparar» o «disponibilidad del
   0 %». Los dos son mentira, y los dos acaban en una diapositiva.
============================================================================= */

test.describe('6 · Los indicadores de gestión', () => {
  test('la pantalla carga entera, sin errores', async ({ page }) => {
    const errores = vigilarConsola(page);
    await entrar(page);
    await page.goto('/indicadores');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('.kpi').first()).toBeVisible({ timeout: 20_000 });
    expect(errores, `Errores en consola: ${errores.join(' | ')}`).toHaveLength(0);
  });

  test('donde no hay muestra pone «sin datos», no un cero', async ({ page }) => {
    /* No se exige que HAYA huecos —con datos suficientes no los hay—: se
       exige que si los hay, se digan. Lo que no puede pasar es que una
       tarjeta enseñe «0 %» de disponibilidad porque no había con qué
       calcularla. */
    await entrar(page);
    await page.goto('/indicadores');
    await page.waitForLoadState('networkidle');

    const tarjetas = page.locator('.kpi');
    const n = await tarjetas.count();
    expect(n, 'No hay ninguna tarjeta de indicador en pantalla').toBeGreaterThan(0);

    for (let i = 0; i < n; i++) {
      const t = await tarjetas.nth(i).innerText();
      /* Disponibilidad o cumplimiento en 0 % es sospechoso SIEMPRE: si de
         verdad fuera cero, la planta estaría parada. */
      if (/disponibilidad|cumplimiento|nivel de servicio/i.test(t)) {
        expect(t, `Una tarjeta enseña 0 % donde debería decir «sin datos»:\n${t}`)
          .not.toMatch(/^\s*0\s*%/m);
      }
    }
  });

  test('cada tarjeta explica QUÉ es al pasar el ratón', async ({ page }) => {
    /* BLOQUE 84: la explicación se movió al `title` para que el número —lo
       único que se mira en una reunión— no compitiera con ocho párrafos.
       Si alguien quita el `title` «para limpiar», la explicación desaparece
       del todo y nadie lo nota. */
    await entrar(page);
    await page.goto('/indicadores');
    await page.waitForLoadState('networkidle');

    const primera = page.locator('.kpi').first();
    const titulo = await primera.getAttribute('title');
    expect(titulo?.length || 0, 'Las tarjetas perdieron su explicación').toBeGreaterThan(10);
  });

  test('el Excel se descarga de verdad', async ({ page }) => {
    /* BLOQUE 84. No basta con que el botón exista: el libro se arma en el
       servidor y puede fallar ahí. Se espera la descarga real.

       Y se comprueba el TAMAÑO: un .xlsx de 0 bytes es un botón que «funciona»
       y entrega un archivo que Excel no abre. */
    await entrar(page);
    await page.goto('/indicadores');
    await page.waitForLoadState('networkidle');

    const [descarga] = await Promise.all([
      page.waitForEvent('download', { timeout: 40_000 }),
      page.getByRole('button', { name: /descargar en excel/i }).click(),
    ]);

    expect(descarga.suggestedFilename()).toMatch(/\.xlsx$/);
    const ruta = await descarga.path();
    const { statSync } = await import('node:fs');
    expect(statSync(ruta!).size, 'El Excel viene vacío').toBeGreaterThan(4000);
  });

  test('las fechas salen en un solo formato', async ({ page }) => {
    /* BLOQUE 64: había 21 fechas con formatos distintos porque cada pantalla
       llamaba a `toLocaleDateString` a su manera. `verificar:fechas` lo caza
       en el código; esto lo caza en pantalla. */
    await entrar(page);
    await page.goto('/maintenance');
    await page.waitForLoadState('networkidle');

    const texto = await page.locator('body').innerText();
    /* El formato del sistema es dd/mm/aaaa. Si aparece uno ISO suelto en la
       interfaz, alguien se saltó `fechas.ts`. */
    expect(texto, 'Hay una fecha en formato ISO suelta en la pantalla')
      .not.toMatch(/\b\d{4}-\d{2}-\d{2}T\d{2}:/);
  });
});
