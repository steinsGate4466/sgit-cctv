import { test, expect } from '@playwright/test';
import { entrar, vigilarConsola } from './apoyo';

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

/**
 * EL BARRIDO DEL MENÚ — se corre con LOS DOS perfiles (bloque 94).
 *
 * =============================================================================
 *  POR QUÉ NO BASTABA CON EL PERFIL ESTRECHO
 * =============================================================================
 *  Este barrido nació para cazar el fallo que este proyecto ha tenido TRES
 *  veces —bloques 68, 77 y 83—: una entrada de menú abierta con su endpoint
 *  cerrado. El usuario la ve, la pulsa, sale 403 y la pantalla queda vacía.
 *  No rompe nada, y por eso tarda meses en verse.
 *
 *  Corría SÓLO con el perfil estrecho, y eso deja fuera **las treinta pantallas
 *  que sólo ve el Jefe de Mantenimiento**: Indicadores, Dashboard, Exportar,
 *  Hojas de ruta, Criticidad, Limpieza, Auditoría, Roles… Ninguna se abría
 *  nunca en la CI. Ahí estuvieron escondidos los tres bugs reales que salieron
 *  en los bloques 88, 89 y 90.
 *
 *  Con los dos perfiles se cubren las 52 entradas del menú.
 *
 * =============================================================================
 *  LO QUE COMPRUEBA CADA UNO ES DISTINTO, y por eso son dos y no uno
 * =============================================================================
 *  · Con el ESTRECHO: que no haya ninguna entrada que él vea y no pueda abrir.
 *  · Con el JEFE: que ninguna de las pantallas de gestión reviente al cargar.
 *    El Jefe lo ve todo, así que con él no se detecta un permiso mal repartido
 *    — pero sí un fallo de la propia pantalla, que es lo otro que se busca.
 */
async function todoElMenuSeAbre(page: any) {
  const enlaces = page.locator('nav a[href^="/"], .sidebar a[href^="/"]');
  const rutas = [...new Set(await enlaces.evaluateAll(
    (as: any[]) => as.map((a) => a.getAttribute('href') || ''),
  ))].filter((r) => r && r !== '/login') as string[];

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
  return { rutas, vacias };
}

test.describe('5b · El Jefe de Mantenimiento abre TODO su menú', () => {
  test('las pantallas de gestión se abren, ninguna vacía ni con error', async ({ page }) => {
    const errores = vigilarConsola(page);
    await entrar(page);
    const { rutas, vacias } = await todoElMenuSeAbre(page);

    expect(
      vacias,
      `Estas pantallas salen en el menú del Jefe y NO se abren:\n  ${vacias.join('\n  ')}`,
    ).toHaveLength(0);

    /* El Jefe lo ve todo: si el recorrido cubriera cuatro entradas sería que
       el menú no cargó, no que el reparto sea estrecho. Se dice aquí para que
       un fallo de carga no pase por un resultado bueno. */
    expect(rutas.length, `Sólo se recorrieron ${rutas.length} entradas: el menú no cargó entero`)
      .toBeGreaterThan(20);

    expect(errores, `Errores en consola durante el recorrido: ${errores.join(' | ')}`)
      .toHaveLength(0);
  });
});

test.describe('5 · El perfil estrecho ve lo suyo, y lo ve ENTERO', () => {
  test.skip(!process.env.E2E_TECNICO_EMAIL, 'Sin E2E_TECNICO_EMAIL no se puede probar el reparto de permisos.');

  test('todo lo que sale en su menú SE ABRE — ninguna pantalla vacía por 403', async ({ page }) => {
    /* ÉSTA ES LA PRUEBA QUE HABRÍA CAZADO EL BLOQUE 68 Y EL 83.
       Recorre las entradas que el usuario ve y comprueba que cada una carga.
       Si el menú la enseña y el endpoint la cierra, aquí se cae. */
    await entrar(page, 'TECNICO');
    const { vacias } = await todoElMenuSeAbre(page);

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
