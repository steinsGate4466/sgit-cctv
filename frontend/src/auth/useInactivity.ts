import { useEffect, useRef, useState } from 'react';

/**
 * Cierre de sesión por inactividad.
 *
 * POR QUÉ EXISTE
 * El sistema muestra IP y contraseñas de equipos de planta. Una sesión abierta
 * en un teléfono o en el púlpito es un acceso abierto a esa información.
 *
 * POR QUÉ NO SON 5 MINUTOS PARA TODOS
 * En escritorio 15 minutos es razonable. En campo el técnico camina varios
 * minutos entre una cámara y otra con el teléfono en el bolsillo: si le cerrara
 * sesión cada 5 minutos, pasaría el día tecleando en vez de mapeando —y el
 * resultado real sería que empiece a compartir contraseñas.
 *
 * Se detecta "campo" por el ancho de pantalla (teléfono).
 */

const MIN = 60 * 1000;

// Escritorio: aviso a los 12, cierre a los 15.
const ESCRITORIO = { aviso: 12 * MIN, cierre: 15 * MIN };
// Campo (teléfono): aviso a los 25, cierre a los 30.
const CAMPO = { aviso: 25 * MIN, cierre: 30 * MIN };

/** Eventos que cuentan como "el usuario sigue ahí". */
const SENALES = ['mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'];

export type Decision = 'ok' | 'avisar' | 'cerrar';

/**
 * Qué hacer según el tiempo inactivo. Función PURA para poder probarla: la
 * lógica de un temporizador dentro de un hook es de las que fallan en el
 * límite exacto y nadie se entera hasta que echa a alguien de campo.
 */
export function decidir(inactivoMs: number, limites: { aviso: number; cierre: number }): Decision {
  if (inactivoMs >= limites.cierre) return 'cerrar';
  if (inactivoMs >= limites.aviso) return 'avisar';
  return 'ok';
}

export function useInactivity(activo: boolean, alCerrar: () => void) {
  // Segundos restantes cuando el aviso está en pantalla; null = sin aviso.
  const [restante, setRestante] = useState<number | null>(null);
  const ultimo = useRef(Date.now());
  const avisando = useRef(false);

  const esCampo = typeof window !== 'undefined' && window.innerWidth < 768;
  const limites = esCampo ? CAMPO : ESCRITORIO;

  useEffect(() => {
    if (!activo) return;

    // EL RELOJ EMPIEZA AQUÍ, AL ACTIVARSE LA SESIÓN. No al cargar la página.
    //
    // BUG QUE ESTO ARREGLA (reportado desde planta)
    // `ultimo` se inicializaba al montar el proveedor, o sea cuando se carga
    // la página. Si el sistema te expulsaba por inactividad, la app iba a
    // /login; si te levantabas y volvías veinte minutos después a iniciar
    // sesión, el reloj YA traía esos veinte minutos acumulados y te expulsaba
    // en el primer tic. Parecía que el sistema estaba roto.
    //
    // Y peor: `avisando` tampoco se reiniciaba, y mientras vale true el
    // registrador IGNORA el ratón y el teclado. Así que ni moviéndote se
    // arreglaba: la sesión nueva nacía condenada.
    //
    // Lo que se mide es la inactividad DENTRO de la sesión, no el tiempo
    // desde que se abrió el navegador.
    ultimo.current = Date.now();
    avisando.current = false;
    setRestante(null);

    const registrar = () => {
      // Mientras el aviso está en pantalla NO se reinicia solo con mover el
      // ratón: el usuario tiene que pulsar el botón. Así el aviso significa
      // algo y no se descarta por accidente al pasar por encima.
      if (avisando.current) return;
      ultimo.current = Date.now();
    };

    SENALES.forEach((e) => window.addEventListener(e, registrar, { passive: true }));

    const reloj = setInterval(() => {
      const inactivo = Date.now() - ultimo.current;

      switch (decidir(inactivo, limites)) {
        case 'cerrar':
          avisando.current = false;
          setRestante(null);
          alCerrar();
          return;
        case 'avisar':
          avisando.current = true;
          setRestante(Math.ceil((limites.cierre - inactivo) / 1000));
          return;
        default:
          if (avisando.current) {
            avisando.current = false;
            setRestante(null);
          }
      }
    }, 1000);

    return () => {
      SENALES.forEach((e) => window.removeEventListener(e, registrar));
      clearInterval(reloj);
    };
  }, [activo, limites.aviso, limites.cierre, alCerrar]);

  /** El usuario confirma que sigue ahí. */
  function seguir() {
    ultimo.current = Date.now();
    avisando.current = false;
    setRestante(null);
  }

  return { restante, seguir, minutosCierre: Math.round(limites.cierre / MIN) };
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
