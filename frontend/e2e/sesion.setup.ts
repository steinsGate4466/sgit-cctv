import { test as setup, expect } from '@playwright/test';
import { entrarConCredenciales } from './apoyo';

/* =============================================================================
   SE ENTRA UNA VEZ, NO VEINTITRÉS — bloque 89
   =============================================================================

   EL PROBLEMA QUE RESUELVE, y lo dijo la propia CI:

       El login devolvió 429.
       {"message":"Demasiados intentos. Espera 10 minuto(s) y vuelve a probar."}

   Mi primera versión hacía login en CADA prueba. Con 23 pruebas más los
   reintentos, eso son más de treinta intentos desde la misma IP en dos
   minutos, y el `FrenoGuard` los corta — **con toda la razón**.

   > **El freno NO se toca.** Es la defensa contra fuerza bruta del bloque 67
   > y protege el login de la planta. Bajarlo o excluir la IP de la CI sería
   > apagar un control real para que pase una prueba, que es exactamente lo
   > que este proyecto no hace.

   Lo que estaba mal era la prueba: **una persona no vuelve a escribir su
   contraseña en cada pantalla.** Se entra una vez y la sesión se reutiliza,
   que además es lo que de verdad hace un usuario.

   -----------------------------------------------------------------------------
   EL RECORRIDO 1 SIGUE ENTRANDO A MANO, y es deliberado: ahí lo que se prueba
   ES el login —el bueno, el malo y la ruta privada sin sesión—. Ese archivo
   arranca con el estado vacío (ver `playwright.config.ts`).
============================================================================= */

/* RUTA RELATIVA A LA RAÍZ DEL PROYECTO, no `__dirname`.
   ---------------------------------------------------------------------------
   `__dirname` no existe en un módulo ES, y Playwright carga estos archivos
   como ESM: `ReferenceError: __dirname is not defined`. Y como revienta al
   CARGAR el archivo, no falla una prueba — **no se lista ninguna**, que es un
   error mucho más confuso que el que lo causa.

   La misma cadena va en `playwright.config.ts`, en `storageState`. */
export const ESTADO_JEFE = './e2e/.auth/jefe.json';

setup('entrar una vez y guardar la sesión', async ({ page }) => {
  await entrarConCredenciales(page, 'JEFE');

  /* Se guarda DESPUÉS de comprobar que hay menú. Guardar un estado a medias
     —con el token pero sin el perfil cargado— haría que las pruebas
     siguientes arrancaran en una pantalla montándose a medias, y eso da
     fallos intermitentes: el peor tipo, el que no se reproduce. */
  await expect(page.locator('nav, .sidebar').first()).toBeVisible({ timeout: 20_000 });
  await page.context().storageState({ path: ESTADO_JEFE });
});
