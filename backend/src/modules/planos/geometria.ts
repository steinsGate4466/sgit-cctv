/**
 * PLANO VIVO — lógica pura (bloque 151). Sin base de datos: se prueba aparte
 * en `test/plano-vivo.spec.ts`.
 */

/** Tope razonable de una imagen de plano. Más grande no la abre un teléfono. */
export const MAX_LADO_PX = 20000;

/**
 * CALIBRAR LA ESCALA con dos puntos de distancia real conocida
 * (ej. «del eje A al eje D hay 60 m»). Devuelve metros por píxel.
 */
export function calibrar(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  metros: number,
): { metrosPorPx: number } | { error: string } {
  if (![p1.x, p1.y, p2.x, p2.y, metros].every((n) => Number.isFinite(n))) {
    return { error: 'Faltan los dos puntos o la distancia.' };
  }
  if (metros <= 0) return { error: 'La distancia real tiene que ser mayor que cero.' };
  const px = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (px < 20) {
    return { error: 'Los dos puntos están casi en el mismo sitio. Elige dos puntos lejanos: la escala sale más exacta.' };
  }
  return { metrosPorPx: metros / px };
}

/** ¿El punto cae dentro de la imagen? */
export function dentroDelPlano(x: number, y: number, anchoPx: number, altoPx: number): boolean {
  return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x <= anchoPx && y <= altoPx;
}

export type ColorMapa = 'ok' | 'alerta' | 'caida' | 'sindato';

/**
 * EL COLOR DEL PUNTO. Lo que manda, en orden:
 *
 *   1. El MONITOREO, si hay un dato vigente: responde / inestable / caído.
 *   2. Si hubo monitoreo y el dato CADUCÓ → gris «sin dato». No se sabe, y
 *      el mapa no pinta verde lo que no sabe.
 *   3. Si nunca hubo monitoreo, el estado DECLARADO del equipo (OM o
 *      incidencia abierta, fuera de servicio), marcado como declarado para
 *      que nadie lo confunda con una medición.
 */
export function colorDelPunto(
  veredicto: { estado: 'RESPONDE' | 'CAIDO' | 'INESTABLE' | 'SIN_DATO'; texto: string; caducada: boolean } | null,
  estadoEfectivo: string | null | undefined,
): { color: ColorMapa; texto: string; fuente: 'monitoreo' | 'declarado' } {
  if (veredicto && veredicto.estado !== 'SIN_DATO') {
    const color: ColorMapa = veredicto.estado === 'RESPONDE' ? 'ok' : veredicto.estado === 'CAIDO' ? 'caida' : 'alerta';
    return { color, texto: veredicto.texto, fuente: 'monitoreo' };
  }
  if (veredicto && veredicto.caducada) {
    return { color: 'sindato', texto: veredicto.texto, fuente: 'monitoreo' };
  }
  switch (estadoEfectivo) {
    case 'FUERA_SERVICIO':
      return { color: 'caida', texto: 'Fuera de servicio (declarado).', fuente: 'declarado' };
    case 'CON_INCIDENCIA':
      return { color: 'alerta', texto: 'Tiene una incidencia abierta.', fuente: 'declarado' };
    case 'MANTENIMIENTO':
      return { color: 'alerta', texto: 'En mantenimiento: tiene una orden abierta.', fuente: 'declarado' };
    case 'OPERATIVO':
      return { color: 'ok', texto: 'Operativo según lo declarado. No hay monitoreo automático.', fuente: 'declarado' };
    default:
      return { color: 'sindato', texto: 'Sin dato de estado.', fuente: 'declarado' };
  }
}

/* =============================================================================
   ZONAS — bloque 165. Polígonos sobre el plano (sala eléctrica, púlpito…).
============================================================================= */
export type Punto = [number, number];
export const MAX_VERTICES_ZONA = 60;

