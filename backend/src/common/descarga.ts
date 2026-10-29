/* =============================================================================
   EL NOMBRE DE UN ARCHIVO QUE SE DESCARGA — bloque 184
   -----------------------------------------------------------------------------
   Había 16 sitios armando `attachment; filename="${nombre}"` a mano, y el
   nombre sale muchas veces de un dato escrito por una persona: el código de un
   activo (formato LIBRE), el rótulo de un gabinete, el título de un documento.

   Lo que pasaba con eso, comprobado:
     · Un carácter fuera de latin1 —una raya «—» pegada desde Word, unas
       comillas tipográficas— hace que Node rechace la cabecera ENTERA
       (ERR_INVALID_CHAR) y la descarga muere con un 500. El QR o el informe de
       ese equipo no se podía bajar nunca, y el error no decía por qué.
     · Unas comillas rectas en el nombre cortaban `filename="…"` a la mitad.
     · Las tildes se cambiaban por «_»: «Ficha técnica» salía «Ficha t_cnica».

   Lo correcto es lo que dice la norma (RFC 6266 + RFC 5987): un nombre ASCII
   de respaldo para los navegadores viejos y el nombre real en UTF-8 en
   `filename*`, que es el que usan todos los actuales.
============================================================================= */

/** Quita lo que no puede ir en un nombre de archivo: control, rutas y comillas. */
function limpiar(nombre: string): string {
  return String(nombre ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ')   // saltos de línea, tabuladores…
    .replace(/[\\/:*?"<>|]+/g, '-')                     // rutas y lo que Windows no admite
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150);
}

/** La versión ASCII: sin tildes («técnica» → «tecnica») y sin nada raro. */
function ascii(nombre: string): string {
  return nombre
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w .()-]+/g, '_')
    .replace(/_+/g, '_');
}

/** RFC 5987: `encodeURIComponent` deja sin codificar `'()*`, que ahí no valen. */
function utf8(nombre: string): string {
  return encodeURIComponent(nombre).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

/**
 * La cabecera `Content-Disposition` de una descarga, siempre válida.
 *
 * @param nombre  el nombre que debe ver la persona, con tildes si las tiene
 * @param modo    `attachment` (descargar) o `inline` (abrir en el navegador)
 */
export function disposicion(nombre: string, modo: 'attachment' | 'inline' = 'attachment'): string {
  const limpio = limpiar(nombre) || 'archivo';
  return `${modo}; filename="${ascii(limpio)}"; filename*=UTF-8''${utf8(limpio)}`;
}
