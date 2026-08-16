import { useEffect, useRef } from 'react';

/**
 * VOLVER A LA PANTALLA — bloque 37.
 *
 * =============================================================================
 *  EL PROBLEMA: TRES PERSONAS, TRES PANTALLAS, CERO AVISOS
 * =============================================================================
 *  Hasta ahora cada pantalla cargaba sus datos UNA VEZ, al entrar. Con una
 *  orden viva a la vez eso daba igual. Con dos o tres y varias personas
 *  trabajando, no:
 *
 *      El Jefe cierra la OM-42 desde el púlpito.
 *      El técnico, que la tiene abierta en el teléfono, la sigue viendo
 *      ABIERTA. Pulsa «Registrar avance» sobre algo que ya no existe.
 *
 *  El backend ahora lo rechaza con un 409 que lo explica (bloque 37), así que
 *  el dato no se corrompe. Pero el técnico se lleva un error por una pantalla
 *  vieja, y eso es culpa nuestra, no suya.
 *
 * =============================================================================
 *  POR QUÉ «AL VOLVER» Y NO CADA X SEGUNDOS
 * =============================================================================
 *  Lo fácil sería `setInterval` cada 30 segundos. Se descartó por tres cosas,
 *  y las tres pesan en planta:
 *
 *   1. EL TELÉFONO ES DEL TÉCNICO Y LOS DATOS LOS PAGA ÉL. Una pantalla
 *      abierta toda la mañana serían cientos de peticiones que nadie miró.
 *
 *   2. LA BATERÍA. Despertar la radio del teléfono cada 30 segundos es de las
 *      cosas que más batería gastan, y un técnico sin batería a las 3 de la
 *      tarde es un técnico que deja de registrar.
 *
 *   3. NO ARREGLA NADA QUE ESTO NO ARREGLE. La secuencia real es: el técnico
 *      mira el teléfono, se lo guarda, camina, saca el teléfono. Ese «saca el
 *      teléfono» es exactamente `visibilitychange`. Refrescar mientras estaba
 *      en el bolsillo no le sirvió a nadie.
 *
 *  Se usa `visibilitychange` y no `focus` porque en móvil `focus` no dispara
 *  al volver desde el conmutador de aplicaciones — que es justo el caso.
 *
 * =============================================================================
 *  LA PAUSA MÍNIMA
 * =============================================================================
 *  Cambiar de pestaña dos veces seguidas no debe lanzar dos cargas. Se ignora
 *  cualquier vuelta que ocurra antes de `minimoMs` desde la última carga; por
 *  defecto 10 segundos, que es más que el tiempo de mirar una notificación y
 *  volver.
 */
export function useVolverALaPantalla(cargar: () => void, minimoMs = 10_000) {
  /* La función se guarda en una referencia y el efecto se monta UNA vez.
     Si `cargar` fuera dependencia del efecto, cada render volvería a
     suscribir y desuscribir el evento — y `cargar` llega casi siempre como
     función en línea, que es un objeto nuevo en cada render. Es el mismo
     fallo que hacía saltar el foco en Modal.tsx el 05/08. */
  const fn = useRef(cargar);
  fn.current = cargar;

  const ultima = useRef(Date.now());

  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState !== 'visible') return;
      /* Sin red no se intenta: la petición fallaría y dejaría la pantalla en
         un estado de error por algo que no hizo el usuario. Cuando vuelva la
         señal, la siguiente vuelta a la pantalla la traerá. */
      if (navigator.onLine === false) return;
      if (Date.now() - ultima.current < minimoMs) return;
      ultima.current = Date.now();
      fn.current();
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [minimoMs]);
}

/**
 * TAPAR LA PANTALLA AL SALIR DE LA APLICACIÓN — bloque 37.
 *
 * =============================================================================
 *  EL RIESGO DEL TELÉFONO PERSONAL
 * =============================================================================
 *  El técnico usa SU teléfono. Cuando cambia de aplicación, Android e iOS
 *  toman una CAPTURA de la última pantalla para enseñarla en el conmutador de
 *  aplicaciones. Esa imagen se queda en el teléfono.
 *
 *  Si en ese momento había una credencial de cámara a la vista, la contraseña
 *  de un NVR de Laminación acaba guardada en el carrete del sistema de un
 *  teléfono particular. No hay forma de borrarla desde aquí, ni de saber que
 *  pasó.
 *
 *  El resto de la defensa ya estaba: las credenciales se ocultan solas a los
 *  60 segundos (`useAutoOcultar`), la sesión caduca a los 30 minutos en campo,
 *  y hay PIN. Lo que faltaba era el instante EXACTO del cambio de aplicación.
 *
 * =============================================================================
 *  CÓMO
 * =============================================================================
 *  Se escucha el momento en que la página deja de ser visible y se limpia lo
 *  sensible ANTES de que el sistema tome la captura. No es perfecto —el
 *  sistema puede capturar muy rápido— pero cierra la ventana en la enorme
 *  mayoría de los casos, y el coste es una línea por pantalla.
 *
 *  Se dispara también con `pagehide`: en iOS, al volver a la pantalla de
 *  inicio, `visibilitychange` no siempre llega a tiempo.
 */
export function useOcultarAlSalir(limpiar: () => void) {
  const fn = useRef(limpiar);
  fn.current = limpiar;

  useEffect(() => {
    const alOcultar = () => {
      if (document.visibilityState === 'hidden') fn.current();
    };
    /* LA MISMA REFERENCIA para añadir y para quitar. Con dos funciones en
       línea distintas, `removeEventListener` no encuentra la que registró y
       el oyente se queda vivo: cada vez que se monta la pantalla se acumula
       otro, y al final una sola salida ejecuta la limpieza veinte veces.
       No rompe nada visible, y por eso se queda ahí para siempre. */
    const alIrse = () => fn.current();

    document.addEventListener('visibilitychange', alOcultar);
    window.addEventListener('pagehide', alIrse);
    return () => {
      document.removeEventListener('visibilitychange', alOcultar);
      window.removeEventListener('pagehide', alIrse);
    };
  }, []);
}
