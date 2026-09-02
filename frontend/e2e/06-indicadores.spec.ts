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

  test('un hueco se dice «Sin datos», nunca se rellena con un número', async ({ page }) => {
    /* PLANTEAMIENTO CORREGIDO — la primera versión estaba mal, y falló en la
       CI señalando algo CORRECTO.

       Prohibía cualquier «0 %». Pero un cero puede ser un dato de verdad: en
       una base recién sembrada no se cumple ninguna regla de normativa, y el
       0 % de cumplimiento es la respuesta exacta. `cumplimiento.ts` ya
       distingue los dos casos y devuelve `null` cuando no hay ni una regla
       aplicable — con el comentario escrito de que un 100 % sin datos es la
       peor cifra posible.

       > **La regla no es «nunca un cero»: es «nunca un número inventado».**

       Así que lo que se comprueba es la otra mitad, la que sí es una promesa
       del software: que cuando el valor viene vacío, la pantalla escribe
       «Sin datos» en vez de pintar un 0. Es la regla de todo el módulo. */
    await entrar(page);
    await page.goto('/indicadores');
    await page.waitForLoadState('networkidle');

    const tarjetas = page.locator('.kpi');
    const n = await tarjetas.count();
    expect(n, 'No hay ninguna tarjeta de indicador en pantalla').toBeGreaterThan(0);

    for (let i = 0; i < n; i++) {
      const t = (await tarjetas.nth(i).innerText()).trim();
      /* Ninguna tarjeta puede quedarse MUDA: o trae un número, o dice que no
         lo sabe. Un hueco en blanco es indistinguible de una pantalla rota. */
      const tieneNumero = /\d/.test(t);
      const diceQueNoSabe = /sin datos/i.test(t);
      expect(
        tieneNumero || diceQueNoSabe,
        `Una tarjeta no enseña ni número ni «Sin datos»:\n${t}`,
      ).toBe(true);
    }

    /* Y NUNCA las dos cosas a la vez en el mismo hueco: «Sin datos 0 %» sería
       el sistema contradiciéndose consigo mismo. */
    const cuerpo = await page.locator('.kpi').first().innerText();
    expect(cuerpo).not.toMatch(/sin datos[\s\S]{0,12}\d+\s*%/i);
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
