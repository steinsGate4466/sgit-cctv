import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * EL SERVIDOR DE DESARROLLO NO SE ASOMA A LA RED — bloque 51-S.
 *
 * =============================================================================
 *  QUÉ PASABA
 * =============================================================================
 *  Aquí decía `host: true`, que significa «escucha en TODAS las interfaces de
 *  red». Cualquiera conectado a la misma red —el wifi de casa, la red de
 *  planta el día que se trabaje desde allí— podía abrir http://<esta-ip>:5173.
 *
 *  Y eso no es sólo ver la pantalla. El servidor de desarrollo de Vite sirve
 *  el CÓDIGO FUENTE sin compilar y las variables de entorno del build. Con el
 *  fallo conocido de esbuild (GHSA-67mh-4wv8-2f99) además basta con visitar
 *  una web cualquiera para que ésta le pida cosas al servidor de desarrollo y
 *  se lleve la respuesta.
 *
 *  En PRODUCCIÓN esto nunca aplicó: el contenedor sirve archivos ya compilados
 *  con `serve`, y Vite ni siquiera está dentro de la imagen. Era un agujero de
 *  la máquina de quien programa, no del sistema desplegado. Pero es la máquina
 *  donde vive el código entero.
 *
 * =============================================================================
 *  POR QUÉ `false` Y NO UNA LISTA DE PERMITIDOS
 * =============================================================================
 *  `host: false` deja el servidor escuchando sólo en 127.0.0.1 — esta misma
 *  máquina y nadie más. Es la opción por defecto de Vite, y la que corresponde
 *  cuando se programa en un solo equipo.
 *
 *  SI ALGÚN DÍA HACE FALTA PROBAR DESDE EL CELULAR EN PLANTA —que es un caso
 *  real, porque media aplicación se usa desde el móvil— se vuelve a poner
 *  `host: true` A PROPÓSITO y sólo mientras dure esa prueba. Lo que no puede
 *  ser es que esté abierto por descuido, todos los días, sin que nadie lo haya
 *  decidido.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Sólo esta máquina. Ver la explicación de arriba antes de cambiarlo.
    host: false,
  },
});
