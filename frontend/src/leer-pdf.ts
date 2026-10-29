/* =============================================================================
   EL TEXTO DE UN PDF, EN EL NAVEGADOR — bloque 184
   -----------------------------------------------------------------------------
   El asistente de fichas técnicas necesita el texto de la ficha del fabricante
   para proponer los números. Se saca AQUÍ, en el navegador de quien la sube, y
   al servidor sólo viaja el texto: abrir PDFs ajenos en el servidor es una
   puerta a dejarlo colgado, y no aporta nada.

   pdf.js (Mozilla, el visor de Firefox) se carga SÓLO al usarlo: pesa más de un
   megabyte y nadie más de la aplicación lo necesita.
============================================================================= */

/** Páginas que se leen como mucho: una ficha son 2-6; un manual entero no hace falta. */
const MAX_PAGINAS = 12;

export async function textoDelPdf(archivo: File): Promise<string> {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const datos = new Uint8Array(await archivo.arrayBuffer());
  /* Sólo se LEE el texto: no se dibuja nada ni se ejecuta el JavaScript que
     pudiera traer el archivo (pdf.js no lo ejecuta sin un visor que lo pida). */
  const tarea = pdfjs.getDocument({ data: datos });
  const doc = await tarea.promise;
  try {
    const lineas: string[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGINAS); n++) {
      const pagina = await doc.getPage(n);
      const contenido = await pagina.getTextContent();
      /* Se rearman las LÍNEAS por su altura en la página: el asistente busca
         «2.8 mm, D: 67 m…» en una misma línea, y pdf.js entrega trozos sueltos. */
      const porFila = new Map<number, { x: number; t: string }[]>();
      for (const it of contenido.items as any[]) {
        if (typeof it.str !== 'string' || !it.str.trim()) continue;
        const y = Math.round(it.transform?.[5] ?? 0);
        const x = it.transform?.[4] ?? 0;
        const fila = [...porFila.keys()].find((k) => Math.abs(k - y) <= 2) ?? y;
        if (!porFila.has(fila)) porFila.set(fila, []);
        porFila.get(fila)!.push({ x, t: it.str });
      }
      [...porFila.entries()]
        .sort((a, b) => b[0] - a[0])
        .forEach(([, trozos]) => lineas.push(trozos.sort((a, b) => a.x - b.x).map((p) => p.t).join(' ')));
      pagina.cleanup();
    }
    return lineas.join('\n');
  } finally {
    await tarea.destroy();
  }
}
