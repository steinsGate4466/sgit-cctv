import { ReactNode, useRef } from 'react';

/**
 * Modal. Cierra al hacer clic en el fondo SOLO si el clic empezó y terminó en el fondo.
 * Así, seleccionar texto dentro y soltar fuera (arrastrar) ya NO cierra la ventana.
 */
export default function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const downInside = useRef(false);
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => { downInside.current = e.target !== e.currentTarget; }}
      onClick={(e) => { if (e.target === e.currentTarget && !downInside.current) onClose(); }}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="modal-x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
