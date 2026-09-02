import { test, expect } from '@playwright/test';
import { entrar } from './apoyo';

/* =============================================================================
   RECORRIDO 5 · QUIÉN PUEDE QUÉ
   -----------------------------------------------------------------------------
   TRES VECES ha pasado lo mismo en este proyecto —bloques 68, 77 y 83— y las
   tres por la misma causa:

   > **Cerrar un permiso sin preguntarse QUÉ DEJA DE FUNCIONAR.** Cambiar un
   > agujero de seguridad por una función muerta no es un arreglo, y la
   > función muerta tarda MESES en verse: devuelve 403 y la pantalla sale
   > vacía, que es indistinguible de «no hay datos».

   Hay pruebas que leen el código y comprueban los decoradores. **No bastan.**
   Lo que no cazan es que la ENTRADA DEL MENÚ esté abierta y el endpoint
   cerrado, o al revés — media puerta, que es peor que ninguna porque parece
   que funciona.

   Esto se corre con el TÉCNICO, no con el Jefe. El Jefe lo ve todo y por eso
   no sirve para detectar esto.
============================================================================= */

test.describe('5 · El perfil estrecho ve lo suyo, y lo ve ENTERO', () => {
  test.skip(!process.env.E2E_TECNICO_EMAIL, 'Sin E2E_TECNICO_EMAIL no se puede probar el reparto de permisos.');

  test('todo lo que sale en su menú SE ABRE — ninguna pantalla vacía por 403', async ({ page }) => {
    /* ÉSTA ES LA PRUEBA QUE HABRÍA CAZADO EL BLOQUE 68 Y EL 83.
       Recorre las entradas que el usuario ve y comprueba que cada una carga.
       Si el menú la enseña y el endpoint la cierra, aquí se cae. */
    await entrar(page, 'TECNICO');

    const enlaces = page.locator('nav a[href^="/"], .sidebar a[href^="/"]');
    const rutas = [...new Set(await enlaces.evaluateAll(
      (as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href') || ''),
    ))].filter((r) => r && r !== '/login');

    expect(rutas.length, 'Este usuario no ve ninguna entrada de menú').toBeGreaterThan(0);

    const vacias: string[] = [];
    for (const ruta of rutas) {
      await page.goto(ruta);
      await page.waitForLoadState('networkidle');

      const cuerpo = await page.locator('main, .page, .contenido').first()
        .innerText().catch(() => '');

      /* «No tienes permiso» EN UNA PANTALLA QUE EL MENÚ ENSEÑA es el fallo
         exacto. Y una pantalla con menos de 20 caracteres útiles es una
         pantalla en blanco, aunque no diga nada. */
      if (/no tienes permiso|403|forbidden/i.test(cuerpo) || cuerpo.trim().length < 20) {
        vacias.push(`${ruta} → "${cuerpo.trim().slice(0, 60)}"`);
      }
    }

    expect(
      vacias,
      `Estas pantallas salen en el menú y NO se abren:\n  ${vacias.join('\n  ')}`,
    ).toHaveLength(0);
  });

  test('NO puede cerrar una orden: eso es del Jefe de Mantenimiento', async ({ page }) => {
    /* ABRIR NO ES CERRAR (bloque 68). Una orden de más se ve en la lista y se
       anula; una CERRADA de más lleva firma y materiales retirados: afirma
       que un trabajo se hizo.

       `wo.approve` no se ha movido en ocho bloques y esto lo mantiene así. */
    await entrar(page, 'TECNICO');
    await page.goto('/maintenance');
    await page.waitForLoadState('networkidle');

    const cerrar = page.getByRole('button', { name: /^cerrar orden|cerrar OM|aprobar/i });
    expect(
      await cerrar.count(),
      'El técnico está viendo el botón de cerrar la orden. Eso es del Jefe.',
    ).toBe(0);
  });
});
