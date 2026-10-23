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
/** Bloque 176 · pasa de pantalla a píxeles del plano (para las asas que se jalan). */
export type APlano = (clientX: number, clientY: number) => { x: number; y: number };
/** Bloque 176 · arrastrar para DIBUJAR en vez de mover el plano (área de riesgo). */
export interface AlArrastrar {
  inicio: (x: number, y: number) => void;
  mover: (x: number, y: number) => void;
  fin: (x: number, y: number) => void;
}

export default function LienzoPlano({
  imagenUrl, anchoPx, altoPx, metrosPorPx, hijos, alPulsar, enfocar, alto = 'clamp(420px, 70vh, 780px)', alArrastrar, llenar = false, pantalla,
}: {
  imagenUrl: string | null;
  anchoPx: number;
  altoPx: number;
  metrosPorPx?: number | null;
  hijos: (escala: number, aPlano: APlano) => ReactNode;
  /** Con esto, arrastrar con UN dedo o el ratón DIBUJA; la rueda, los botones y dos dedos siguen acercando. */
  alArrastrar?: AlArrastrar | null;
  /** Bloque 177 · ocupar todo `alto` (pantalla completa), no sólo lo que pide la forma del plano. */
  llenar?: boolean;
  /** Bloque 181 · el botón de pantalla completa en la esquina del plano, donde se busca. */
  pantalla?: { activa: boolean; alternar: () => void };
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
  const dibujando = useRef(false);

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
      dibujando.current = false; // dos dedos = acercar, aunque se estuviera dibujando
      return;
    }
    if (alArrastrar && ev.button === 0) {
      const p = aPlano(ev.clientX, ev.clientY);
      dibujando.current = true;
      try { svg.current?.setPointerCapture(ev.pointerId); } catch { /* sin captura */ }
      alArrastrar.inicio(p.x, p.y);
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
    if (dibujando.current && alArrastrar) {
      const p = aPlano(ev.clientX, ev.clientY);
      alArrastrar.mover(p.x, p.y);
      return;
    }
    const a = arrastre.current;
    if (!a) return;
    /* Bloque 173 · si el botón ya no está pulsado (se soltó FUERA del plano y
       el navegador no avisó), el arrastre se termina aquí: antes el plano se
       quedaba «pegado» al ratón y se movía solo. */
    if (ev.pointerType === 'mouse' && ev.buttons === 0) { arrastre.current = null; return; }
    const dx = ev.clientX - a.cx, dy = ev.clientY - a.cy;
    /* Con el dedo, un toque siempre se mueve unos píxeles: con el umbral de
       4 px un toque sobre un punto se leía como arrastre. */
    const umbral = ev.pointerType === 'mouse' ? 4 : 10;
    if (!a.movio && Math.abs(dx) + Math.abs(dy) > umbral) {
      a.movio = true;
      /* Capturar el puntero SÓLO al empezar a arrastrar: así el «soltar» llega
         aunque sea fuera del plano, y un clic sin arrastre sigue llegando al
         punto que se tocó (con la captura puesta desde el principio, el clic
         se lo quedaría el lienzo). */
      try { svg.current?.setPointerCapture(ev.pointerId); } catch { /* sin captura: el `buttons` de arriba lo cubre */ }
    }
    if (a.movio) {
      const k = vb.w / (svg.current?.clientWidth || anchoPantalla);
      setVb((v) => ({ ...v, x: a.vx - dx * k, y: a.vy - dy * k }));
    }
  }
  function arriba(ev: React.PointerEvent) {
    try { if (svg.current?.hasPointerCapture(ev.pointerId)) svg.current.releasePointerCapture(ev.pointerId); } catch { /* nada */ }
    dedos.current.delete(ev.pointerId);
    if (dedos.current.size < 2) pellizco.current = null;
    if (dibujando.current) {
      dibujando.current = false;
      recienArrastrado.current = true; setTimeout(() => { recienArrastrado.current = false; }, 0);
      if (alArrastrar) { const p = aPlano(ev.clientX, ev.clientY); alArrastrar.fin(p.x, p.y); }
      return;
    }
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
    /* Bloque 173 · el alto sigue la FORMA del plano: un tren es largo y bajo
       (360 × 160 m) y con 70 % de la pantalla quedaban dos franjas negras
       enormes arriba y abajo, y el plano se veía pequeño. Nunca más alto que
       `alto`, nunca menos de 320 px (230 en el celular). */
    <div className="lienzo-plano" ref={caja}
      style={{ height: llenar ? alto : `min(${alto}, ${Math.max(anchoPantalla < 600 ? 230 : 320, Math.round(anchoPantalla * (ENTERA.h / ENTERA.w)) + 8)}px)` }}>
      <svg
        ref={svg}
        className={alArrastrar ? 'lienzo-dibujar' : undefined}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={abajo} onPointerMove={mueve} onPointerUp={arriba} onPointerCancel={arriba}
        onClick={clic}
        role="img"
        aria-label="Plano de la zona con sus equipos"
      >
        <rect x={0} y={0} width={anchoPx} height={altoPx} className="lienzo-fondo" />
        {imagenUrl && <image className="lienzo-imagen" href={imagenUrl} x={0} y={0} width={anchoPx} height={altoPx} preserveAspectRatio="none" />}
        {hijos(escala, aPlano)}
      </svg>
      <div className="lienzo-controles">
        {/* Bloque 181 · la pantalla completa va ARRIBA y aparte: es el botón que
            se busca en la esquina de un mapa. «Ver el plano entero» llevaba el
            ícono ⤢, que es justo el de ampliar, y quien lo tocaba esperando
            pantalla completa sólo conseguía volver a ver el plano entero. */}
        {pantalla && (
          <button type="button" className="lienzo-pantalla" aria-pressed={pantalla.activa}
            aria-label={pantalla.activa ? 'Salir de pantalla completa' : 'Pantalla completa'}
            title={pantalla.activa ? 'Salir de pantalla completa (Esc)' : 'El mapa ocupa toda la pantalla'}
            onClick={pantalla.alternar}>{pantalla.activa ? '✕' : '⛶'}</button>
        )}
        <button type="button" aria-label="Acercar" title="Acercar" onClick={() => zoom(1 / 1.4, vb.x + vb.w / 2, vb.y + vb.h / 2)}>+</button>
        <button type="button" aria-label="Alejar" title="Alejar" onClick={() => zoom(1.4, vb.x + vb.w / 2, vb.y + vb.h / 2)}>−</button>
        <button type="button" aria-label="Ver el plano entero" title="Ver el plano entero" onClick={() => setVb(ENTERA)}>⌂</button>
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
