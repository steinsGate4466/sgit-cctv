import { api } from './api/client';

/* =============================================================================
   BAJAR UN ARCHIVO DEL SERVIDOR — bloque 184
   -----------------------------------------------------------------------------
   Estaba copiado en cinco pantallas, cada una con su variante, y las cinco
   leían sólo `filename="…"`: el nombre ASCII de respaldo. Desde el bloque 184
   el servidor manda además el nombre real en UTF-8 (`filename*`), con sus
   tildes. Aquí se lee ése primero, y el ASCII sólo si no viene.

   Y un detalle que fallaba en silencio: liberar la dirección del archivo en
   la misma línea del clic. En Firefox y Safari la descarga aún no ha empezado
   en ese instante, y se cancela sin decir nada. Se libera un rato después.
============================================================================= */

/** El nombre que manda el servidor en `Content-Disposition`, o el de respaldo. */
export function nombreDeDescarga(cabecera: string | null | undefined, porDefecto: string): string {
  const c = cabecera || '';
  const utf8 = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(c)?.[1];
  if (utf8) {
    try { return decodeURIComponent(utf8.trim()); } catch { /* mal codificado: se usa el otro */ }
  }
  return /filename\s*=\s*"?([^";]+)"?/i.exec(c)?.[1]?.trim() || porDefecto;
}

/** Entrega un blob como archivo descargado. */
export function guardarArchivo(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * Pide un archivo a la API (con la sesión) y lo descarga. Si falla, LANZA:
 * quien llama decide cómo avisar (`mensajeDeError`), porque una descarga que
 * no llega y no dice nada parece un botón roto.
 */
export async function descargarDeApi(ruta: string, porDefecto: string, params?: Record<string, unknown>): Promise<void> {
  const r = await api.get(ruta, { responseType: 'blob', params });
  guardarArchivo(r.data, nombreDeDescarga(r.headers?.['content-disposition'], porDefecto));
}
