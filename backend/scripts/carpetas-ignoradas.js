/* =============================================================================
   CARPETAS QUE NINGÚN VERIFICADOR DEBE MIRAR
   -----------------------------------------------------------------------------
   POR QUÉ EXISTE ESTE ARCHIVO

   Hasta el bloque 52, los siete verificadores que recorren `src/` lo recorrían
   ENTERO, sin excluir nada. Funcionaba porque todo lo que había dentro lo
   habíamos escrito nosotros.

   Prisma 7 cambia eso. El cliente ya NO se genera dentro de `node_modules`:
   ahora obliga a elegir una carpeta del proyecto y escribe ahí unos doscientos
   archivos TypeScript. Sin esta lista, esos archivos entrarían en cada
   verificación, y el resultado sería ruido puro:

     · `verificar-filtros-prisma` vería miles de `where` y `select` anidados,
       porque el cliente generado ES precisamente la definición de todos ellos.
     · `verificar-campos-prisma` intentaría comprobar contra el esquema los
       bloques `select` de los tipos generados A PARTIR de ese mismo esquema.
     · `verificar-constructores` encontraría `new` sobre espacios de nombres
       por todas partes.

   Y el daño no sería «unos avisos de más». Sería peor: un verificador que
   siempre grita deja de leerse, y el día que grite por algo real nadie va a
   mirar. Un verificador con falsos positivos es un verificador apagado.

   -----------------------------------------------------------------------------
   POR QUÉ AQUÍ Y NO COPIADO EN CADA SCRIPT

   Son SIETE scripts. Siete sitios donde acordarse, y el que se olvide será el
   que falle. Aquí es uno, y cuando mañana aparezca otra carpeta generada se
   añade en una sola línea.
============================================================================= */

/**
 * Nombres de carpeta que se saltan al recorrer el proyecto.
 *
 * `generated` es la del cliente de Prisma 7. Las otras tres son las de
 * siempre, que hasta ahora cada script se saltaba a su manera —o no se las
 * saltaba, porque partía ya desde dentro de `src/`.
 */
const CARPETAS_IGNORADAS = new Set([
  'generated',    // cliente de Prisma 7: código que no escribimos nosotros
  'node_modules',
  'dist',
  '.git',
  'coverage',
]);

/** ¿Hay que saltarse esta carpeta? */
function seIgnora(nombre) {
  return CARPETAS_IGNORADAS.has(nombre);
}

module.exports = { CARPETAS_IGNORADAS, seIgnora };
