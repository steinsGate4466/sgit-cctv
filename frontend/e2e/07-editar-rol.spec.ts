import { test, expect } from '@playwright/test';
import { entrar, vigilarConsola } from './apoyo';

/* =============================================================================
   RECORRIDO 7 · GUARDAR UN ROL
   -----------------------------------------------------------------------------
   POR QUÉ EXISTE, y lo encontró el usuario abriendo la pantalla:

       property nombre should not exist

   El formulario de Roles mandaba el MISMO cuerpo al alta y a la edición, y la
   edición no acepta `nombre`. Antes del bloque 85 ese campo de más se ignoraba
   en silencio —el servicio nunca lo leyó—; al escribir el DTO, el
   `ValidationPipe` corre con `forbidNonWhitelisted` y pasó de sobrar a
   **rechazar la petición entera**.

   Resultado: la pantalla que reparte el poder de la planta dejó de guardar, y
   el mensaje estaba en inglés y hablaba de una propiedad, no de lo que pasaba.

   -----------------------------------------------------------------------------
   NO LO VIO NADIE, Y ÉSE ES EL PUNTO

   Ni el typecheck —los dos lados compilan—, ni el lint, ni los verificadores,
   ni las 797 pruebas del backend: el DTO es correcto, el servicio es correcto
   y el formulario es correcto. Lo que estaba mal era el ENCAJE entre dos
   piezas que nadie prueba juntas.

   Es la tercera vez que un recorrido caza algo que sólo se ve abriendo la
   pantalla —la OM sin fecha (b88) y el desborde del teléfono (b89) fueron las
   otras dos—.

   -----------------------------------------------------------------------------
   SE GUARDA SIN CAMBIAR NADA, a propósito. Lo que se prueba es que el cuerpo
   que manda el formulario lo ACEPTA el endpoint. Tocar permisos aquí metería
   las guardas de negocio —«no te quites a ti mismo user.manage»— y entonces
   un fallo legítimo del guard parecería un fallo del encaje: dos cosas
   distintas con el mismo rojo.
============================================================================= */

test.describe('7 · La pantalla de Roles guarda de verdad', () => {
  test('editar un rol y guardar NO devuelve un error de validación', async ({ page }) => {
    const errores = vigilarConsola(page);
    await entrar(page);
    await page.goto('/roles');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /Editar/ }).first().click();
    const modal = page.locator('.modal');
    await expect(modal).toBeVisible();

    /* Se escucha la respuesta, no el aspecto de la pantalla. El aviso de error
       vive DENTRO del modal (bloque 64), así que si algún día se cerrara al
       fallar, mirar la pantalla no diría nada. El código sí. */
    const [respuesta] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/roles-admin/') && r.request().method() === 'PATCH',
        { timeout: 20_000 },
      ).catch(() => null),
      modal.getByRole('button', { name: 'Guardar cambios' }).click(),
    ]);

    const cuerpo = respuesta ? (await respuesta.text().catch(() => '')).slice(0, 300) : '';
    expect(
      respuesta?.status(),
      respuesta
        ? `El servidor rechazó el guardado con ${respuesta.status()}: ${cuerpo}`
        : 'El navegador NO llegó a enviar el guardado del rol.',
    ).toBeLessThan(400);

    /* Y el modal se cierra: si se quedara abierto con el aviso rojo, para el
       usuario el software no guarda, diga lo que diga el código de respuesta. */
    await expect(modal).toBeHidden({ timeout: 15_000 });

    expect(errores, `Errores en consola: ${errores.join(' | ')}`).toHaveLength(0);
  });
});
