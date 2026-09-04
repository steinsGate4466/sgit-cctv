import { test, expect } from '@playwright/test';
import { entrar, vigilarConsola, explicarConsola } from './apoyo';

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
    /* SE NAVEGA COMO NAVEGA UNA PERSONA: PULSANDO EL MENÚ.
       -----------------------------------------------------------------------
       Antes esto hacía `page.goto(ruta)` treinta veces, y un `goto` es una
       RECARGA COMPLETA: rearranca React y vuelve a pedir la base de cada
       pantalla —`/auth/me`, `/locations`, `/cabinets`, `/assets/options`,
       `/electricidad/tableros`, las etapas…— una vez por ruta.

       Treinta recargas en cinco segundos son unas 240 peticiones del mismo
       usuario, y `RitmoGuard` las cortó con 429. **Y tenía razón**: su propio
       comentario dice «da para abrir 100 pantallas en un minuto; nadie trabaja
       así, y un bucle sí». El bucle era esta prueba.

       El freno NO se toca y el cupo NO se sube: es la defensa que cubre las
       353 rutas. Lo que se arregla es el recorrido, que además así se parece
       a lo que hace el usuario — dentro de la aplicación, sin recargar.
       Si el enlace no se pudiera pulsar, se cae a `goto`: eso es un fallo de
       la pantalla y tiene que salir, no taparse. */
    const enlace = page.locator(`nav a[href="${ruta}"], .sidebar a[href="${ruta}"]`).first();
    const pulsado = await enlace.click({ timeout: 5_000 }).then(() => true).catch(() => false);
    if (!pulsado) await page.goto(ruta, { waitUntil: 'domcontentloaded' });

    /* NO SE ESPERA A `networkidle`, y esto costó una ejecución roja.
       -----------------------------------------------------------------------
       `networkidle` espera 500 ms SIN NINGUNA petición. Con el Jefe el barrido
       son ~30 pantallas y varias siguen pidiendo datos después de pintar
       —Sesiones se refresca sola cada 30 s (bloque 82)—, así que cada ruta
       pagaba una espera que no aporta nada. El barrido tardaba 44,4 s contra
       un tope de prueba de 45: el reintento se quedó SIN TIEMPO y el corte
       abortó las peticiones en vuelo, que el navegador escribe en consola
       como «blocked by CORS policy» + `net::ERR_FAILED`.

       Eso hizo que un problema de MI andamio se leyera como un fallo de CORS
       del servidor. Lo que interesa aquí es que la pantalla PINTE, así que se
       espera a que aparezca su contenedor y ya. */
    await expect(page).toHaveURL(new RegExp(ruta.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'), { timeout: 15_000 })
      .catch(() => {});
    const contenedor = page.locator('main, .page, .contenido').first();
    await contenedor.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});

    const cuerpo = await contenedor.innerText().catch(() => '');

    /* «No tienes permiso» EN UNA PANTALLA QUE EL MENÚ ENSEÑA es el fallo
       exacto. Y una pantalla con menos de 20 caracteres útiles es una
       pantalla en blanco, aunque no diga nada. */
    if (/no tienes permiso|403|forbidden/i.test(cuerpo) || cuerpo.trim().length < 20) {
      vacias.push(`${ruta} → "${cuerpo.trim().slice(0, 60)}"`);
    }
  }
  return { rutas, vacias };
}

/* UN FALLO DE RED NO ES UN FALLO DE LA PANTALLA, y mezclarlos manda a buscar
   al sitio equivocado.
   ---------------------------------------------------------------------------
   Cuando una petición no llega a contestar —el servidor se cayó, se saturó, o
   la prueba se quedó sin tiempo y abortó lo que había en vuelo— el navegador
   NO dice «no hubo respuesta»: dice «blocked by CORS policy: no
   Access-Control-Allow-Origin», seguido de `net::ERR_FAILED`. Los dos van
   siempre en pareja, y leídos de golpe parecen un CORS mal configurado.

   Pasó: 46 líneas de consola señalando a CORS cuando CORS estaba perfecto.
   Se separan los dos montones y cada uno dice DÓNDE mirar. Ninguno se
   silencia: los dos siguen tumbando la prueba. */
function repartirErrores(errores: string[]) {
  /* CADA NAVEGADOR LO DICE CON OTRAS PALABRAS, y hay que reconocer las dos.
       Chromium: «blocked by CORS policy» + `net::ERR_FAILED`
       WebKit  : «is not allowed by Access-Control-Allow-Origin. Status code: 429»
                 y «cannot load … due to access control checks»
     WebKit es el que dio la pista buena, porque es el único que imprime el
     CÓDIGO. Un patrón que sólo conociera la forma de Chromium habría metido
     el 429 en el montón de «fallo de la pantalla» y mandado a buscar un bug
     que no existe. */
  const esDeRed = (t: string) =>
    /net::ERR_|Failed to load resource|CORS|Access-Control-Allow-Origin|access control checks|\b429\b/i.test(t);
  return {
    red: errores.filter(esDeRed),
    pantalla: errores.filter((t) => !esDeRed(t)),
  };
}

test.describe('5b · El Jefe de Mantenimiento abre TODO su menú', () => {
  test('las pantallas de gestión se abren, ninguna vacía ni con error', async ({ page }) => {
    /* El tope por defecto son 45 s y ESTO NO ES UNA PRUEBA: es un barrido de
       treinta pantallas. Medido, tardaba 44,4 s — o sea que iba a ponerse roja
       por tiempo el día que el runner fuera un poco más lento, diciendo algo
       que no tiene nada que ver con lo que comprueba. */
    test.setTimeout(180_000);

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

    const { red, pantalla } = repartirErrores(errores);

    expect(pantalla, explicarConsola(pantalla)).toHaveLength(0);
    expect(red, explicarConsola(red)).toHaveLength(0);
  });
});

test.describe('5 · El perfil estrecho ve lo suyo, y lo ve ENTERO', () => {
  test.skip(!process.env.E2E_TECNICO_EMAIL, 'Sin E2E_TECNICO_EMAIL no se puede probar el reparto de permisos.');

  test('todo lo que sale en su menú SE ABRE — ninguna pantalla vacía por 403', async ({ page }) => {
    test.setTimeout(180_000);   // barrido, no prueba suelta (ver 5b)
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
