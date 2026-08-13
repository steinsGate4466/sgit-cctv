import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * AL CAMBIAR DE PANTALLA, ARRIBA.
 *
 * ===========================================================================
 *  EL PROBLEMA QUE ARREGLA
 * ===========================================================================
 *  React Router no toca el scroll al navegar: cambia lo que se pinta y deja
 *  la página donde estaba. Como el menú es largo, la página siempre es alta;
 *  si estabas abajo del todo y pulsabas «Cámaras de grúa», aterrizabas a
 *  1.400 px de altura sobre una pantalla que sólo mide 600.
 *
 *  Resultado: una zona en blanco y la impresión de que el módulo está vacío
 *  o roto. No lo estaba. Estaba arriba, fuera de la vista.
 *
 *  En el celular es peor: la barra del navegador se esconde al bajar, así que
 *  ni siquiera se ve la cabecera para darse cuenta de que hay que subir.
 *
 * ===========================================================================
 *  POR QUÉ NO ES UN `scrollTo(0,0)` Y YA
 * ===========================================================================
 *  Porque el botón ATRÁS es distinto. Si el técnico estaba en la fila 80 de
 *  Activos, entra a un equipo y vuelve atrás, tiene que caer en la fila 80.
 *  Mandarlo arriba lo obliga a recorrer la lista otra vez, y con guantes en
 *  un celular eso son veinte segundos cada vez.
 *
 *      Navegación nueva (PUSH/REPLACE) -> arriba.
 *      Atrás o adelante (POP)          -> donde estaba.
 *
 *  Se guarda por `key` de la ubicación, no por ruta: dos visitas distintas a
 *  la misma pantalla son dos sitios distintos en el historial.
 *
 *  El salto va en `useLayoutEffect`, antes de que el navegador pinte. Con un
 *  `useEffect` normal se vería el fogonazo de la pantalla nueva a media
 *  altura y luego el salto.
 */
export default function RestaurarScroll() {
  const { key } = useLocation();
  const tipo = useNavigationType();          // 'PUSH' | 'REPLACE' | 'POP'
  const posiciones = useRef<Map<string, number>>(new Map());
  const claveActual = useRef(key);

  /* Se anota la posición mientras se navega, no al salir: cuando el
     componente se entera de que cambió la ruta, el scroll de la anterior ya
     se perdió. */
  useEffect(() => {
    const anotar = () => posiciones.current.set(claveActual.current, window.scrollY);
    window.addEventListener('scroll', anotar, { passive: true });
    return () => window.removeEventListener('scroll', anotar);
  }, []);

  useLayoutEffect(() => {
    claveActual.current = key;
    const destino = tipo === 'POP' ? (posiciones.current.get(key) ?? 0) : 0;
    // 'auto' y no 'smooth': un desplazamiento animado de 1.400 px marea y
    // retrasa medio segundo cada navegación.
    window.scrollTo({ top: destino, left: 0, behavior: 'auto' });

    /* EN EL CELULAR el menú es una tira horizontal. Si la opción que acabas
       de tocar queda medio fuera, no se ve cuál está activa. Se centra.
       `block: 'nearest'` es lo que impide que esto mueva la página entera. */
    if (window.matchMedia('(max-width: 780px)').matches) {
      const activa = document.querySelector('.nav a.active');
      activa?.scrollIntoView({ inline: 'center', block: 'nearest' });
    }
  }, [key, tipo]);

  return null;
}
