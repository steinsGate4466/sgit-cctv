/* =============================================================================
   BLOQUE 101 · EL TECHO QUE SE DICE
   -----------------------------------------------------------------------------
   DE DÓNDE SALE. Se midieron las consultas de lista del backend:

       231 llamadas a `findMany`
       183 SIN `take`

   Y mi primer informe dijo «hay que ponerle tope a las 183». **Estaba mal
   enfocado, y conviene dejarlo escrito porque el error es interesante:**

   -----------------------------------------------------------------------------
   NO TODAS LAS CONSULTAS SIN TOPE SON IGUALES. HAY TRES FAMILIAS.

   1 · TABLAS QUE NO CRECEN CON EL USO
       Roles (11), permisos (~60), etapas, catálogos, ubicaciones, gabinetes,
       subredes, hojas de ruta (una por tipo de equipo), colores de cable.
       Crecen con el tamaño de la PLANTA, no con los años de uso. Ponerles
       tope no arregla nada y sí puede esconder una fila.

   2 · CÁLCULOS
       El estado derivado de un activo, el MTTR, el cumplimiento del
       preventivo, el backlog, el reparto correctivo/preventivo, la cobertura
       por zona.

       **Un `take` aquí NO hace la pantalla más rápida: hace que el número
       MIENTA.** Un cumplimiento calculado sobre «las primeras mil órdenes»
       no es un cumplimiento: es una cifra inventada con pinta de medida, y
       va a un comité. Es exactamente lo que este proyecto lleva cien bloques
       persiguiendo.

       Estas consultas se acotan por FECHA —que es lo que hacen ya— nunca por
       cantidad. Y quedan DECLARADAS como exentas, con su motivo escrito.

   3 · LISTAS Y ARCHIVOS QUE LEE UNA PERSONA
       Aquí sí hay techo. Y aquí está el caso que de verdad dolía:

           exportacion.service.ts · hojaOrdenes      SIN where, SIN take
           exportacion.service.ts · hojaIncidencias  SIN where, SIN take

       **Se traen TODAS las filas que existen** para armar un Excel en
       memoria. Con la planta recién arrancada son cuatrocientas y no se nota.
       Con tres años de operación son decenas de miles, y el proceso se cae
       —o se queda sin memoria— en UNA sola petición, que es la que el
       `RitmoGuard` no puede frenar porque es una y no cien.

   -----------------------------------------------------------------------------
   LA REGLA, Y ES LO ÚNICO QUE HAY QUE RECORDAR DE ESTE ARCHIVO

   > **Un recorte que no se dice es una mentira.** Un Excel con las últimas
   > veinte mil órdenes ENTREGADO COMO «todas las órdenes» es peor que un
   > Excel lento: el que lo abre cuenta filas, saca un total y lo lleva a una
   > reunión. Nadie va a sospechar de un archivo que no se queja.

   Así que el tope nunca va solo. Va con tres cosas:

     · el número de filas que SÍ están,
     · el número de filas que HAY en total,
     · y una frase, dentro del propio archivo, diciendo qué falta y cómo
       pedirlo.

   Es la misma decisión que el paginador de Activos del bloque 81 («filtrando
   por letra, el paginador cuenta lo de esta página, y se dice en pantalla») y
   la del NVR que no declara canales del bloque 5 («si no se sabe, no se
   inventa»).
============================================================================= */

/**
 * Cuántas filas como máximo se meten en una hoja de Excel.
 *
 * **Por qué 20.000 y no «todas»:** el libro se arma ENTERO en memoria antes de
 * enviarse (por eso estas rutas ya llevan `RITMO_PESADO` desde el bloque 12.2).
 * Veinte mil filas por doce columnas son unos pocos megabytes; doscientas mil
 * son un proceso caído.
 *
 * **Por qué 20.000 y no 1.000:** tiene que caber la operación de varios años,
 * porque el caso de uso real es llevarse el histórico a una reunión. Un tope
 * tan bajo que se alcance el primer año convierte el aviso de recorte en ruido
 * permanente, y un aviso permanente se deja de leer (regla del bloque 9).
 *
 * No es un dato de planta y por eso no se edita desde la interfaz: es un límite
 * técnico de memoria del servidor. Si algún día hace falta el histórico
 * completo, la respuesta correcta NO es subir este número — es exportar por
 * periodos.
 */
export const TOPE_FILAS_EXCEL = 20_000;

/** Qué se sabe de un posible recorte. */
export interface Recorte {
  /** Cuántas filas van en la hoja. */
  incluidas: number;
  /** Cuántas hay en la tabla. */
  total: number;
  /** `true` sólo si se dejó algo fuera. */
  recortado: boolean;
}

/**
 * Compara lo que se trajo con lo que hay.
 *
 * **Se cuenta con `count`, no midiendo el array que se trajo**, y ésa es la
 * pieza que hace posible decir la verdad: si sólo se mirara el array, veinte
 * mil filas traídas de veinte mil que hay y veinte mil de doscientas mil se
 * verían EXACTAMENTE igual. Un `count` es una consulta barata —la base no
 * mueve las filas, sólo las cuenta— y es lo que distingue «esto es todo» de
 * «esto es una parte».
 */
export function medirRecorte(incluidas: number, total: number): Recorte {
  return { incluidas, total, recortado: incluidas < total };
}

/**
 * La frase que va DENTRO del archivo cuando se recortó, o `null`.
 *
 * Tres decisiones en cómo está escrita:
 *
 *  · **Dice los DOS números.** «Recortado» a secas no permite saber si falta
 *    una fila o el 90 % del histórico.
 *  · **Dice QUÉ se conservó**, no sólo qué falta. Lo que hay son las más
 *    RECIENTES, y eso cambia por completo cómo se lee la hoja: quien busca lo
 *    de este mes lo tiene todo.
 *  · **Dice qué hacer.** Sin eso es un reproche, no un aviso — misma regla que
 *    el cumplimiento normativo del bloque 78, donde cada hallazgo dice dónde
 *    se arregla.
 */
export function avisoDeRecorte(r: Recorte, queSon: string): string | null {
  if (!r.recortado) return null;
  const fuera = r.total - r.incluidas;
  return `ATENCIÓN · Esta hoja está RECORTADA: contiene ${r.incluidas.toLocaleString('es-PE')} `
    + `${queSon} de ${r.total.toLocaleString('es-PE')} que hay en el sistema `
    + `(faltan ${fuera.toLocaleString('es-PE')}). Se conservaron LAS MÁS RECIENTES. `
    + 'Para el histórico completo, pídelo por periodos a quien mantiene el sistema.';
}

/**
 * La línea corta para la portada del libro completo.
 *
 * La portada ya avisa de que el Excel no reconstruye el sistema. Si además una
 * hoja va recortada, tiene que salir AHÍ TAMBIÉN: quien abre el libro por la
 * portada y no baja a la hoja de Órdenes no vería el aviso nunca.
 *
 * **Una sola advertencia en un sitio al que hay que llegar no es una
 * advertencia.** Es la decisión del aviso del QR del bloque 62: va arriba del
 * todo, porque si se lee una sola línea tiene que ser ésta.
 */
export function lineaDePortada(hoja: string, r: Recorte): string | null {
  if (!r.recortado) return null;
  return `· La hoja «${hoja}» está recortada a las ${r.incluidas.toLocaleString('es-PE')} `
    + `más recientes de ${r.total.toLocaleString('es-PE')}.`;
}
