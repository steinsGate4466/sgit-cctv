/**
 * FECHAS Y PLURALES — bloque 40.
 *
 * =============================================================================
 *  LAS FECHAS SALÍAN DISTINTAS SEGÚN EL PC
 * =============================================================================
 *  Había 17 sitios usando `toLocaleDateString()` SIN indicar el idioma. Sin
 *  idioma, el navegador usa el del sistema operativo:
 *
 *      PC en español   ->  15/8/2026
 *      PC en inglés    ->  8/15/2026
 *
 *  El MISMO dato, con día y mes intercambiados. En una planta donde cada PC lo
 *  configuró una persona distinta, dos técnicos miran la misma orden y leen
 *  fechas distintas — y ninguno de los dos tiene motivo para sospecharlo.
 *
 *  Una fecha de mantenimiento mal leída es un trabajo que se hace el mes que
 *  no toca. Aquí el idioma va FIJO: `es-PE`, que es donde está la planta.
 *
 * =============================================================================
 *  LOS PLURALES ESTABAN FORZADOS
 * =============================================================================
 *  15 sitios escribían `{n} día`, `{n} cámara`, `{n} orden`. Con uno se lee
 *  bien; con tres sale «3 día». Y estaba justo en Cobertura y Topología, que
 *  son las que ve Producción.
 *
 *  No es un detalle de estilo: un sistema que escribe mal el castellano se lee
 *  como un sistema hecho a medias, y eso contagia la confianza en el dato que
 *  hay al lado.
 */

/** Dónde está la planta. Fijo a propósito: no depende del PC de nadie. */
const LOCALE = 'es-PE';

/** 15/08/2026. Con dos dígitos para que las columnas queden alineadas. */
export function fecha(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const f = new Date(d);
  if (Number.isNaN(f.getTime())) return '—';
  return f.toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** 15/08/2026, 14:32 */
export function fechaHora(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const f = new Date(d);
  if (Number.isNaN(f.getTime())) return '—';
  return f.toLocaleString(LOCALE, {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** Sólo la hora: 14:32. Para la línea de tiempo del día. */
export function hora(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const f = new Date(d);
  if (Number.isNaN(f.getTime())) return '—';
  return f.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
}

/**
 * El plural bien escrito.
 *
 *     plural(1, 'día')                -> '1 día'
 *     plural(3, 'día')                -> '3 días'
 *     plural(2, 'cámara')             -> '2 cámaras'
 *     plural(0, 'orden', 'órdenes')   -> '0 órdenes'
 *
 * El segundo parámetro es para lo que no pluraliza añadiendo una «s»: orden →
 * órdenes, mes → meses. En castellano son bastantes, y adivinarlo con reglas
 * acierta menos que escribirlo.
 */
export function plural(n: number, singular: string, plural_?: string): string {
  return `${n} ${n === 1 ? singular : (plural_ ?? `${singular}s`)}`;
}

/**
 * Igual, pero sin repetir el número. Para cuando el número ya está pintado
 * aparte, en grande.
 *
 *     palabra(3, 'día')  ->  'días'
 */
export function palabra(n: number, singular: string, plural_?: string): string {
  return n === 1 ? singular : (plural_ ?? `${singular}s`);
}
