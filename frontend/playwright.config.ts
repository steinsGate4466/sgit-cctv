import { defineConfig, devices } from '@playwright/test';

/* =============================================================================
   RECORRIDOS QUE ABREN EL SOFTWARE — bloque 85
   =============================================================================

   POR QUÉ EXISTE ESTO, y está escrito tres veces en CLAUDE.md:

   > **Las 1.152 pruebas de este proyecto NO ABREN EL SOFTWARE.** Comprueban
   > que el código está bien escrito. Ninguna comprueba que funcione.

   Y costó dos veces lo mismo: cuatro bugs de bulto delante del ingeniero
   (bloque 64) y lo que encontró una desarrolladora en veinte minutos (bloque
   67). Los ocho se veían ABRIENDO la pantalla, y ninguno rompe nada — por eso
   pasaban el typecheck, el lint y los 28 verificadores.

   Esto es el tercer escalón de la regla del proyecto:

       verificar que la copia es fiel ≠ que el original es correcto
       compilar un archivo suelto     ≠ hacer el typecheck
       pasar el typecheck             ≠ QUE FUNCIONE

   -----------------------------------------------------------------------------
   NO CORRE CONTRA PRODUCCIÓN. NUNCA.

   Estos recorridos ESCRIBEN: crean incidencias y órdenes. Contra Railway eso
   ensuciaría los indicadores de la planta con datos de prueba, y peor:
   `nivelDeServicio` y el reparto correctivo/preventivo se calculan sobre esas
   órdenes. Una prueba que falsea el indicador que el ingeniero lleva al comité
   es peor que no tener prueba.

   Por eso `baseURL` sólo admite localhost y hay una guarda explícita abajo.
============================================================================= */

const URL_BASE = process.env.E2E_URL || 'http://localhost:5173';

/* GUARDA DE PRODUCCIÓN.
   Se comprueba aquí, al cargar la configuración, y no dentro de una prueba:
   si estuviera en un `beforeAll`, Playwright ya habría arrancado el navegador
   y alguna prueba podría haber tocado la base antes de que salte. */
const PROHIBIDO = /railway\.app|\.up\.railway|acerosarequipa\.com|https:\/\/(?!localhost)/i;
if (PROHIBIDO.test(URL_BASE)) {
  throw new Error(
    `\n\n  Estos recorridos ESCRIBEN en la base (crean incidencias y órdenes).\n`
    + `  No se ejecutan contra ${URL_BASE}.\n\n`
    + `  Levanta el entorno local y vuelve a intentarlo:\n`
    + `    docker compose up -d\n`
    + `    (backend) npm.cmd run start:dev\n`
    + `    (frontend) npm.cmd run dev\n\n`,
  );
}

export default defineConfig({
  testDir: './e2e',

  /* SIN PARALELISMO. Los seis recorridos son UNA historia encadenada: se
     reporta una avería, se convierte en orden y se cierra. En paralelo, el
     que cierra podría correr antes que el que abre. */
  fullyParallel: false,
  workers: 1,

  /* UN reintento, y sólo en CI. Cero reintentos convierte un parpadeo de red
     en una CI roja que nadie se cree; tres reintentos esconden un fallo real
     que ocurre una de cada tres veces — que es el peor tipo. */
  retries: process.env.CI ? 1 : 0,

  /* PROHIBIDO `test.only` en CI. Es la forma más fácil de que la CI salga en
     verde habiendo corrido una sola prueba. */
  forbidOnly: !!process.env.CI,

  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: URL_BASE,
    /* La traza SÓLO al reintentar: guardar una por prueba llena el disco y
       nadie las mira. La del fallo es la única que se abre. */
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    /* La planta va con una wifi que se cae: los tiempos son generosos a
       propósito. Una prueba que falla por lentitud enseña a ignorarla. */
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
  },

  projects: [
    /* SE ENTRA UNA VEZ PARA TODA LA TANDA — bloque 89.
       -----------------------------------------------------------------------
       Antes cada prueba hacía login, y con 23 pruebas más reintentos el freno
       antifuerza bruta cortaba: «Demasiados intentos, espera 10 minutos». El
       freno está BIEN puesto y no se toca; lo que estaba mal era la prueba.
       Una persona tampoco vuelve a escribir su contraseña en cada pantalla. */
    { name: 'setup', testMatch: /sesion\.setup\.ts/ },

    {
      name: 'escritorio',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        /* 1366×768 y no 1920: es la pantalla de los púlpitos. Probar en una
           resolución que nadie usa deja pasar justo los desbordes que se ven
           en planta (bloque 69: la barra se comía 240 px de 1366). */
        viewport: { width: 1366, height: 768 },
        storageState: './e2e/.auth/jefe.json',
      },
      /* El recorrido 1 se excluye: ahí lo que se prueba ES el login, y con la
         sesión ya puesta no probaría nada. Corre en su propio proyecto. */
      testIgnore: /01-entrar\.spec\.ts|sesion\.setup\.ts/,
    },
    {
      /* EL LOGIN, SIN SESIÓN PREVIA. Es el único que entra a mano, y tiene
         que hacerlo: comprueba el login bueno, el malo y la ruta privada sin
         sesión. Van tres intentos, muy por debajo del freno. */
      name: 'login',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } },
      testMatch: /01-entrar\.spec\.ts/,
    },
    {
      name: 'movil',
      dependencies: ['setup'],
      use: { ...devices['iPhone 13'], storageState: './e2e/.auth/jefe.json' },
      /* El técnico usa SU teléfono (BYOD). La mitad de los fallos visuales
         de este proyecto sólo se ven aquí: las fechas que se salían de su
         caja (bloque 70) se veían bien en escritorio. */
      testMatch: /qr-en-campo\.spec\.ts/,
    },
  ],
});
