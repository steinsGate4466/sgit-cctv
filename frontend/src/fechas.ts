/* =============================================================================
   UNA SOLA FORMA DE PINTAR UNA FECHA EN TODO EL SISTEMA
   -----------------------------------------------------------------------------
   POR QUÉ EXISTE ESTE ARCHIVO

   Había 15 sitios repartidos por el frontend escribiendo esto a mano:

       {new Date(m.fecha).toLocaleDateString('es-PE')}

   Y tiene dos fallos, los dos vistos en pantalla:

   1. SI EL CAMPO LLEGA VACÍO, `new Date(null)` NO revienta: devuelve una
      fecha inválida, y `.toLocaleDateString()` sobre ella imprime
      literalmente «Invalid Date» en medio de una tabla de planta. El usuario
      no ve un error: ve una tabla rota.

   2. NO HAY UNA VERDAD ÚNICA. Cada sitio decidía por su cuenta si mostrar la
      hora, si abreviar el mes, si poner segundos. La misma fecha se veía de
      cuatro maneras distintas en cuatro pantallas.

   REGLA DE LA CASA, y la misma que ya rige en el resto del proyecto:

       «Sin datos, nunca cero.»

   Si no hay fecha, se dice «sin fecha» — nunca se inventa una, nunca se pinta
   basura y nunca se deja el hueco en blanco, porque un hueco en blanco y un
   dato que falta son indistinguibles para quien mira.

   Todas las funciones aceptan `null`, `undefined`, cadena vacía y fechas
   inválidas, y devuelven SIEMPRE algo legible.
============================================================================= */

/** Lo que se pinta cuando no hay dato. Uno solo, para todo el sistema. */
export const SIN_FECHA = 'sin fecha';

const LOCAL = 'es-PE';

/** Convierte cualquier cosa en Date, o null si no se puede. NUNCA lanza. */
function aFecha(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null;
  const d = v instanceof Date ? v : new Date(v as string | number);
  // `Invalid Date` da NaN al pedirle el tiempo. Es la única comprobación fiable.
  return Number.isNaN(d.getTime()) ? null : d;
}

/** ¿Es una fecha usable? Útil para decidir si pintar un bloque entero. */
export function hayFecha(v: unknown): boolean {
  return aFecha(v) !== null;
}

/** 24/08/2026 — el formato por defecto de las tablas. */
export function fecha(v: unknown, vacio = SIN_FECHA): string {
  const d = aFecha(v);
  return d ? d.toLocaleDateString(LOCAL) : vacio;
}

/** 24/08/2026, 10:20 — cuando la hora importa (avisos, auditoría, turnos). */
export function fechaHora(v: unknown, vacio = SIN_FECHA): string {
  const d = aFecha(v);
  if (!d) return vacio;
  return d.toLocaleString(LOCAL, {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** 10:20 — sólo la hora. Para listas de un mismo día. */
export function hora(v: unknown, vacio = SIN_FECHA): string {
  const d = aFecha(v);
  if (!d) return vacio;
  return d.toLocaleTimeString(LOCAL, { hour: '2-digit', minute: '2-digit' });
}

/** 24/08 10:20 — compacto, para móvil y celdas estrechas. */
export function fechaCorta(v: unknown, vacio = SIN_FECHA): string {
  const d = aFecha(v);
  if (!d) return vacio;
  return d.toLocaleString(LOCAL, {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * FECHA PARA UNA TABLA: «26 ago · 00:16».
 *
 * -----------------------------------------------------------------------------
 * POR QUÉ NO VALÍA `fechaCorta`, que daba «26/8, 12:16 a. m.»
 *
 * 1. **`12:16 a. m.` es ambiguo de leer rápido.** Medianoche y mediodía se
 *    escriben casi igual y hay que pararse a pensar cuál es. En una planta con
 *    tres turnos, esa duda es cara: la mitad de las incidencias entran de
 *    madrugada. En 24 horas, `00:16` no admite discusión.
 *
 * 2. **El separador `a. m.` lleva espacios finos** que el navegador puede
 *    partir a mitad, y entonces la celda se rompe en dos líneas feas.
 *
 * 3. **`26/8` obliga a traducir el número a mes.** `26 ago` se lee sin pensar,
 *    y ocupa lo mismo.
 *
 * El punto medio `·` separa día y hora sin parecer parte del número, que es lo
 * que pasaba con la coma.
 */
export function fechaTabla(v: unknown, vacio = SIN_FECHA): string {
  const d = aFecha(v);
  if (!d) return vacio;
  const dia = d.toLocaleDateString(LOCAL, { day: 'numeric', month: 'short' })
    .replace('.', '');                       // «26 ago.» -> «26 ago»
  const hora = d.toLocaleTimeString(LOCAL, {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  return `${dia} · ${hora}`;
}

/**
 * «hace 3 días», «hace 2 h», «ahora mismo».
 *
 * Sirve para lo que se lee de un vistazo —«último visto», «se cayó hace…»—
 * donde el dato útil es la ANTIGÜEDAD, no el día exacto. Nunca sustituye a la
 * fecha en un documento: ahí siempre va la fecha completa.
 */
export function haceCuanto(v: unknown, vacio = SIN_FECHA): string {
  const d = aFecha(v);
  if (!d) return vacio;
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 0) return fechaHora(v);          // en el futuro: se dice la fecha
  if (s < 60) return 'ahora mismo';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  const dias = Math.floor(s / 86400);
  if (dias < 31) return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
  return fecha(v);
}

/**
 * Valor para un `<input type="date">`: aaaa-mm-dd.
 *
 * OJO con el huso horario: `toISOString()` pasa a UTC y en Perú (UTC-5) eso
 * puede restar un día a las fechas de la mañana. Por eso se construye a mano
 * con los componentes LOCALES, que es lo que el usuario ve en el calendario.
 */
export function paraInput(v: unknown): string {
  const d = aFecha(v);
  if (!d) return '';
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Hoy en formato de `<input type="date">`. Para valores por defecto. */
export function hoyParaInput(): string {
  return paraInput(new Date());
}

/** ¿Esa fecha ya pasó? `false` si no hay fecha — no se inventa un vencimiento. */
export function yaPaso(v: unknown): boolean {
  const d = aFecha(v);
  return d ? d.getTime() < Date.now() : false;
}
