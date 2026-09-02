/* =============================================================================
   MENSAJES DE FALLO — bloque 67
   -----------------------------------------------------------------------------
   PETICIÓN DEL USUARIO, literal: «mete alertas de errores cuando no te deje
   hacer algo, indicando QUÉ FALLA O QUÉ FALTA».

   Son dos cosas distintas y hay que separarlas, porque se arreglan en sitios
   distintos:

     · QUÉ FALTA  →  antes de pulsar. Lo resuelve `BotonConMotivo`.
     · QUÉ FALLA  →  después de pulsar. Lo resuelve este archivo.

   -----------------------------------------------------------------------------
   POR QUÉ UNA SOLA FUNCIÓN Y NO UN `e.message` EN CADA PANTALLA

   Repartido por el frontend estaba escrito de tres formas distintas, y la más
   común era la peor:

       catch (e: any) { setError(e.message); }

   Axios pone en `e.message` la frase «Request failed with status code 400».
   Eso no le sirve a nadie, y menos a un técnico subido a un poste con
   guantes. El mensaje ÚTIL —el que escribió el servidor explicando que falta
   la fecha, o que la orden ya está cerrada— viaja en `response.data.message`
   y se estaba tirando a la basura.

   El orden correcto es siempre: lo que dijo el SERVIDOR primero; el texto de
   axios sólo como último recurso.

   -----------------------------------------------------------------------------
   LOS CUATRO CASOS QUE NO TRAEN MENSAJE Y HAY QUE TRADUCIR

   Un 401, un 403, un 404 y una caída de red muchas veces llegan con el cuerpo
   vacío. Sin traducir, el usuario ve una franja en blanco. Con traducir, ve
   qué hacer:

     401 → tu sesión caducó, vuelve a entrar
     403 → no tienes permiso PARA ESTA ACCIÓN (distinto de «no hay datos»)
     404 → esto ya no existe, alguien lo borró; recarga
     sin respuesta → no llegó al servidor, NO se guardó

   Ese último importa más de lo que parece: cuando la red se cae a mitad de un
   guardado, la duda es «¿se guardó o no?». Decir «no llegó, puedes repetirlo»
   evita el peor desenlace, que es guardar dos veces.
============================================================================= */

/** El servidor manda `message` como texto o como lista (ValidationPipe). */
function delServidor(e: any): string {
  const m = e?.response?.data?.message;
  if (Array.isArray(m)) return m.filter(Boolean).join('. ');
  if (typeof m === 'string' && m.trim()) return m.trim();
  const err = e?.response?.data?.error;
  if (typeof err === 'string' && err.trim()) return err.trim();
  return '';
}

/**
 * Convierte cualquier fallo en una frase que se pueda leer en pantalla.
 *
 * @param e        el error capturado
 * @param accion   qué se estaba intentando, en infinitivo y en minúscula:
 *                 «guardar la zona», «cerrar la orden». Se usa para que el
 *                 mensaje diga qué acción falló y no un genérico inútil.
 */
/* «property nombre should not exist» — bloque 90.
   ---------------------------------------------------------------------------
   Ese texto lo escribe el `ValidationPipe` de Nest cuando el formulario manda
   un campo que el DTO no declara, y con `forbidNonWhitelisted` **rechaza la
   petición entera**. Es lo correcto del lado del servidor.

   Pero para quien está delante de la pantalla ese mensaje es ruido: está en
   inglés, habla de «propiedades» y no dice qué hacer. El usuario lo leyó tal
   cual al editar un rol y lo llamó, con razón, «esta huevonada».

   Y lo importante: **NUNCA es culpa suya.** No hay nada que pueda corregir en
   el formulario, porque el campo que sobra ni siquiera se le pide. Es un
   desajuste entre el formulario y el endpoint —un fallo del software—, así
   que se dice así y se le quita de encima la sospecha de haberlo hecho mal.

   Se conserva el nombre del campo: es lo único que sirve para arreglarlo. */
const CAMPO_DE_MAS = /property\s+([A-Za-z0-9_]+)\s+should not exist/i;

function desajusteDeFormulario(texto: string): string {
  const m = texto.match(CAMPO_DE_MAS);
  if (!m) return '';
  return `Fallo del software: el formulario envió un dato que el servidor no espera («${m[1]}»). `
    + 'No es culpa tuya y no lo puedes corregir desde aquí; avisa a quien mantiene el sistema.';
}

export function mensajeDeError(e: any, accion = 'completar la acción'): string {
  const delSrv = delServidor(e);
  /* El desajuste va ANTES del mensaje del servidor: aquí el servidor sí
     respondió, pero lo que dijo no le sirve a nadie. Es la única excepción a
     la regla de «lo que dijo el servidor manda» (bloque 67), y se justifica
     porque este mensaje no lo escribió nadie pensando en el usuario: lo
     genera la librería de validación. */
  const desajuste = desajusteDeFormulario(delSrv);
  if (desajuste) return desajuste;
  if (delSrv) return delSrv;

  if (!e?.response) {
    return `No se pudo ${accion}: la petición no llegó al servidor. `
      + 'No se ha guardado nada, puedes volver a intentarlo.';
  }

  const s = e.response.status;
  if (s === 401) return 'Tu sesión ha caducado. Vuelve a entrar y repite la acción.';
  if (s === 403) {
    return `No tienes permiso para ${accion}. `
      + 'Si crees que deberías, pídelo al Jefe de Mantenimiento.';
  }
  if (s === 404) return 'Esto ya no existe. Puede que lo hayan borrado; recarga la pantalla.';
  if (s === 409) return delSrv || 'Ya existe un registro con esos datos.';
  if (s === 413) return 'El archivo pesa demasiado.';
  if (s === 429) return 'Demasiados intentos seguidos. Espera un momento y repite.';
  if (s >= 500) {
    return `El servidor falló al ${accion}. `
      + 'No es culpa tuya; si se repite, avisa a Sistemas.';
  }

  return `No se pudo ${accion}.`;
}

/* -----------------------------------------------------------------------------
   QUÉ FALTA — se compone con reglas, no con un `if` gigante.

   Se escriben en el ORDEN en que la persona rellena el formulario, y se
   devuelve SÓLO LA PRIMERA que falla. Enseñar cinco faltas a la vez hace que
   no se lea ninguna; enseñar la siguiente convierte el formulario en una
   lista de tareas.
----------------------------------------------------------------------------- */
export type Regla = [condicionQueFalla: boolean, queFalta: string];

export function queFalta(...reglas: Regla[]): string | null {
  for (const [falla, texto] of reglas) if (falla) return texto;
  return null;
}

/** `false` es una respuesta válida; `''`, `null` y `undefined` no lo son. */
export function vacio(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}
