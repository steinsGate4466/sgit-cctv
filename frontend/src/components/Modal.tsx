import { ReactNode, useEffect, useRef } from 'react';

/**
 * Ventana de formulario.
 *
 * CIERRA AL PULSAR EL FONDO sólo si el clic empezó Y terminó ahí: seleccionar
 * texto dentro y soltar fuera ya no cierra la ventana perdiendo lo escrito.
 *
 * ---------------------------------------------------------------------------
 *  LO QUE SE ARREGLA AQUÍ (4W): EL BOTÓN DE GUARDAR EN EL CELULAR
 * ---------------------------------------------------------------------------
 *  El formulario de activo tiene más de cuarenta campos. En un teléfono eso
 *  son varias pantallas de scroll, y el botón de Guardar estaba AL FINAL DE
 *  TODO: para guardar un cambio de una línea había que recorrer el formulario
 *  entero hasta abajo.
 *
 *  Ahora las acciones van en una barra FIJA al pie de la ventana. Siempre
 *  visible, siempre alcanzable con el pulgar. Es el cambio que más se nota
 *  de todo el pase de formularios, y no se ve en una captura: se nota al
 *  usarlo con una mano.
 *
 *  También:
 *   · Escape cierra. Con teclado se espera; sin ello hay que buscar la X.
 *   · El foco entra en el primer campo al abrir, así se puede escribir sin
 *     tocar la pantalla.
 *   · El fondo NO hace scroll detrás de la ventana. En el celular, deslizar
 *     dentro de un formulario largo movía la página de detrás y al cerrar
 *     aparecías en otro sitio.
 */
export default function Modal({
  title, onClose, children, acciones, ancho,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Botones del pie. Van en barra fija: en el celular, siempre a mano. */
  acciones?: ReactNode;
  /** 'ancho' para formularios de muchos campos: dos columnas en escritorio. */
  ancho?: boolean;
}) {
  const downInside = useRef(false);
  const caja = useRef<HTMLDivElement>(null);

  /* EL BUG DEL FOCO QUE SALTABA — corregido el 05/08/2026.
     ================================================================
     Este efecto declaraba `[onClose]` como dependencia. Y `onClose` llega
     SIEMPRE como función en línea desde quien abre la ventana:

         <Modal onClose={() => setAbierto(null)} ... />

     Una función en línea es un objeto NUEVO en cada render. Así que:
       escribes una letra -> cambia el estado -> re-render -> `onClose` es
       "distinto" -> el efecto se limpia y se vuelve a ejecutar -> hace
       `primero?.focus()` -> EL CURSOR SALTA AL PRIMER CAMPO.

     Es decir: no se podía escribir más de una letra seguida en ningún campo
     que no fuera el primero, en NINGÚN formulario del sistema.

     La solución no es memorizar `onClose` en cada una de las pantallas que
     abren ventanas —son decenas y la número treinta se olvidaría—, sino
     guardarlo en una ref aquí dentro. El efecto deja de depender de él y se
     ejecuta UNA sola vez, que es lo que siempre debió hacer. */
  const cerrar = useRef(onClose);
  cerrar.current = onClose;

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar.current(); };
    document.addEventListener('keydown', esc);

    // Se bloquea el scroll del fondo mientras la ventana está abierta, y se
    // devuelve exactamente como estaba al cerrar (no se pone 'auto' a lo
    // bruto: si la página tenía otro valor, se lo cargaría).
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Foco en el primer campo. Se salta los de sólo lectura y los ocultos.
    const primero = caja.current?.querySelector<HTMLElement>(
      'input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])',
    );
    primero?.focus();

    return () => {
      document.removeEventListener('keydown', esc);
      document.body.style.overflow = antes;
    };
    // Sin dependencias A PROPÓSITO: montar y desmontar, nada más. Ver el
    // comentario de arriba: cualquier dependencia que cambie por render
    // vuelve a robar el foco.
     
  }, []);

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => { downInside.current = e.target !== e.currentTarget; }}
      onClick={(e) => { if (e.target === e.currentTarget && !downInside.current) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className={'modal' + (ancho ? ' modal-ancho' : '')} ref={caja} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="modal-x" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        <div className="modal-body">{children}</div>
        {acciones && <div className="modal-pie">{acciones}</div>}
      </div>
    </div>
  );
}
