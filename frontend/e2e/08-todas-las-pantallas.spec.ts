import { test, expect, Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { entrar, vigilarConsola, explicarConsola } from './apoyo';

/* =============================================================================
   RECORRIDO 8 · TODAS LAS PANTALLAS, UNA POR UNA — bloque 171
   -----------------------------------------------------------------------------
   El recorrido 5 abre lo que hay EN EL MENÚ. Éste abre TODAS las rutas de
   App.tsx —también las que se llegan por enlace o por QR— y mira cuatro cosas
   que no rompen el build pero sí la pantalla:

     1. que no salte «Esta pantalla no se pudo mostrar» (ErrorBoundary);
     2. que ninguna llamada devuelva 5xx;
     3. que no haya error de JavaScript;
     4. EN EL CELULAR, que nada empuje la pantalla de lado.

   Salió de un barrido a mano con seis perfiles, que encontró: tablas que
   empujaban ocho pantallas 180-260 px en el teléfono, el 429 del limitador sin
   cabeceras CORS («el servidor no responde»), el Dashboard pidiendo datos de
   red a quien no los puede ver, y la ficha del gabinete desbordando.

   Las rutas se LEEN de App.tsx: una pantalla nueva entra sola en el recorrido.
============================================================================= */

function rutasDeLaApp(): string[] {
  const app = readFileSync('src/App.tsx', 'utf8');
  return [...new Set([...app.matchAll(/path="([^"]+)"/g)].map((m) => m[1]))]
    // Con parámetro (QR) necesitan un id real; las cubre el recorrido 2.
    .filter((r) => r !== '*' && r !== '/login' && !r.includes(':'));
}

async function revisar(page: Page, ruta: string, problemas: string[]) {
  const malas: string[] = [];
  const oir = (r: any) => { if (r.url().includes('/api/') && r.status() >= 500) malas.push(`${r.status()} ${r.url()}`); };
  page.on('response', oir);
  await page.goto(ruta);
  await page.waitForLoadState('networkidle').catch(() => undefined);
  page.off('response', oir);
  if (await page.getByText('Esta pantalla no se pudo mostrar').count()) problemas.push(`${ruta}: la pantalla reventó al dibujarse`);
  for (const m of malas) problemas.push(`${ruta}: ${m}`);
}

test('todas las pantallas abren sin reventar ni dar 5xx (escritorio)', async ({ page }) => {
  test.setTimeout(10 * 60_000);
  await entrar(page);
  const consola = vigilarConsola(page);
  const problemas: string[] = [];
  for (const ruta of rutasDeLaApp()) await revisar(page, ruta, problemas);
  expect(problemas, problemas.join('\n')).toEqual([]);
  expect(consola, explicarConsola(consola)).toEqual([]);
});

test('en el celular ninguna pantalla se sale de lado', async ({ page }) => {
  test.setTimeout(10 * 60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await entrar(page);
  const problemas: string[] = [];
  for (const ruta of rutasDeLaApp()) {
    await revisar(page, ruta, problemas);
    const sobra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (sobra > 1) problemas.push(`${ruta}: la pantalla se sale ${sobra}px de lado`);
  }
  expect(problemas, problemas.join('\n')).toEqual([]);
});