/** Área con signo (fórmula del cordón). Su valor absoluto es el área en px². */
function areaConSigno(pol: Punto[]): number {
  let a = 0;
  for (let i = 0; i < pol.length; i++) {
    const [x1, y1] = pol[i];
    const [x2, y2] = pol[(i + 1) % pol.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/**
 * ¿Se puede guardar este polígono? Devuelve los vértices redondeados o el
 * motivo, en palabras de quien lo dibuja.
 */
export function validarZona(puntos: unknown, anchoPx: number, altoPx: number): { puntos: Punto[] } | { error: string } {
  if (!Array.isArray(puntos) || puntos.length < 3) return { error: 'Una zona necesita al menos 3 puntos.' };
  if (puntos.length > MAX_VERTICES_ZONA) return { error: `Una zona tiene como mucho ${MAX_VERTICES_ZONA} puntos.` };
  const pol: Punto[] = [];
  for (const p of puntos) {
    if (!Array.isArray(p) || p.length !== 2) return { error: 'Cada punto de la zona es [x, y].' };
    const [x, y] = p.map(Number);
    if (!dentroDelPlano(x, y, anchoPx, altoPx)) return { error: 'Un punto de la zona cae fuera del plano.' };
    pol.push([Math.round(x), Math.round(y)]);
  }
  if (Math.abs(areaConSigno(pol)) < 100) return { error: 'La zona es demasiado pequeña (o sus puntos están en línea).' };
  return { puntos: pol };
}

/** ¿El punto (x, y) cae dentro del polígono? Rayo hacia la derecha, par/impar. */
export function dentroDeZona(x: number, y: number, pol: Punto[]): boolean {
  let dentro = false;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const [xi, yi] = pol[i];
    const [xj, yj] = pol[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/** Caja que envuelve la zona (para encuadrarla en pantalla) y su centro (para el rótulo). */
export function cajaDeZona(pol: Punto[]): { x: number; y: number; w: number; h: number; cx: number; cy: number } {
  const xs = pol.map((p) => p[0]);
  const ys = pol.map((p) => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  const w = Math.max(...xs) - x, h = Math.max(...ys) - y;
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
}

/**
 * Dónde va el NOMBRE de la zona: su centro de gravedad (una nave en L o con
 * una muesca lo tiene dentro, casi siempre) y, si cayera fuera, el centro de
 * la caja. El centro de la caja de una zona con muesca cae en la muesca —
 * que es otra zona— y el rótulo acababa encima del púlpito.
 */
export function rotuloDeZona(pol: Punto[]): { x: number; y: number } {
  const a = areaConSigno(pol);
  const c = cajaDeZona(pol);
  if (Math.abs(a) < 1e-6) return { x: c.cx, y: c.cy };
  let cx = 0, cy = 0;
  for (let i = 0; i < pol.length; i++) {
    const [x1, y1] = pol[i];
    const [x2, y2] = pol[(i + 1) % pol.length];
    const f = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * f; cy += (y1 + y2) * f;
  }
  const g = { x: Math.round(cx / (6 * a)), y: Math.round(cy / (6 * a)) };
  if (dentroDeZona(g.x, g.y, pol)) return g;
  /* En una U el centro de gravedad cae en el hueco. Se busca, a varias
     alturas, el tramo horizontal INTERIOR más ancho y se toma su mitad. */
  let mejor: { x: number; y: number; ancho: number } | null = null;
  for (const f of [0.5, 0.35, 0.65, 0.2, 0.8, 0.1, 0.9]) {
    const y = c.y + c.h * f;
    const xs: number[] = [];
    for (let i = 0; i < pol.length; i++) {
      const [x1, y1] = pol[i];
      const [x2, y2] = pol[(i + 1) % pol.length];
      if ((y1 > y) !== (y2 > y)) xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const ancho = xs[k + 1] - xs[k];
      if (!mejor || ancho > mejor.ancho) mejor = { x: Math.round((xs[k] + xs[k + 1]) / 2), y: Math.round(y), ancho };
    }
  }
  return mejor ? { x: mejor.x, y: mejor.y } : { x: c.cx, y: c.cy };
}

const GRAVEDAD: Record<string, number> = { caida: 3, alerta: 2, sindato: 1, ok: 0 };

/**
 * EL COLOR DE UNA ZONA = el de su peor equipo. Una sala con un equipo caído
 * está en rojo aunque los otros diez respondan: es donde hay que ir.
 * Sin equipos es «vacia», no verde: una zona sin nada dibujado no está bien,
 * está sin mirar.
 */
export function estadoDeZona(resumen: Record<string, number>): 'ok' | 'alerta' | 'caida' | 'sindato' | 'vacia' {
  const total = Object.values(resumen).reduce((a, b) => a + b, 0);
  if (!total) return 'vacia';
  return (Object.keys(GRAVEDAD) as ('caida' | 'alerta' | 'sindato' | 'ok')[])
    .sort((a, b) => GRAVEDAD[b] - GRAVEDAD[a])
    .find((k) => (resumen[k] ?? 0) > 0)!;
}
