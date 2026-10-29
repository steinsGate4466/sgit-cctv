import { useEffect, useRef, useState } from 'react';
import { escriturasEnCurso } from '../api/client';

/* =============================================================================
   CIERRE DE SESIÓN POR INACTIVIDAD — rehecho en el bloque 183
   -----------------------------------------------------------------------------
   POR QUÉ EXISTE
   El sistema enseña IP y contraseñas de equipos de planta. Un PC del púlpito
   o un teléfono con la sesión abierta y nadie delante es un acceso abierto.
   El bloque 182 lo quitó porque «generaba bugs»; Cristhian lo pidió de vuelta
   el mismo día como barrera de seguridad, «pero bien hecho». Esto es eso.

   LA PANTALLA FIJA DEL PÚLPITO NO PASA POR AQUÍ
   Un monitor con el mapa abierto todo el turno no tiene a nadie tocándolo, y
   eso NO es abandono. Para eso existe el permiso `sesion.pantalla_fija`
   (bloque 183): sólo se puede dar a un rol de SÓLO LECTURA y sin credenciales
   — el servidor lo impide —, así que una sesión que no caduca no abre nada
   que se pueda tocar. AuthContext no monta este reloj para esa cuenta.

   -----------------------------------------------------------------------------
   LOS FALLOS DE ANTES, Y QUÉ CIERRA CADA UNO

   1. Las señales se escuchaban en `window` en fase de BURBUJA: cualquier
      componente que llame a `stopPropagation()` (menús, el mapa, diálogos)
      escondía sus clics y teclas.
      AHORA: se escucha en `document` en fase de CAPTURA. La captura llega
      antes que nadie, así que nada de la aplicación puede ocultar la señal.

   1-bis. SÓLO CUENTA LO QUE HACE UNA PERSONA (`isTrusted`, y ni `scroll` ni
      `focus`). Lo encontró el recorrido del bloque 183: el botón «Sigo aquí»
      se enfoca solo al salir el aviso, ese foco contaba como actividad y el
      aviso se borraba a sí mismo en el acto. Con `scroll` pasa lo mismo: la
      aplicación desplaza cosas sola (la pestaña activa se centra, las listas
      se recargan). Una barrera que la propia pantalla mantiene abierta no es
      una barrera. Desplazar a mano SIEMPRE trae rueda, dedo o tecla, y ésos
      sí cuentan.

   2. Sólo eventos de ratón. En las pantallas táctiles y con lápiz, los
      eventos de ratón de compatibilidad se suprimen si un componente hace
      `preventDefault` (lo hace el plano para poder arrastrar).
      AHORA: eventos de PUNTERO (`pointerdown`, `pointermove`), que cubren
      ratón, dedo y lápiz, más teclado, rueda, escritura y foco.

   3. Te podía echar a mitad de un guardado (subiendo fotos con mala wifi).
      AHORA: con una escritura sin contestar, el reloj espera.

   4. Una pestaña cerraba sesión y las otras seguían «dentro» con un token
      borrado; al rato fallaban sin explicación.
      AHORA: lo resuelve AuthContext escuchando el almacenamiento.

   Y lo que ya estaba bien se queda: la actividad se comparte entre pestañas
   (bloque 170), el reloj arranca al iniciar sesión (no al cargar la página) y
   cualquier actividad retira el aviso.

   OJO: lo que te sacaba «mientras trabajabas» casi nunca fue este reloj, sino
   el servidor rechazando la renovación. Eso se arregla en auth.service
   (respuesta de renovación perdida) y ahora la pantalla de acceso DICE cuál
   de los dos fue (auth/salida.ts).
============================================================================= */

const MIN = 60 * 1000;

// PC: aviso a los 13, cierre a los 15. Teléfono: aviso a los 28, cierre a los 30.
// El teléfono va más largo porque el técnico camina entre cámaras con él en el
// bolsillo: cerrarle cada 15 minutos le haría compartir contraseñas.
export const LIMITES_PC = { aviso: 13 * MIN, cierre: 15 * MIN };
export const LIMITES_CELULAR = { aviso: 28 * MIN, cierre: 30 * MIN };

/** Lo que cuenta como «la persona sigue ahí». Se escucha en CAPTURA. */
export const SENALES = [
  'pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'touchmove', 'input',
] as const;

const CLAVE_ACTIVIDAD = 'sgit.actividad';
const CADA_MS = 5000;

