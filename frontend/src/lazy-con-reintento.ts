/**
 * POR QUÉ EXISTE ESTE ARCHIVO
 *
 * Cada pantalla se descarga por separado (así la primera carga es rápida en
 * el teléfono). Los archivos llevan el nombre con un código: `Assets-a3f9.js`.
 * En CADA despliegue ese código CAMBIA.
 *
 * Entonces pasa esto, y es exactamente lo que se veía:
 *   1. Tienes la aplicación abierta en el móvil.
 *   2. Se despliega una versión nueva. Los archivos viejos desaparecen.
 *   3. Tocas otra pantalla → el navegador pide `Assets-a3f9.js` → 404.
 *   4. React no tiene qué pintar → PÁGINA EN BLANCO.
 *
 * Ni siquiera es un fallo del código: es tener abierta la versión anterior.
 * Por eso era intermitente y por eso no había forma de reproducirlo a
 * voluntad — solo pasaba después de un despliegue.
 *
 * La solución: si falla la descarga, RECARGAR UNA VEZ. Al recargar se pide el
 * index nuevo, con los nombres nuevos, y funciona. Una sola vez, marcado en
 * sessionStorage: si tras recargar vuelve a fallar, el problema es otro
 * (sin internet, servidor caído) y entonces sí hay que enseñar el error en
 * vez de recargar en bucle eternamente.
 */
import { lazy, ComponentType } from 'react';

const MARCA = 'sgit:recarga-por-chunk';

export function lazyConReintento<T extends ComponentType<any>>(
  cargar: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      const modulo = await cargar();
      // Cargó bien: se limpia la marca para que el próximo despliegue vuelva
      // a tener su reintento disponible.
      sessionStorage.removeItem(MARCA);
      return modulo;
    } catch (error) {
      if (!sessionStorage.getItem(MARCA)) {
        sessionStorage.setItem(MARCA, String(Date.now()));
        // Recarga limpia. `location.reload()` puede servir el mismo index
        // cacheado; volviendo a la URL con un parámetro se fuerza a pedirlo.
        location.replace(location.pathname + location.search);
        // Se queda colgado a propósito: la página se está yendo.
        await new Promise(() => {});
      }
      // Segundo intento fallido: que lo pinte la red de seguridad con su
      // mensaje, en vez de recargar para siempre.
      throw error;
    }
  });
}
