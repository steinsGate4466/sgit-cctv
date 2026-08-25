import { useEffect, useRef } from 'react';

/* =============================================================================
   BUSCAR MIENTRAS SE ESCRIBE — bloque 67
   -----------------------------------------------------------------------------
   PETICIÓN DEL USUARIO tras una prueba de uso: «haz que la barra de búsqueda
   se vaya cambiando según vayas escribiendo».

   Y tiene razón: un buscador con botón obliga a un gesto extra que hoy nadie
   espera. Se teclea, se mira la pantalla, y si no aparece lo que buscabas se
   sigue tecleando. Pulsar «Buscar» rompe ese ritmo.

   -----------------------------------------------------------------------------
   POR QUÉ CON RETARDO Y NO EN CADA TECLA

   «AA-CAM-T1-001» son trece pulsaciones. Sin retardo son TRECE consultas a la
   base para una sola búsqueda, y en una tabla de cuatrocientos activos eso se
   nota tanto en el servidor como en la pantalla, que parpadea a cada letra.

   Con 350 ms se lanza UNA consulta: la de cuando la persona deja de escribir.
   Es el punto donde ya no se percibe espera y se ahorran doce viajes.

   -----------------------------------------------------------------------------
   TRES DETALLES QUE PARECEN MENORES Y NO LO SON

   1. NO SE BUSCA AL MONTAR LA PANTALLA. La primera carga ya la hace la propia
      pantalla; si este hook disparara también, serían dos consultas iguales
      nada más entrar, y la segunda pisaría a la primera.

   2. UN TÉRMINO DE UNA SOLA LETRA NO SE BUSCA. Devuelve media base de datos y
      no es lo que nadie quiere. Se espera al segundo carácter. Borrar del todo
      SÍ busca: es «quítame el filtro».

   3. EL BOTÓN «BUSCAR» SE QUEDA. Quien viene de teclear un código completo lo
      pulsa por costumbre, y quitarlo obliga a esperar el retardo sin saber si
      el sistema ha entendido. Cuesta nada y tranquiliza.
============================================================================= */

/** Milisegundos que se espera a que la persona deje de escribir. */
export const RETARDO_MS = 350;

/** Mínimo de caracteres para lanzar la búsqueda. Cero siempre busca (limpiar). */
export const MINIMO = 2;

export function useBusquedaEnVivo(termino: string, buscar: () => void) {
  /* `buscar` se guarda en una referencia para que cambiar de función no
     reinicie el temporizador. En estas pantallas `load` se vuelve a crear en
     cada repintado, y sin esto el retardo no llegaría a cumplirse nunca. */
  const fn = useRef(buscar);
  fn.current = buscar;

  const primeraVez = useRef(true);

  useEffect(() => {
    if (primeraVez.current) { primeraVez.current = false; return; }

    const t = termino.trim();
    if (t.length > 0 && t.length < MINIMO) return;

    const reloj = setTimeout(() => fn.current(), RETARDO_MS);
    return () => clearTimeout(reloj);
  }, [termino]);
}
