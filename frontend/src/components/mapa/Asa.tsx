import { useRef } from 'react';
import type { APlano } from './LienzoPlano';

/**
 * UN ASA QUE SE JALA — bloque 176.
 *
 * El punto que se arrastra con el dedo o el ratón: la esquina de un área de
 * riesgo, un quiebre del cable, un equipo que se mueve. Mientras se jala, el
 * plano NO se desplaza (el asa se queda el puntero) y el clic de soltar no
 * llega al plano: soltar un asa no es «tocar el plano».
 *
 * `onMover` va en vivo (para que los metros se vean cambiar); `onSoltar`, una
 * vez, al terminar: es ahí donde quien la usa decide si guarda.
 */
export default function Asa({ x, y, escala, aPlano, onMover, onSoltar, onPulsar, clase = '', radio = 7, etiqueta }: {
  x: number; y: number; escala: number; aPlano: APlano;
  onMover?: (x: number, y: number) => void;
  onSoltar?: (x: number, y: number) => void;
  /** Toque sin arrastrar (por ejemplo, para quitar un punto). */
  onPulsar?: () => void;
  clase?: string; radio?: number; etiqueta: string;
}) {
  const estado = useRef<{ movio: boolean; cx: number; cy: number } | null>(null);
  return (
    <g transform={`translate(${x} ${y}) scale(${escala})`} className={'asa ' + clase}
      role="button" aria-label={etiqueta} tabIndex={0}
      onPointerDown={(ev) => {
        ev.stopPropagation();
        estado.current = { movio: false, cx: ev.clientX, cy: ev.clientY };
        try { (ev.currentTarget as Element).setPointerCapture(ev.pointerId); } catch { /* sin captura */ }
      }}
      onPointerMove={(ev) => {
        const e = estado.current;
        if (!e) return;
        if (!e.movio && Math.abs(ev.clientX - e.cx) + Math.abs(ev.clientY - e.cy) < (ev.pointerType === 'mouse' ? 3 : 8)) return;
        e.movio = true;
        const p = aPlano(ev.clientX, ev.clientY);
        onMover?.(p.x, p.y);
      }}
      onPointerUp={(ev) => {
        const e = estado.current;
        estado.current = null;
        try { (ev.currentTarget as Element).releasePointerCapture(ev.pointerId); } catch { /* nada */ }
        if (!e) return;
        if (e.movio) { const p = aPlano(ev.clientX, ev.clientY); onSoltar?.(p.x, p.y); }
        else onPulsar?.();
      }}
      onPointerCancel={() => { estado.current = null; }}
      onClick={(ev) => ev.stopPropagation()}
      onKeyDown={(ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && onPulsar) { ev.preventDefault(); onPulsar(); } }}>
      <circle r={radio + 6} className="asa-toque" />
      <circle r={radio} className="asa-punto" />
    </g>
  );
}
