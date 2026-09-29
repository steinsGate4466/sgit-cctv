import { ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * EL LIENZO DEL PLANO — bloque 151.
 *
 * La imagen del plano (exportada de AutoCAD) de fondo y, encima, lo que se
 * pinte en COORDENADAS DE LA IMAGEN (píxeles). Mover arrastrando, acercar con
 * la rueda, con dos dedos o con los botones.
 *
 * La imagen va como <image> dentro del SVG y no incrustada: un SVG dibujado
 * así no ejecuta nada aunque trajera código.
 *
 * `hijos(escala)` recibe cuánto mide 1 píxel de pantalla en píxeles del plano:
 * con eso los íconos se dibujan siempre del mismo tamaño, cerca o lejos.
 */
export interface Vista { x: number; y: number; w: number; h: number }

export default function LienzoPlano({
  imagenUrl, anchoPx, altoPx, metrosPorPx, hijos, alPulsar, enfocar, alto = 'clamp(420px, 70vh, 780px)',
}: {
  imagenUrl: string | null;
  anchoPx: number;
  altoPx: number;
  metrosPorPx?: number | null;
  hijos: (escala: number) => ReactNode;
  /** Clic en un punto vacío del plano, en píxeles de la imagen. */
  alPulsar?: (x: number, y: number) => void;
  /** Si cambia, se centra ahí (x, y en píxeles de la imagen). Con `w`, encuadra ese ancho (una zona). */
  enfocar?: { x: number; y: number; n: number; w?: number } | null;
  alto?: string;
}) {
  const svg = useRef<SVGSVGElement | null>(null);
  const caja = useRef<HTMLDivElement | null>(null);
  const margen = Math.max(anchoPx, altoPx) * 0.03;
  const ENTERA: Vista = { x: -margen, y: -margen, w: anchoPx + 2 * margen, h: altoPx + 2 * margen };
  const [vb, setVb] = useState<Vista>(ENTERA);
  const [anchoPantalla, setAnchoPantalla] = useState(800);
  const arrastre = useRef<{ cx: number; cy: number; vx: number; vy: number; movio: boolean } | null>(null);
  const dedos = useRef(new Map<number, { x: number; y: number }>());
  const pellizco = useRef<number | null>(null);
  const recienArrastrado = useRef(false);

  // Si cambia el plano, se vuelve a ver entero.
  useEffect(() => { setVb(ENTERA); }, [anchoPx, altoPx]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const el = caja.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAnchoPantalla(el.clientWidth || 800));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const aPlano = useCallback((cx: number, cy: number) => {
    const s = svg.current;
    const m = s?.getScreenCTM();
    if (!s || !m) return { x: 0, y: 0 };
    const p = s.createSVGPoint(); p.x = cx; p.y = cy;
    const r = p.matrixTransform(m.inverse());
    return { x: r.x, y: r.y };
  }, []);

  const zoom = useCallback((f: number, px: number, py: number) => {
    setVb((v) => {
      const maxW = (anchoPx + 2 * margen) * 1.5;
      const minW = Math.max(40, anchoPx / 60);
      const nw = Math.min(maxW, Math.max(minW, v.w * f));
      const k = nw / v.w;
      return { x: px - (px - v.x) * k, y: py - (py - v.y) * k, w: nw, h: v.h * k };
    });
  }, [anchoPx, margen]);

  // Centrar en un punto (la lista «atención ahora» lo usa).
  /* Sólo cuando llega un encuadre NUEVO (`n`). Bloque 165: al cambiar de plano
     el efecto se volvía a disparar con el encuadre del plano anterior y el
     nuevo se abría apuntando a un rincón vacío (pantalla negra). */
  const ultimoEnfoque = useRef<number | null>(null);
  useEffect(() => {
    if (!enfocar || ultimoEnfoque.current === enfocar.n) return;
    ultimoEnfoque.current = enfocar.n;
    setVb((v) => {
      const w = enfocar.w ? Math.max(enfocar.w * 1.35, anchoPx / 12) : Math.min(v.w, anchoPx / 4 + 2 * margen);
      const h = w * (v.h / v.w);
      return { x: enfocar.x - w / 2, y: enfocar.y - h / 2, w, h };
    });
  }, [enfocar, anchoPx, margen]);

  // La rueda: con `passive: false`, si no el navegador hace scroll de la página.
  useEffect(() => {
    const s = svg.current;
    if (!s) return;
    const alGirar = (ev: WheelEvent) => {
      ev.preventDefault();
      const p = aPlano(ev.clientX, ev.clientY);
      zoom(ev.deltaY > 0 ? 1.18 : 1 / 1.18, p.x, p.y);
    };
    s.addEventListener('wheel', alGirar, { passive: false });
    return () => s.removeEventListener('wheel', alGirar);
  }, [aPlano, zoom]);

  function abajo(ev: React.PointerEvent) {
    dedos.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (dedos.current.size === 2) {
      const [a, b] = [...dedos.current.values()];
      pellizco.current = Math.hypot(a.x - b.x, a.y - b.y);
      arrastre.current = null;
      return;
    }
    arrastre.current = { cx: ev.clientX, cy: ev.clientY, vx: vb.x, vy: vb.y, movio: false };
  }
  function mueve(ev: React.PointerEvent) {
    if (dedos.current.has(ev.pointerId)) dedos.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pellizco.current !== null && dedos.current.size === 2) {
      const [a, b] = [...dedos.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const c = aPlano((a.x + b.x) / 2, (a.y + b.y) / 2);
      zoom(pellizco.current / d, c.x, c.y);
      pellizco.current = d;
      recienArrastrado.current = true;
      return;
    }
    const a = arrastre.current;
    if (!a) return;
    const dx = ev.clientX - a.cx, dy = ev.clientY - a.cy;
    if (!a.movio && Math.abs(dx) + Math.abs(dy) > 4) a.movio = true;
    if (a.movio) {
      const k = vb.w / (svg.current?.clientWidth || anchoPantalla);
      setVb((v) => ({ ...v, x: a.vx - dx * k, y: a.vy - dy * k }));
    }
  }
  function arriba(ev: React.PointerEvent) {
    dedos.current.delete(ev.pointerId);
    if (dedos.current.size < 2) pellizco.current = null;
    const a = arrastre.current;
    arrastre.current = null;
    if (a?.movio) { recienArrastrado.current = true; setTimeout(() => { recienArrastrado.current = false; }, 0); }
  }
  function clic(ev: React.MouseEvent) {
    if (recienArrastrado.current || !alPulsar) return;
    const p = aPlano(ev.clientX, ev.clientY);
    if (p.x >= 0 && p.y >= 0 && p.x <= anchoPx && p.y <= altoPx) alPulsar(p.x, p.y);
  }

  // Cuántos píxeles del plano mide un píxel de pantalla.
  const escala = vb.w / Math.max(1, anchoPantalla);

  // Barra de escala en metros, con un largo «redondo».
  let barra: { px: number; texto: string } | null = null;
  if (metrosPorPx) {
    const mPorPantallaPx = metrosPorPx * escala;
    const redondos = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
    const m = redondos.find((r) => r / mPorPantallaPx >= 60) ?? 500;
    barra = { px: m / mPorPantallaPx, texto: `${m} m` };
  }

  return (
    <div className="lienzo-plano" ref={caja} style={{ height: alto }}>
      <svg
        ref={svg}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={abajo} onPointerMove={mueve} onPointerUp={arriba} onPointerCancel={arriba}
        onClick={clic}
        role="img"
        aria-label="Plano de la zona con sus equipos"
      >
        <rect x={0} y={0} width={anchoPx} height={altoPx} className="lienzo-fondo" />
        {imagenUrl && <image className="lienzo-imagen" href={imagenUrl} x={0} y={0} width={anchoPx} height={altoPx} preserveAspectRatio="none" />}
        {hijos(escala)}
      </svg>
      <div className="lienzo-controles">
        <button type="button" aria-label="Acercar" onClick={() => zoom(1 / 1.4, vb.x + vb.w / 2, vb.y + vb.h / 2)}>+</button>
        <button type="button" aria-label="Alejar" onClick={() => zoom(1.4, vb.x + vb.w / 2, vb.y + vb.h / 2)}>−</button>
        <button type="button" aria-label="Ver el plano entero" onClick={() => setVb(ENTERA)}>⤢</button>
      </div>
      {barra && (
        <div className="lienzo-escala">
          <div style={{ width: barra.px }} />
          <span>{barra.texto}</span>
        </div>
      )}
    </div>
  );
}
