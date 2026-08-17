import { useEffect, useRef, useState } from 'react';

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

/* =============================================================================
   EL PC DEL PÚLPITO — bloque 42
   -----------------------------------------------------------------------------
   EL AGUJERO QUE DEJÓ EL BLOQUE 37

   Todo lo de arriba se apoya en `visibilitychange`: refrescar cuando alguien
   VUELVE a la pantalla. Para el técnico es exacto — saca el teléfono del
   bolsillo, y ahí salta el evento.

   En el púlpito de Laminación no salta NUNCA.

   Ese PC no se apaga, no cambia de aplicación y nadie toca la pestaña. Se abre
   al empezar el turno y se queda ocho horas mostrando la misma consulta. El
   jefe de tren la mira de pasada, ve «todo en verde», y está leyendo la
   madrugada. Es un fallo mudo: la pantalla no parece rota, parece tranquila.

   Y es peor que no tener refresco, porque el sistema le enseña una hora de
   actualización implícita que no es cierta.

   -----------------------------------------------------------------------------
   POR QUÉ AQUÍ SÍ SE USA UN TEMPORIZADOR SI EN EL BLOQUE 37 SE DESCARTÓ

   Se descartó por el TELÉFONO DEL TÉCNICO: los datos y la batería los paga él,
   y una pantalla abierta toda la mañana serían cientos de peticiones que nadie
   miró. Ese argumento sigue en pie y por eso esto NO se activa en móvil.

   Las tres condiciones, y las tres importan:

     1. Sólo en pantalla ANCHA (>= 1024 px). Un púlpito es un monitor; el
        teléfono del técnico nunca entra por aquí.
     2. Sólo con la pestaña VISIBLE. Si está de fondo no se pide nada: sería
        gastar servidor para un dato que nadie está mirando.
     3. Sólo con red. Sin señal la petición fallaría y dejaría un error en
        pantalla por algo que no hizo nadie.

   Cinco minutos por defecto. En una planta donde una cámara se cae y se abre
   una orden en cuestión de minutos, es la diferencia entre enterarse y no.

   -----------------------------------------------------------------------------
   Y ADEMÁS SE DICE LA EDAD DEL DATO

   El temporizador reduce el problema; no lo elimina. Si el servidor no
   responde, la pantalla se queda vieja igual. Por eso `useEdadDelDato`
   devuelve cuántos minutos hace de la última carga buena, para poder
   escribirlo. Un dato viejo que ADMITE que es viejo ya no engaña a nadie.
============================================================================= */

/** Ancho a partir del cual se asume monitor y no teléfono. */
const ANCHO_DE_PULPITO = 1024;

export function useRefrescoDePulpito(cargar: () => void, cadaMs = 5 * 60_000) {
  const fn = useRef(cargar);
  fn.current = cargar;

  useEffect(() => {
    /* La comprobación del ancho va DENTRO del efecto y no fuera: si se hiciera
       en el cuerpo del componente, un cambio de tamaño no volvería a
       evaluarla y una tableta girada se quedaría con la decisión del primer
       render. */
    const id = window.setInterval(() => {
      if (window.innerWidth < ANCHO_DE_PULPITO) return;
      if (document.visibilityState !== 'visible') return;
      if (navigator.onLine === false) return;
      fn.current();
    }, cadaMs);
    return () => window.clearInterval(id);
  }, [cadaMs]);
}

/**
 * Cuántos minutos hace de la última carga buena.
 *
 * Se le pasa la marca de tiempo que la pantalla guarda al recibir datos. Se
 * recalcula cada 30 segundos para que el número de la pantalla avance solo:
 * un «hace 2 min» congelado en 2 durante media hora es exactamente la mentira
 * que esto viene a evitar.
 */
export function useEdadDelDato(desde: number | null): number | null {
  const [minutos, setMinutos] = useState<number | null>(null);

  useEffect(() => {
    if (!desde) { setMinutos(null); return; }
    const calcular = () => setMinutos(Math.floor((Date.now() - desde) / 60_000));
    calcular();
    const id = window.setInterval(calcular, 30_000);
    return () => window.clearInterval(id);
  }, [desde]);

  return minutos;
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
