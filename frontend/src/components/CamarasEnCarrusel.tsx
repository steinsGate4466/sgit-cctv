import { useEffect, useState } from 'react';
import CamaraCaida from './CamaraCaida';

/**
 * UNA CÁMARA A LA VEZ — bloque 124.
 *
 * =============================================================================
 *  DE DÓNDE SALE
 * =============================================================================
 *  Paseo del usuario por «Mis cámaras», 20/09/2026:
 *
 *  > «Si soporta varias cámaras —dos, cuatro, seis, diez— todas esas cámaras
 *  >  van a salir así. Debe haber un botón de traslado, un botón de
 *  >  deslizamiento: cámara dos, cámara tres… hay cuatro cámaras sin imagen y
 *  >  deslizando, con toda la información.»
 *  > «Apelo a tu criterio de cómo manejas el entorno visual para el usuario.»
 *
 *  La tarjeta de una cámara caída es alta a propósito —foto, cronología,
 *  avance, materiales, hasta dónde se puede llegar—. Con una se lee entera;
 *  con diez, la pantalla es una columna de dos metros y nadie llega al final.
 *
 * =============================================================================
 *  EL CRITERIO, QUE ÉL ME PIDIÓ QUE PUSIERA
 * =============================================================================
 *  En una pantalla de planta **manda un objeto a la vez**. Lo que se amontona
 *  no se lee: se ojea, y lo que se ojea se equivoca. Por eso se enseña una
 *  cámara ocupando el ancho, con su información completa, y se pasa a la
 *  siguiente.
 *
 *  PERO LA PILA NO DESAPARECE. Con dos o tres cámaras, obligar a pasar de una
 *  en una es peor que enseñarlas: se pierde la comparación de un vistazo. Por
 *  eso hay un botón para verlas todas, y por eso el carrusel **sólo aparece a
 *  partir de cuatro** — el número que él mismo usó.
 *
 *  Y NO SE OCULTA NADA SIN DECIRLO: arriba va «3 de 10», que es la diferencia
 *  entre una pantalla que resume y una que esconde.
 *
 * =============================================================================
 *  DECISIONES DE DETALLE
 * =============================================================================
 *  · NO gira solo. Un carrusel que avanza con temporizador cambia la tarjeta
 *    mientras alguien la está leyendo, y en planta eso significa apuntar mal un
 *    código en la libreta.
 *  · Flechas del teclado, y `aria-live` para quien usa lector: el cambio
 *    ocurre lejos del botón que lo provoca y hay que anunciarlo.
 *  · Si la lista se encoge —una cámara vuelve a dar imagen mientras se mira—,
 *    el índice se recorta en vez de quedarse apuntando a una tarjeta que ya no
 *    existe.
 */
const DESDE_CUANTAS = 4;

export default function CamarasEnCarrusel({ camaras }: { camaras: any[] }) {
  const [i, setI] = useState(0);
  const [todas, setTodas] = useState(false);

  /* La lista se recarga cada poco: si mientras tanto se arregla una cámara, el
     índice puede quedar fuera de rango. */
  useEffect(() => {
    if (i > camaras.length - 1) setI(Math.max(0, camaras.length - 1));
  }, [camaras.length, i]);

  if (camaras.length < DESDE_CUANTAS || todas) {
    return (
      <>
        {camaras.length >= DESDE_CUANTAS && (
          <button className="btn-mini" style={{ marginBottom: 10 }} onClick={() => setTodas(false)}>
            Ver de una en una
          </button>
        )}
        {camaras.map((c: any) => <CamaraCaida key={c.id} c={c} />)}
      </>
    );
  }

  const actual = camaras[Math.min(i, camaras.length - 1)];
  const ir = (n: number) => setI((n + camaras.length) % camaras.length);

  return (
    <div className="carrusel"
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') ir(i + 1);
        if (e.key === 'ArrowLeft') ir(i - 1);
      }}
    >
      <div className="carrusel-barra">
        {/* Flechas de texto, no iconos: el juego de iconos del proyecto no
            tiene «izquierda» ni «derecha», y añadir dos sólo para esto sería
            meter dibujos nuevos en una hoja que está cerrada y verificada. El
            nombre va en `aria-label` para el lector de pantalla. */}
        <button className="btn-mini" onClick={() => ir(i - 1)} aria-label="Cámara anterior">‹</button>

        <span className="carrusel-cuenta" aria-live="polite">
          <b>{actual?.codigo}</b>
          <span className="muted"> · {i + 1} de {camaras.length}</span>
        </span>

        <button className="btn-mini" onClick={() => ir(i + 1)} aria-label="Cámara siguiente">›</button>

        <button className="btn-mini carrusel-todas" onClick={() => setTodas(true)}>
          Ver todas
        </button>
      </div>

      {/* Los puntos: de un vistazo se sabe cuántas hay y en cuál se está. Con
          muchas cámaras dejan de dibujarse, porque veinte puntos no informan. */}
      {camaras.length <= 12 && (
        <div className="carrusel-puntos">
          {camaras.map((c: any, n: number) => (
            <button
              key={c.id}
              className={'carrusel-punto' + (n === i ? ' act' : '')}
              onClick={() => setI(n)}
              aria-label={`Ir a ${c.codigo}`}
              aria-current={n === i}
            />
          ))}
        </div>
      )}

      {actual && <CamaraCaida key={actual.id} c={actual} />}
    </div>
  );
}