function leerCompartida(): number {
  try { return Number(localStorage.getItem(CLAVE_ACTIVIDAD)) || 0; } catch { return 0; }
}
function escribirCompartida(t: number) {
  try { localStorage.setItem(CLAVE_ACTIVIDAD, String(t)); } catch { /* cuenta sólo esta pestaña */ }
}

/** La última actividad que cuenta: la de esta pestaña o la de otra, la más reciente. */
export function ultimaActividad(propia: number, compartida: number): number {
  return Math.max(propia, compartida);
}

export type Decision = 'ok' | 'avisar' | 'cerrar';

/**
 * Qué hacer según el tiempo inactivo. Función PURA para poder probarla.
 * Con una escritura en curso nunca se cierra ni se avisa.
 */
export function decidir(
  inactivoMs: number,
  limites: { aviso: number; cierre: number },
  escribiendo = 0,
): Decision {
  if (escribiendo > 0) return 'ok';
  if (inactivoMs >= limites.cierre) return 'cerrar';
  if (inactivoMs >= limites.aviso) return 'avisar';
  return 'ok';
}

export function useInactivity(activo: boolean, alCerrar: (minutos: number) => void) {
  // Segundos restantes cuando el aviso está en pantalla; null = sin aviso.
  const [restante, setRestante] = useState<number | null>(null);
  const ultimo = useRef(Date.now());
  const avisando = useRef(false);
  // alCerrar en una ref: si cambiara de identidad no debe reiniciar el reloj.
  const cerrarRef = useRef(alCerrar);
  cerrarRef.current = alCerrar;

  const esCelular = typeof window !== 'undefined' && window.innerWidth < 768;
  const limites = esCelular ? LIMITES_CELULAR : LIMITES_PC;
  const { aviso, cierre } = limites;

  useEffect(() => {
    if (!activo) { setRestante(null); return; }

    // El reloj empieza al activarse la sesión, no al cargar la página.
    ultimo.current = Date.now();
    avisando.current = false;
    setRestante(null);
    escribirCompartida(ultimo.current);
    let escrito = ultimo.current;

    const registrar = (e: Event) => {
      if (!e.isTrusted) return;            // lo dispara el código, no una persona
      const ahora = Date.now();
      ultimo.current = ahora;
      if (ahora - escrito >= CADA_MS) { escribirCompartida(ahora); escrito = ahora; }
      if (avisando.current) { avisando.current = false; setRestante(null); }
    };

    const opciones = { capture: true, passive: true } as const;
    SENALES.forEach((e) => document.addEventListener(e, registrar, opciones));

    const reloj = setInterval(() => {
      const inactivo = Date.now() - ultimaActividad(ultimo.current, leerCompartida());
      switch (decidir(inactivo, { aviso, cierre }, escriturasEnCurso())) {
        case 'cerrar':
          avisando.current = false;
          setRestante(null);
          cerrarRef.current(Math.round(cierre / MIN));
          return;
        case 'avisar':
          avisando.current = true;
          setRestante(Math.max(1, Math.ceil((cierre - inactivo) / 1000)));
          return;
        default:
          if (avisando.current) { avisando.current = false; setRestante(null); }
      }
    }, 1000);

    return () => {
      SENALES.forEach((e) => document.removeEventListener(e, registrar, opciones));
      clearInterval(reloj);
    };
  }, [activo, aviso, cierre]);

  /** El usuario confirma que sigue ahí. */
  function seguir() {
    ultimo.current = Date.now();
    escribirCompartida(ultimo.current);
    avisando.current = false;
    setRestante(null);
  }

  return { restante, seguir, minutosCierre: Math.round(cierre / MIN) };
}

/**
 * Oculta un dato sensible pasado un tiempo.
 *
 * Se usa con las contraseñas de equipos: aunque el usuario siga activo, una
 * clave no debe quedarse escrita en pantalla indefinidamente —basta que alguien
 * pase por detrás del púlpito—.
 */
export function useAutoOcultar<T extends Record<string, any>>(
  valor: T,
  limpiar: () => void,
  segundos = 60,
) {
  const hayAlgo = Object.keys(valor || {}).length > 0;
  useEffect(() => {
    if (!hayAlgo) return;
    const t = setTimeout(limpiar, segundos * 1000);
    return () => clearTimeout(t);
  }, [hayAlgo, valor, limpiar, segundos]);
}
