import { api } from './api/client';
import { guardarPendiente } from './cola-offline';

/**
 * ENVIAR SIN PERDER LO ESCRITO
 * =============================================================================
 *
 *  LO QUE ENCONTRÉ AL REVISARLO, Y NO ME GUSTÓ
 *  --------------------------------------------------------------------------
 *  La cola de borradores sin señal existía desde el bloque 12.6... y la usaban
 *  **2 pantallas de 15**. El formulario de alta de activo —el del mapeo, el
 *  que se va a usar 300 veces dentro de una nave sin cobertura— **no la
 *  usaba**. Tampoco incidencias, ni órdenes, ni instalaciones.
 *
 *  Es el fallo clásico: se construyó la parte difícil y se enchufó en dos
 *  sitios de ejemplo. Sobre el papel la función existe; en la práctica el
 *  técnico pierde el informe igual.
 *
 *  LA SOLUCIÓN: UN SOLO SITIO, NO QUINCE
 *  --------------------------------------------------------------------------
 *  En vez de copiar el mismo `try/catch` en cada pantalla —quince sitios donde
 *  puede faltar, y el que falte será el que alguien use en la nave— se envía
 *  todo por aquí.
 *
 *  CUÁNDO SE GUARDA Y CUÁNDO NO. Esta distinción es todo:
 *
 *    · SIN RESPUESTA del servidor (no hay red)  -> se guarda. Volverá a subir.
 *    · 5xx (el servidor falló)                  -> se guarda. No es culpa del dato.
 *    · 4xx (el servidor RECHAZÓ el contenido)   -> **NO se guarda**, se lanza.
 *
 *  Guardar un 4xx sería prometer que se subirá algo que nunca va a subir: el
 *  servidor ya dijo que ese dato está mal. La pantalla tiene que enseñar el
 *  motivo y dejar corregir, no esconderlo en una cola que crece.
 *
 *  Y NUNCA se dice "guardado" cuando sólo está en el teléfono. Por eso el
 *  resultado trae `pendiente: true` y cada pantalla lo dice con sus palabras.
 */

export interface Resultado<T = any> {
  /** true = quedó en el teléfono esperando señal. NO está en el sistema. */
  pendiente: boolean;
  /** La respuesta del servidor, si llegó a subir. */
  datos?: T;
}

export async function enviarConRespaldo<T = any>(
  metodo: 'post' | 'patch',
  url: string,
  cuerpo: any,
  /** Cómo llamar a esto en la lista de pendientes. Que se entienda a los 3 días. */
  titulo: string,
): Promise<Resultado<T>> {
  try {
    const r = metodo === 'post' ? await api.post(url, cuerpo) : await api.patch(url, cuerpo);
    return { pendiente: false, datos: r.data };
  } catch (e: any) {
    const estado = e?.response?.status;

    // El servidor rechazó el CONTENIDO. Esto no se arregla reintentando.
    if (estado && estado >= 400 && estado < 500) throw e;

    // Sin respuesta o 5xx: se guarda y se sube cuando vuelva la señal.
    await guardarPendiente({ url, metodo, cuerpo, titulo });
    return { pendiente: true };
  }
}

/**
 * El texto que ve el técnico cuando algo queda pendiente. Está aquí para que
 * sea el MISMO en las quince pantallas: si cada una lo dice a su manera, una
 * de ellas va a dar a entender que se guardó en el sistema.
 */
export const TEXTO_PENDIENTE =
  'Sin conexión. Lo escrito quedó guardado EN ESTE TELÉFONO y se subirá solo ' +
  'cuando vuelva la señal. Todavía NO está en el sistema.';
