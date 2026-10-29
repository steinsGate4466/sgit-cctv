import { test, expect } from '@playwright/test';
import { entrar, vigilarConsola } from './apoyo';

/* =============================================================================
   RECORRIDO 9 · FICHAS TÉCNICAS — bloque 184
   -----------------------------------------------------------------------------
   Lo único de este bloque que NO se puede probar sin abrir el navegador: leer
   el PDF del fabricante EN EL NAVEGADOR (pdf.js y su «worker», que el build
   tiene que servir bien) y que el asistente proponga los números.

   La historia entera, como la haría el técnico:
     1. añade el modelo al catálogo,
     2. sube el PDF de la ficha y elige la lente de sus cámaras,
     3. el formulario se rellena SOLO con lo que dice el PDF y avisa si algo
        no cuadra; él marca que lo comprobó y guarda,
     4. y NO la puede verificar él mismo: lo hace otra persona.

   El PDF se fabrica aquí, con el texto de una ficha Hikvision real (la misma
   de las pruebas del backend). No hay ningún archivo de un fabricante en el
   repositorio.
============================================================================= */

const FICHA = [
  'HIKVISION DS-2CD2143G2-IS 4 MP AcuSense Fixed Dome Network Camera',
  'Image Sensor 1/3" Progressive Scan CMOS',
  'Max. Resolution 2688 × 1520',
  'Lens Type & FOV',
  '2.8 mm: horizontal FOV 103°, vertical FOV 55°, diagonal FOV 122°',
  '4 mm: horizontal FOV 84°, vertical FOV 45°, diagonal FOV 100°',
  'DORI (2.8 mm) Detect: 67 m, Observe: 26 m, Recognize: 13 m, Identify: 6 m',
  'DORI (4 mm) Detect: 80 m, Observe: 31 m, Recognize: 16 m, Identify: 8 m',
  'IR Range Up to 30 m',
  'Digital Zoom 16x',
];

/* UN MODELO NUEVO EN CADA INTENTO. Con el nombre fijo, el reintento de la CI
   chocaba con el modelo que había creado el primer intento («ya está en el
   catálogo») y el informe decía eso en vez del fallo de verdad. */
const MODELO = `DS-2CD2143G2-IS-${Date.now().toString(36)}`;

/** Un PDF de una página con esas líneas (Helvetica, WinAnsi: «°» y «×» incluidos). */
function pdfConTexto(lineas: string[]): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => '\\' + c);
  const contenido = 'BT /F1 10 Tf 14 TL 40 780 Td\n'
    + lineas.map((l) => `(${esc(l)}) Tj T*`).join('\n') + '\nET';
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(contenido, 'latin1')} >>\nstream\n${contenido}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  let pdf = '%PDF-1.4\n';
  const desplazamientos: number[] = [];
  objetos.forEach((o, i) => {
    desplazamientos.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`
    + desplazamientos.map((d) => `${String(d).padStart(10, '0')} 00000 n \n`).join('')
    + `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

test.describe('9 · Fichas técnicas', () => {
  test('del PDF del fabricante a la ficha, sin escribir un número a mano', async ({ page }) => {
    const errores = vigilarConsola(page);
    await entrar(page);
    await page.goto('/fichas');
    await expect(page.locator('.titular')).toBeVisible({ timeout: 20_000 });

    // 1 · El modelo, al catálogo.
    await page.getByRole('button', { name: '+ Añadir modelo' }).click();
    const alta = page.locator('.modal');
    await expect(alta).toBeVisible();
    /* Marca y modelo se ELIGEN de lo que hay en planta (bloque 169); el
       desplegable aparece cuando llega esa lista. Se espera a que haya UNA de
       las dos cosas —desplegable o casillas— antes de decidir: mirar antes
       de que llegue la lista era una carrera (y falló así la primera vez). */
    const elegir = alta.locator('select').nth(1);
    const marca = alta.getByLabel('Marca', { exact: true });
    await expect(elegir.or(marca)).toBeVisible({ timeout: 15_000 });
    if (await elegir.isVisible()) await elegir.selectOption('__otro__');
    await marca.fill('Hikvision');
    await alta.getByLabel('Modelo', { exact: true }).fill(MODELO);
    await alta.getByRole('button', { name: 'Añadir', exact: true }).click();

    // 2 · El PDF. El formulario de la ficha se abre solo, con el modelo puesto.
    const ficha = page.locator('.modal');
    await expect(ficha.getByText(`Nueva ficha · Hikvision ${MODELO}`)).toBeVisible({ timeout: 15_000 });
    await ficha.locator('input[type="file"]').setInputFiles({
      name: 'DS-2CD2143G2-IS.pdf', mimeType: 'application/pdf', buffer: pdfConTexto(FICHA),
    });

    /* La ficha trae DOS lentes: no se elige por el técnico (va en la etiqueta
       de su cámara). Hasta que la elija, no hay distancias. */
    await expect(ficha.getByText('Esta ficha trae varias lentes', { exact: false })).toBeVisible({ timeout: 30_000 });
    await ficha.getByRole('group', { name: 'Lente de tus cámaras' }).getByRole('button', { name: '2.8 mm' }).click();

    // 3 · Lo propuso el PDF, no una persona.
    await expect(ficha.getByRole('textbox', { name: /^Lente/ })).toHaveValue('2.8 mm');
    await expect(ficha.getByRole('textbox', { name: /^Resolución: ancho/ })).toHaveValue('2688');
    await expect(ficha.getByRole('textbox', { name: /^Ángulo horizontal \(°\)/ })).toHaveValue('103');
    await expect(ficha.getByRole('textbox', { name: /^Detectar/ })).toHaveValue('67');
    await expect(ficha.getByRole('textbox', { name: /^Identificar/ })).toHaveValue('6');
    await expect(ficha.getByRole('textbox', { name: /^Alcance infrarrojo/ })).toHaveValue('30');
    // Y avisa, mientras se escribe, de lo que NO puede ser.
    await ficha.getByRole('textbox', { name: /^Detectar/ }).fill('670');
    await expect(ficha.getByText('Esto no cuadra', { exact: false })).toBeVisible({ timeout: 10_000 });
    await ficha.getByRole('textbox', { name: /^Detectar/ }).fill('67');
    await expect(ficha.getByText(/Lo que verá/)).toBeVisible({ timeout: 10_000 });

    await ficha.getByRole('checkbox', { name: /Copié estos números del PDF/ }).check();
    await ficha.getByRole('button', { name: 'Guardar ficha' }).click();
    /* Si el servidor dice que no, la prueba lo REPITE con sus palabras: un
       «no apareció el mensaje» mandaría a buscar donde no es. */
    const guardada = page.getByText('Ficha 2.8 mm cargada', { exact: false });
    const fallo = ficha.locator('[role="alert"]');
    await expect(guardada.or(fallo)).toBeVisible({ timeout: 15_000 });
    if (await fallo.isVisible()) throw new Error(`Guardar la ficha falló: ${await fallo.innerText()}`);

    // 4 · En el catálogo, sin verificar; y quien la cargó NO la puede verificar.
    const lente = page.getByRole('row', { name: new RegExp(MODELO) }).getByRole('button', { name: /2\.8 mm · 67 m/ });
    await expect(lente).toBeVisible();
    await lente.click();
    const detalle = page.locator('.modal');
    await expect(detalle.getByText(/Sin verificar/)).toBeVisible();

    // El PDF guardado se descarga con su nombre, tildes incluidas.
    const [descarga] = await Promise.all([
      page.waitForEvent('download'),
      detalle.getByRole('button', { name: 'Descargar el PDF' }).click(),
    ]);
    expect(descarga.suggestedFilename()).toBe(`Ficha técnica ${MODELO} 2.8 mm.pdf`);
    const { readFileSync } = await import('node:fs');
    expect(readFileSync((await descarga.path())!).subarray(0, 5).toString('latin1'), 'No es el PDF que se subió').toBe('%PDF-');

    /* El botón NO se apaga del todo (bloque 67): se puede pulsar y dice por
       qué no. Para el navegador va `aria-disabled`, así que Playwright no lo
       pulsaría solo: se fuerza el clic, que es lo que hace un dedo. */
    await detalle.getByRole('button', { name: 'Verificar' }).click({ force: true });
    await expect(detalle.getByText('La cargaste tú', { exact: false })).toBeVisible();

    expect(errores, `Errores en consola: ${errores.join(' | ')}`).toHaveLength(0);
  });
});
