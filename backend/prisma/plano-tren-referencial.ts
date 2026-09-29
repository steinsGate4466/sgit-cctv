/**
 * PLANO REFERENCIAL DE UN TREN DE LAMINACIÓN CON SU PÚLPITO — bloque 156 (demo del 151).
 *
 * Lo dibuja este script, en metros, con la distribución TÍPICA de un tren de
 * laminación de barras: patio de palanquillas → horno → desbastador →
 * intermedio → acabador → enfriamiento → lecho → cizalla en frío → atado.
 *
 * NO ES LA PLANTA REAL, y lo dice dos veces dentro de la imagen (franja
 * superior y rótulo). Ninguna medida sale de un plano de Aceros Arequipa: sirve
 * para ver el Mapa funcionando hasta que llegue el DWG de un área (§«nunca
 * inventar datos de planta»). Por eso NO lleva capacidades, cotas ni nombres de
 * equipos reales: sólo el orden del proceso, que es igual en cualquier tren.
 *
 * Todo se escribe en METROS y se pasa a píxeles con `M_POR_PX`.
 */

export const M_POR_PX = 0.1; // 1 m = 10 px
export const ANCHO_M = 360;
export const ALTO_M = 160;
export const ANCHO = ANCHO_M / M_POR_PX; // 3600 px
export const ALTO = ALTO_M / M_POR_PX; // 1600 px

const p = (m: number) => Math.round((m / M_POR_PX) * 10) / 10;

/* Paleta de plano (tinta sobre papel), sin depender del tema de la app. */
const C = {
  papel: '#f7f7f4', eje: '#b9c2c7', muro: '#34424a', col: '#5d6b73',
  equipo: '#dfe6ea', equipoBorde: '#4b5b64', horno: '#f0dccb', hornoBorde: '#8a5534',
  linea: '#b0413e', rodillo: '#7d8a91', agua: '#d7e8f2', aguaBorde: '#3f7596',
  pulpito: '#fff6d9', pulpitoBorde: '#9a7414', vidrio: '#9fd0ea',
  bandeja: '#d9822b', texto: '#26333a', suave: '#6b7a82', rojo: '#b3261e', via: '#e6e6e0',
};

const t = (xm: number, ym: number, s: string, tam = 2.6, o: { peso?: number; color?: string; ancla?: string; rot?: number } = {}) =>
  `<text x="${p(xm)}" y="${p(ym)}" font-family="Arial, Helvetica, sans-serif" font-size="${p(tam)}"`
  + ` font-weight="${o.peso ?? 700}" fill="${o.color ?? C.texto}" text-anchor="${o.ancla ?? 'start'}"`
  + (o.rot ? ` transform="rotate(${o.rot} ${p(xm)} ${p(ym)})"` : '') + `>${s}</text>`;

const r = (xm: number, ym: number, wm: number, hm: number, fill: string, stroke: string, sw = 0.3, extra = '') =>
  `<rect x="${p(xm)}" y="${p(ym)}" width="${p(wm)}" height="${p(hm)}" fill="${fill}" stroke="${stroke}" stroke-width="${p(sw)}"${extra}/>`;

const l = (x1: number, y1: number, x2: number, y2: number, stroke: string, sw = 0.2, extra = '') =>
  `<line x1="${p(x1)}" y1="${p(y1)}" x2="${p(x2)}" y2="${p(y2)}" stroke="${stroke}" stroke-width="${p(sw)}"${extra}/>`;

const circ = (xm: number, ym: number, rm: number, fill: string, stroke: string, sw = 0.2) =>
  `<circle cx="${p(xm)}" cy="${p(ym)}" r="${p(rm)}" fill="${fill}" stroke="${stroke}" stroke-width="${p(sw)}"/>`;

/* ------------------------------------------------------------------ piezas */

const LINEA_Y = 44; // eje de laminación

/** Caja de laminación: bastidor sobre la línea y motor al lado de accionamiento (norte). */
function caja(x: number, etiqueta: string, ancho = 2.4): string {
  const s: string[] = [];
  s.push(r(x - 0.4, 34, 1.2 + 0.4, 3.6, '#cfd8dc', C.equipoBorde, 0.2)); // motor
  s.push(l(x + 0.4, 37.6, x + 0.4, 40.5, C.equipoBorde, 0.35)); // cardán
  s.push(r(x - ancho / 2 + 0.4, 40.5, ancho, 7, C.equipo, C.equipoBorde, 0.3)); // bastidor
  s.push(l(x - ancho / 2 + 0.4, LINEA_Y - 0.6, x + ancho / 2 + 0.4, LINEA_Y - 0.6, C.equipoBorde, 0.15));
  s.push(l(x - ancho / 2 + 0.4, LINEA_Y + 0.6, x + ancho / 2 + 0.4, LINEA_Y + 0.6, C.equipoBorde, 0.15));
  s.push(t(x + 0.4, 49.6, etiqueta, 1.4, { ancla: 'middle', color: C.suave }));
  return s.join('');
}

function cizalla(x: number, y: number, etiqueta: string, sub?: string): string {
  return r(x, y, 3, 6, '#f3e3e3', '#8e3b3b', 0.3)
    + l(x, y, x + 3, y + 6, '#8e3b3b', 0.2) + l(x + 3, y, x, y + 6, '#8e3b3b', 0.2)
    + t(x + 1.5, y - 0.8, etiqueta, 1.6, { ancla: 'middle', color: '#8e3b3b' })
    + (sub ? t(x + 1.5, y + 7.8, sub, 1.3, { ancla: 'middle', color: C.suave, peso: 400 }) : '');
}

/** Camino de rodillos: franja con un rodillo por metro. */
function caminoDeRodillos(x1: number, x2: number, y: number, h = 1.6): string {
  const s = [r(x1, y - h / 2, x2 - x1, h, '#eef1f2', C.rodillo, 0.15)];
  for (let x = x1 + 0.5; x < x2; x += 1) s.push(l(x, y - h / 2, x, y + h / 2, C.rodillo, 0.08));
  return s.join('');
}

function llave(x1: number, x2: number, y: number, texto: string): string {
  return `<path d="M${p(x1)} ${p(y + 1)} L${p(x1)} ${p(y)} L${p(x2)} ${p(y)} L${p(x2)} ${p(y + 1)}" fill="none" stroke="${C.suave}" stroke-width="${p(0.15)}"/>`
    + t((x1 + x2) / 2, y - 0.8, texto, 2.2, { ancla: 'middle' });
}

function escalera(x: number, y: number, w: number, h: number): string {
  const s = [r(x, y, w, h, '#ffffff', C.col, 0.15)];
  for (let yy = y + 0.5; yy < y + h; yy += 0.5) s.push(l(x, yy, x + w, yy, C.col, 0.06));
  return s.join('');
}

/** Púlpito: muro, ventanal hacia el tren, consolas en U, muro de monitores y gabinete. */
function pulpito(x: number, y: number, w: number, h: number, nombre: string, detalle: boolean): string {
  const s: string[] = [];
  s.push(r(x, y, w, h, C.pulpito, C.pulpitoBorde, 0.35));
  s.push(r(x + 0.6, y - 0.15, w - 1.2, 0.5, C.vidrio, C.aguaBorde, 0.08)); // ventanal que mira al tren
  // consola en U frente al ventanal
  const cx = x + 2, cw = w - 4;
  s.push(r(cx, y + 1.4, cw, 1.4, '#d9d2bf', C.pulpitoBorde, 0.12));
  s.push(r(cx, y + 2.8, 1.4, 2.4, '#d9d2bf', C.pulpitoBorde, 0.12));
  s.push(r(cx + cw - 1.4, y + 2.8, 1.4, 2.4, '#d9d2bf', C.pulpitoBorde, 0.12));
  const puestos = Math.max(2, Math.floor(cw / 4));
  for (let i = 0; i < puestos; i++) {
    const px = cx + 1.8 + (i * (cw - 3.6)) / Math.max(1, puestos - 1);
    s.push(circ(px, y + 3.6, 0.45, '#ffffff', C.pulpitoBorde, 0.1)); // silla
    s.push(r(px - 0.5, y + 1.55, 1, 0.3, '#3b4a52', '#3b4a52', 0.02)); // monitores de consola
  }
  if (detalle) {
    // muro de monitores (videowall) en la pared del fondo
    const vw = Math.min(12, w - 8), vx = x + (w - vw) / 2 - 1.5;
    for (let i = 0; i < 6; i++) s.push(r(vx + (i * vw) / 6, y + h - 1.1, vw / 6 - 0.15, 0.7, '#2e3b42', '#1d262b', 0.05));
    s.push(t(vx + vw / 2, y + h - 1.6, 'MURO DE MONITORES', 1.1, { ancla: 'middle', color: C.suave }));
    // gabinete del púlpito
    s.push(r(x + w - 3, y + h - 3.2, 2.2, 2.6, '#cfd8dc', C.equipoBorde, 0.15));
    s.push(t(x + w - 1.9, y + h - 3.6, 'GAB.', 1.1, { ancla: 'middle', color: C.suave }));
    // mesa de reuniones / jefe de turno
    s.push(r(x + 1.2, y + h - 3.6, 3.4, 1.6, '#e9e2cf', C.pulpitoBorde, 0.1));
  }
  // puerta
  s.push(l(x + 1.2, y + h, x + 2.4, y + h, C.pulpito, 0.5));
  s.push(t(x + w / 2, y + h + 2.2, nombre, detalle ? 1.7 : 1.4, { ancla: 'middle', color: C.pulpitoBorde }));
  return s.join('');
}

/* ------------------------------------------------------------------ dibujo */

export function svgTrenYPulpito(rotulo = 'Tren de laminación y púlpito'): string {
  const s: string[] = [];
  s.push(`<rect width="${ANCHO}" height="${ALTO}" fill="${C.papel}"/>`);

  /* Ejes de columnas, como en un plano de arquitectura: números cada 12 m, letras A–C. */
  const EJES_X: number[] = [];
  for (let x = 10; x <= 352; x += 12) EJES_X.push(x);
  const EJES_Y = [{ y: 20, n: 'A' }, { y: 60, n: 'B' }, { y: 100, n: 'C' }];
  EJES_X.forEach((x, i) => {
    s.push(l(x, 17, x, 103, C.eje, 0.08, ` stroke-dasharray="${p(1.2)} ${p(0.6)}"`));
    s.push(circ(x, 15.2, 1.3, '#ffffff', C.eje, 0.12));
    s.push(t(x, 15.7, String(i + 1), 1.3, { ancla: 'middle', color: C.suave }));
  });
  for (const e of EJES_Y) {
    s.push(l(5.5, e.y, 355, e.y, C.eje, 0.08, ` stroke-dasharray="${p(1.2)} ${p(0.6)}"`));
    s.push(circ(4, e.y, 1.3, '#ffffff', C.eje, 0.12));
    s.push(t(4, e.y + 0.5, e.n, 1.3, { ancla: 'middle', color: C.suave }));
  }

  /* Franja de advertencia (norte). */
  s.push(r(0, 0, ANCHO_M, 7, '#fbe9e7', '#fbe9e7', 0));
  s.push(t(ANCHO_M / 2, 5, 'PLANO REFERENCIAL DE UN TREN DE LAMINACIÓN Y SU PÚLPITO — NO ES LA PLANTA REAL', 3.6, { ancla: 'middle', color: C.rojo }));

  /* Vía interna (sur) y peatonal. */
  s.push(r(0, 104, ANCHO_M, 9, C.via, '#c9c9c0', 0.1));
  s.push(l(0, 108.5, ANCHO_M, 108.5, '#ffffff', 0.3, ` stroke-dasharray="${p(3)} ${p(2)}"`));
  s.push(t(12, 107.6, 'VÍA INTERNA', 1.6, { color: C.suave }));
  s.push(r(0, 113, ANCHO_M, 2, '#dff0df', '#b9d6b9', 0.05));
  s.push(t(12, 114.6, 'CIRCULACIÓN PEATONAL', 1.2, { color: '#4d7a4d', peso: 400 }));

  /* Nave de laminación. */
  s.push(r(10, 20, 342, 80, 'none', C.muro, 0.8));
  s.push(t(14, 24.4, 'NAVE DE LAMINACIÓN', 2.8));
  // portones
  s.push(l(240, 100, 256, 100, C.papel, 1));
  s.push(t(248, 102.8, 'PORTÓN DE DESPACHO', 1.3, { ancla: 'middle', color: C.suave }));
  s.push(l(10, 70, 10, 84, C.papel, 1));
  s.push(t(8.6, 77, 'INGRESO PALANQUILLA', 1.2, { ancla: 'middle', color: C.suave, rot: -90 }));
  // columnas
  for (const x of EJES_X) for (const e of EJES_Y) s.push(r(x - 0.5, e.y - 0.5, 1, 1, C.col, C.col, 0.05));

  /* Grúas puente (una por nave), punteadas. */
  s.push(r(12, 21.5, 45, 74, 'none', '#8b9aa2', 0.2, ` stroke-dasharray="${p(1.5)} ${p(1)}"`));
  s.push(t(55.8, 92, 'RECORRIDO GRÚA PUENTE', 1.3, { color: '#8b9aa2', rot: -90 }));
  s.push(r(212, 75.5, 138, 20, 'none', '#8b9aa2', 0.2, ` stroke-dasharray="${p(1.5)} ${p(1)}"`));
  s.push(t(348.5, 94.6, 'RECORRIDO GRÚA PUENTE', 1.3, { ancla: 'end', color: '#8b9aa2' }));

  /* Patio de palanquillas. */
  s.push(t(16, 30, 'PATIO DE PALANQUILLAS', 2));
  for (let fila = 0; fila < 6; fila++) {
    for (let col = 0; col < 3; col++) {
      const x = 15 + col * 14.5, y = 33 + fila * 10.5;
      s.push(r(x, y, 12, 3.2, '#e2d8cd', '#8b7765', 0.15));
      for (let k = 1; k < 8; k++) s.push(l(x, y + (k * 3.2) / 8, x + 12, y + (k * 3.2) / 8, '#b7a491', 0.05));
    }
  }

  /* Mesa de carga y horno. */
  s.push(r(58, 36, 8, 16, '#eef1f2', C.rodillo, 0.2));
  for (let y = 37; y < 52; y += 1) s.push(l(58, y, 66, y, C.rodillo, 0.08));
  s.push(t(62, 54, 'MESA DE', 1.2, { ancla: 'middle', color: C.suave }));
  s.push(t(62, 55.4, 'CARGA', 1.2, { ancla: 'middle', color: C.suave }));
  s.push(r(66, 30, 36, 28, C.horno, C.hornoBorde, 0.6));
  for (let x = 68; x < 101; x += 2) s.push(l(x, 31, x, 57, '#e3c5ad', 0.12));
  for (let x = 70; x < 100; x += 6) { s.push(circ(x, 30, 0.6, '#ffffff', C.hornoBorde, 0.12)); s.push(circ(x, 58, 0.6, '#ffffff', C.hornoBorde, 0.12)); }
  s.push(t(84, 42.6, 'HORNO DE', 2.4, { ancla: 'middle', color: C.hornoBorde }));
  s.push(t(84, 45.8, 'RECALENTAMIENTO', 2.4, { ancla: 'middle', color: C.hornoBorde }));
  s.push(t(84, 49, 'quemadores ○', 1.3, { ancla: 'middle', color: C.suave, peso: 400 }));
  // chimenea fuera de la nave
  s.push(circ(84, 12, 2.4, '#e8e2dc', C.hornoBorde, 0.3));
  s.push(l(84, 14.4, 84, 30, C.hornoBorde, 0.25, ` stroke-dasharray="${p(0.8)} ${p(0.5)}"`));
  s.push(t(87.2, 12.6, 'CHIMENEA', 1.4, { color: C.hornoBorde }));

  /* Eje de laminación y camino de rodillos. */
  s.push(caminoDeRodillos(102, 256, LINEA_Y));
  s.push(l(100, LINEA_Y, 352, LINEA_Y, C.linea, 0.12, ` stroke-dasharray="${p(3)} ${p(0.6)} ${p(0.6)} ${p(0.6)}"`));
  s.push(t(262, 42.4, 'SENTIDO DE LAMINACIÓN →', 1.3, { color: C.linea }));

  // descascarillador
  s.push(r(104, 40.5, 3, 7, C.agua, C.aguaBorde, 0.25));
  s.push(t(105.5, 52, 'DESCASCA-', 1.2, { ancla: 'middle', color: C.aguaBorde }));
  s.push(t(105.5, 53.4, 'RILLADOR', 1.2, { ancla: 'middle', color: C.aguaBorde }));

  // tren desbastador
  [112, 118, 124, 130, 136, 142].forEach((x, i) => s.push(caja(x, `D${i + 1}`)));
  s.push(llave(110.5, 144.5, 31.5, 'TREN DESBASTADOR'));
  s.push(cizalla(148.5, 41, 'CIZALLA 1', 'despunte'));

  // tren intermedio
  [158, 164, 170, 176, 182, 188].forEach((x, i) => s.push(caja(x, `I${i + 1}`)));
  s.push(llave(156.5, 190.5, 31.5, 'TREN INTERMEDIO'));
  s.push(cizalla(194.5, 41, 'CIZALLA 2', 'despunte'));

  // tren acabador (cajas más juntas)
  [203, 208, 213, 218, 223, 228].forEach((x, i) => s.push(caja(x, `A${i + 1}`, 2)));
  s.push(llave(201.5, 230.5, 31.5, 'TREN ACABADOR'));

  // enfriamiento por agua
  s.push(r(234, 42, 12, 4, C.agua, C.aguaBorde, 0.25));
  for (let x = 235; x < 246; x += 1.5) s.push(circ(x, 44, 0.35, '#ffffff', C.aguaBorde, 0.08));
  s.push(t(240, 40.8, 'ENFRIAMIENTO', 1.4, { ancla: 'middle', color: C.aguaBorde }));
  s.push(cizalla(249.5, 41, 'CIZALLA', 'divisora'));

  /* Lecho de enfriamiento: la barra entra por el eje y avanza hacia el sur. */
  s.push(caminoDeRodillos(256, 348, LINEA_Y));
  s.push(r(258, 47, 86, 23, '#f1f3f4', C.equipoBorde, 0.35));
  for (let y = 48; y < 70; y += 0.9) s.push(l(258.5, y, 343.5, y, '#b7c2c7', 0.07));
  for (let x = 262; x < 344; x += 8) s.push(l(x, 47, x, 70, '#9aa7ae', 0.12));
  s.push(r(282, 55.5, 38, 6, C.papel, 'none', 0));
  s.push(t(301, 59.8, 'LECHO DE ENFRIAMIENTO', 2.4, { ancla: 'middle' }));
  s.push(t(346.5, 58.5, '↓ avance', 1.2, { ancla: 'middle', color: C.suave, rot: 90 }));
  // mesa de salida hacia la cizalla en frío (de este a oeste)
  s.push(caminoDeRodillos(292, 348, 72.5));
  s.push(cizalla(286, 69.5, 'CIZALLA EN FRÍO'));

  /* Atado y paquetes. */
  s.push(r(214, 78, 70, 18, 'none', C.suave, 0.2, ` stroke-dasharray="${p(1)} ${p(0.6)}"`));
  s.push(t(216, 81.4, 'ZONA DE ATADO Y PAQUETES', 1.9));
  for (let i = 0; i < 7; i++) for (let j = 0; j < 2; j++) {
    const x = 218 + i * 9.2, y = 84 + j * 5.5;
    s.push(r(x, y, 7.5, 3.4, '#e4e4de', '#7d7d73', 0.12));
    s.push(l(x + 2, y, x + 2, y + 3.4, '#7d7d73', 0.1));
    s.push(l(x + 5.5, y, x + 5.5, y + 3.4, '#7d7d73', 0.1));
  }
  s.push(r(286, 80, 6, 6, C.equipo, C.equipoBorde, 0.2));
  s.push(t(289, 88.6, 'ATADORA', 1.2, { ancla: 'middle', color: C.suave }));

  /* Púlpitos. El principal mira al tren intermedio y acabador. */
  s.push(pulpito(160, 52, 24, 10, 'PÚLPITO DE CONTROL — TREN', true));
  s.push(escalera(184, 56, 3.2, 6));
  s.push(t(187.8, 59.4, 'ESCALERA', 1.1, { color: C.suave }));
  s.push(pulpito(70, 61, 14, 7, 'PÚLPITO DEL HORNO', false));
  s.push(pulpito(310, 78, 16, 8, 'PÚLPITO DEL LECHO', false));

  /* Edificios del lado sur. */
  const edificio = (x: number, y: number, w: number, h: number, n1: string, n2 = '') => {
    s.push(r(x, y, w, h, '#ffffff', C.muro, 0.5));
    s.push(t(x + w / 2, y + h / 2 + (n2 ? -0.6 : 0.8), n1, 1.8, { ancla: 'middle' }));
    if (n2) s.push(t(x + w / 2, y + h / 2 + 1.8, n2, 1.3, { ancla: 'middle', color: C.suave, peso: 400 }));
  };
  // subestación con transformadores
  edificio(20, 119, 40, 28, '', '');
  for (const x of [26, 38, 50]) { s.push(r(x - 3, 124, 6, 6, '#e8e8e8', C.equipoBorde, 0.2)); s.push(circ(x, 127, 1.4, 'none', C.equipoBorde, 0.15)); }
  s.push(t(40, 138, 'SUBESTACIÓN', 1.9, { ancla: 'middle' }));
  s.push(t(40, 140.6, 'transformadores', 1.3, { ancla: 'middle', color: C.suave, peso: 400 }));
  // sala eléctrica con filas de tableros
  s.push(r(106, 119, 44, 24, '#ffffff', C.muro, 0.5));
  for (let fila = 0; fila < 3; fila++) for (let k = 0; k < 16; k++) s.push(r(109 + k * 2.4, 122 + fila * 5, 2.2, 1.6, '#dde3e6', C.equipoBorde, 0.08));
  s.push(t(128, 139.6, 'SALA ELÉCTRICA · MCC', 1.8, { ancla: 'middle' }));
  // sala de comunicaciones (gabinete R-01, switch core y grabador)
  s.push(r(154, 119, 20, 16, '#ffffff', C.muro, 0.5));
  for (let k = 0; k < 4; k++) s.push(r(156.5 + k * 3.8, 122, 2.4, 3.2, '#cfd8dc', C.equipoBorde, 0.12));
  s.push(t(164, 130.6, 'SALA DE', 1.6, { ancla: 'middle' }));
  s.push(t(164, 132.6, 'COMUNICACIONES', 1.6, { ancla: 'middle' }));
  // oficinas con ambientes
  s.push(r(186, 119, 56, 30, '#ffffff', C.muro, 0.5));
  for (const x of [200, 214, 228]) s.push(l(x, 119, x, 134, C.muro, 0.25));
  s.push(l(186, 134, 242, 134, C.muro, 0.25));
  s.push(t(214, 142.4, 'OFICINAS DE LAMINACIÓN', 1.8, { ancla: 'middle' }));
  // planta de agua
  s.push(r(252, 119, 44, 30, '#ffffff', C.muro, 0.5));
  for (const x of [262, 274, 286]) s.push(circ(x, 128, 4.2, C.agua, C.aguaBorde, 0.25));
  s.push(t(274, 142.4, 'PLANTA DE AGUA', 1.8, { ancla: 'middle' }));

  /* Ruta de bandeja de cables (referencial): de la sala de comunicaciones al púlpito y a lo largo de la nave. */
  const band = ` stroke-dasharray="${p(1.2)} ${p(0.5)}" fill="none"`;
  s.push(`<path d="M${p(164)} ${p(119)} L${p(164)} ${p(97)} M${p(16)} ${p(97)} L${p(348)} ${p(97)} M${p(172)} ${p(97)} L${p(172)} ${p(62)} M${p(76)} ${p(97)} L${p(76)} ${p(68)} M${p(318)} ${p(97)} L${p(318)} ${p(86)}" stroke="${C.bandeja}" stroke-width="${p(0.35)}"${band}/>`);
  s.push(t(20, 96.2, 'RUTA DE BANDEJA (REFERENCIAL)', 1.3, { color: C.bandeja }));

  /* Norte y rótulo (esquina inferior derecha, como en AutoCAD). */
  s.push(`<g transform="translate(${p(306)} ${p(128)})"><circle r="${p(4)}" fill="#ffffff" stroke="${C.muro}" stroke-width="${p(0.2)}"/>`
    + `<path d="M0 ${p(-3.4)} L${p(1.4)} ${p(2)} L0 ${p(1)} L${p(-1.4)} ${p(2)} Z" fill="${C.muro}"/></g>`);
  s.push(t(306, 121.6, 'N', 1.8, { ancla: 'middle' }));
  s.push(t(306, 134.6, 'norte de dibujo', 1.1, { ancla: 'middle', color: C.suave, peso: 400 }));

  s.push(r(314, 119, 42, 36, '#ffffff', C.muro, 0.4));
  s.push(l(314, 126, 356, 126, C.muro, 0.15));
  s.push(l(314, 146, 356, 146, C.muro, 0.15));
  s.push(t(316, 123.6, 'SGIT-CCTV · PLANO DE DEMOSTRACIÓN', 1.7));
  s.push(t(316, 129.6, rotulo, 1.7, { peso: 700 }));
  s.push(t(316, 132.4, 'Distribución típica, dibujada a mano alzada', 1.3, { peso: 400, color: C.suave }));
  s.push(t(316, 134.8, 'por el sistema. No sale de ningún plano real:', 1.3, { peso: 400, color: C.suave }));
  s.push(t(316, 137.2, 'medidas y posiciones son de ejemplo.', 1.3, { peso: 400, color: C.suave }));
  s.push(t(316, 141, 'Escala: 1 m = 10 px (calibrado)', 1.3, { peso: 400, color: C.suave }));
  // escala gráfica 0–20 m
  for (let i = 0; i < 4; i++) s.push(r(316 + i * 5, 142.4, 5, 0.8, i % 2 ? '#ffffff' : C.muro, C.muro, 0.08));
  s.push(t(316, 145.4, '0', 1.1, { peso: 400 }));
  s.push(t(326, 145.4, '10', 1.1, { peso: 400, ancla: 'middle' }));
  s.push(t(336, 145.4, '20 m', 1.1, { peso: 400, ancla: 'middle' }));
  s.push(t(335, 151.4, 'NO ES LA PLANTA REAL', 2.2, { ancla: 'middle', color: C.rojo }));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO}" height="${ALTO}" viewBox="0 0 ${ANCHO} ${ALTO}">\n${s.join('\n')}\n</svg>`;
}

/* ------------------------------------------------------- dónde va cada equipo */

export type Sitio = { xm: number; ym: number; alturaM?: number; rumbo?: number; alcanceM?: number };

/** Posiciones de los equipos de demo, en METROS del plano referencial. Rumbo: 0 = este, 90 = sur (sentido horario). */
export const SITIOS_M: Record<string, Sitio> = {
  // de `demo:cargar`
  'DEMO-CAM-COLADA': { xm: 14, ym: 31, alturaM: 8, rumbo: 35, alcanceM: 32 },
  'DEMO-CAM-HORNO': { xm: 104, ym: 29, alturaM: 8, rumbo: 150, alcanceM: 18 },
  'DEMO-CAM-LECHO': { xm: 347, ym: 46, alturaM: 6, rumbo: 160, alcanceM: 45 },
  'DEMO-CAM-OFICINA': { xm: 188, ym: 121, alturaM: 3, rumbo: 30, alcanceM: 10 },
  'DEMO-AP-PULPITO': { xm: 182.5, ym: 52.6, alturaM: 9 },
  'DEMO-PSU-PULPITO': { xm: 182.5, ym: 60.2, alturaM: 1.5 },
  // de `demo:infra`
  'DEMO-SW-T1-PUL': { xm: 181.2, ym: 60.2, alturaM: 2 },
  'DEMO-SW-T1-CORE': { xm: 157.7, ym: 123.6, alturaM: 1.8 },
  'DEMO-NVR-T1-R01': { xm: 161.5, ym: 123.6, alturaM: 1.2 },
  // las del tren, que crea este mismo script
  'DEMO-CAM-T1-CARGA': { xm: 57, ym: 33, alturaM: 7, rumbo: 60, alcanceM: 20 },
  'DEMO-CAM-T1-DESB': { xm: 110, ym: 55, alturaM: 8, rumbo: 330, alcanceM: 30 },
  'DEMO-CAM-T1-CIZ1': { xm: 150, ym: 55, alturaM: 6, rumbo: 270, alcanceM: 14 },
  'DEMO-CAM-T1-INT': { xm: 173, ym: 30, alturaM: 9, rumbo: 90, alcanceM: 22 },
  'DEMO-CAM-T1-ACAB': { xm: 200, ym: 55, alturaM: 8, rumbo: 330, alcanceM: 28 },
  'DEMO-CAM-T1-DIV': { xm: 251, ym: 36, alturaM: 6, rumbo: 90, alcanceM: 14 },
  'DEMO-CAM-T1-PUL': { xm: 161.2, ym: 61, alturaM: 3, rumbo: 315, alcanceM: 12 },
  'DEMO-CAM-T1-FRIO': { xm: 296, ym: 67, alturaM: 6, rumbo: 170, alcanceM: 14 },
  'DEMO-CAM-T1-ATADO': { xm: 212, ym: 77, alturaM: 8, rumbo: 20, alcanceM: 30 },
  'DEMO-CAM-T1-DESP': { xm: 258, ym: 99, alturaM: 6, rumbo: 200, alcanceM: 20 },
};

/** Cámaras del tren que crea `demo:plano` (todas con prefijo DEMO-, las borra `demo:borrar`). */
export const CAMARAS_DEL_TREN: { codigo: string; lugar: string; estado: 'OPERATIVO' | 'MANTENIMIENTO' | 'FUERA_SERVICIO'; criticidad: 'ALTA' | 'MEDIA' }[] = [
  { codigo: 'DEMO-CAM-T1-CARGA', lugar: 'Mesa de carga del horno (ejemplo)', estado: 'OPERATIVO', criticidad: 'MEDIA' },
  { codigo: 'DEMO-CAM-T1-DESB', lugar: 'Tren desbastador (ejemplo)', estado: 'OPERATIVO', criticidad: 'ALTA' },
  { codigo: 'DEMO-CAM-T1-CIZ1', lugar: 'Cizalla 1 (ejemplo)', estado: 'MANTENIMIENTO', criticidad: 'ALTA' },
  { codigo: 'DEMO-CAM-T1-INT', lugar: 'Tren intermedio (ejemplo)', estado: 'OPERATIVO', criticidad: 'ALTA' },
  { codigo: 'DEMO-CAM-T1-ACAB', lugar: 'Tren acabador (ejemplo)', estado: 'OPERATIVO', criticidad: 'ALTA' },
  { codigo: 'DEMO-CAM-T1-DIV', lugar: 'Cizalla divisora (ejemplo)', estado: 'OPERATIVO', criticidad: 'MEDIA' },
  { codigo: 'DEMO-CAM-T1-PUL', lugar: 'Interior del púlpito de control (ejemplo)', estado: 'OPERATIVO', criticidad: 'MEDIA' },
  { codigo: 'DEMO-CAM-T1-FRIO', lugar: 'Cizalla en frío (ejemplo)', estado: 'OPERATIVO', criticidad: 'MEDIA' },
  { codigo: 'DEMO-CAM-T1-ATADO', lugar: 'Zona de atado y paquetes (ejemplo)', estado: 'OPERATIVO', criticidad: 'MEDIA' },
  { codigo: 'DEMO-CAM-T1-DESP', lugar: 'Portón de despacho (ejemplo)', estado: 'FUERA_SERVICIO', criticidad: 'MEDIA' },
];

/** Tipo de cámara de cada cámara de demo (bloque 161: decide su ícono en el mapa). */
export const ESTILO_DEMO: Record<string, string> = {
  'DEMO-CAM-T1-SALAE': 'Domo',
  'DEMO-CAM-T2-CARGA': 'Bala (bullet)', 'DEMO-CAM-T2-DESB': 'PTZ', 'DEMO-CAM-T2-ACAB': 'Bala (bullet)', 'DEMO-CAM-T2-PUL': 'Domo', 'DEMO-CAM-T2-ATADO': 'Bala (bullet)',
  'DEMO-CAM-T2-SE1': 'Domo', 'DEMO-CAM-T2-SE2': 'Domo',
  'DEMO-CAM-COLADA': 'Bala (bullet)', 'DEMO-CAM-HORNO': 'Térmica', 'DEMO-CAM-LECHO': 'PTZ',
  'DEMO-CAM-OFICINA': 'Domo', 'DEMO-CAM-T1-CARGA': 'Bala (bullet)', 'DEMO-CAM-T1-DESB': 'PTZ',
  'DEMO-CAM-T1-CIZ1': 'Bala (bullet)', 'DEMO-CAM-T1-INT': 'Domo', 'DEMO-CAM-T1-ACAB': 'PTZ',
  'DEMO-CAM-T1-DIV': 'Bala (bullet)', 'DEMO-CAM-T1-PUL': 'Ojo de pez 360°', 'DEMO-CAM-T1-FRIO': 'Domo',
  'DEMO-CAM-T1-ATADO': 'Bala (bullet)', 'DEMO-CAM-T1-DESP': 'Domo',
};

/** Metros → píxeles del plano, para guardar en `PosicionEnPlano`. */
export const enPx = (s: Sitio) => ({ x: p(s.xm), y: p(s.ym) });

/* =============================================================================
   ZONAS DEL DIBUJO — bloque 165. Polígonos en METROS sobre este mismo dibujo
   (sirven para el Tren 1 y el Tren 2 de la demo, que usan el mismo trazado).
   La línea de laminación rodea el púlpito con una muesca: así un equipo del
   púlpito es del púlpito, no de los dos.
============================================================================= */
export type ZonaDemo = { clave: string; nombre: string; tipo: 'AREA' | 'SALA'; m: [number, number][] };
export const ZONAS_DEL_TREN: ZonaDemo[] = [
  { clave: 'HORNO', nombre: 'Horno y patio de palanquillas', tipo: 'AREA', m: [[10, 20], [106, 20], [106, 100], [10, 100]] },
  { clave: 'LINEA', nombre: 'Línea de laminación', tipo: 'AREA', m: [[106, 20], [352, 20], [352, 75], [186, 75], [186, 50], [158, 50], [158, 75], [106, 75]] },
  { clave: 'PULPITO', nombre: 'Púlpito de control', tipo: 'SALA', m: [[158, 50], [186, 50], [186, 66], [158, 66]] },
  { clave: 'ATADO', nombre: 'Atado y despacho', tipo: 'AREA', m: [[210, 75], [352, 75], [352, 100], [210, 100]] },
  { clave: 'SALAE', nombre: 'Sala eléctrica', tipo: 'SALA', m: [[106, 119], [150, 119], [150, 143], [106, 143]] },
  { clave: 'COMS', nombre: 'Sala de comunicaciones', tipo: 'SALA', m: [[154, 119], [174, 119], [174, 135], [154, 135]] },
];
export const zonaEnPx = (z: ZonaDemo): [number, number][] => z.m.map(([x, y]) => [p(x), p(y)]);

/** Cámaras del TREN 2 de la demo: mismo trazado, otros códigos. */
export const CAMARAS_DEL_TREN_2: typeof CAMARAS_DEL_TREN = [
  { codigo: 'DEMO-CAM-T2-CARGA', lugar: 'Mesa de carga del horno (ejemplo)', estado: 'OPERATIVO', criticidad: 'MEDIA' },
  { codigo: 'DEMO-CAM-T2-DESB', lugar: 'Tren desbastador (ejemplo)', estado: 'OPERATIVO', criticidad: 'ALTA' },
  { codigo: 'DEMO-CAM-T2-ACAB', lugar: 'Tren acabador (ejemplo)', estado: 'FUERA_SERVICIO', criticidad: 'ALTA' },
  { codigo: 'DEMO-CAM-T2-PUL', lugar: 'Interior del púlpito de control (ejemplo)', estado: 'OPERATIVO', criticidad: 'MEDIA' },
  { codigo: 'DEMO-CAM-T2-ATADO', lugar: 'Zona de atado y paquetes (ejemplo)', estado: 'OPERATIVO', criticidad: 'MEDIA' },
];
export const SITIOS_T2_M: Record<string, Sitio> = {
  'DEMO-CAM-T2-CARGA': SITIOS_M['DEMO-CAM-T1-CARGA'],
  'DEMO-CAM-T2-DESB': SITIOS_M['DEMO-CAM-T1-DESB'],
  'DEMO-CAM-T2-ACAB': SITIOS_M['DEMO-CAM-T1-ACAB'],
  'DEMO-CAM-T2-PUL': SITIOS_M['DEMO-CAM-T1-PUL'],
  'DEMO-CAM-T2-ATADO': SITIOS_M['DEMO-CAM-T1-ATADO'],
};
/** Una cámara en la sala eléctrica del Tren 1 (la zona no queda vacía en la demo). */
export const CAMARA_SALA_T1 = { codigo: 'DEMO-CAM-T1-SALAE', lugar: 'Sala eléctrica, pasillo de tableros (ejemplo)', sitio: { xm: 128, ym: 131, alturaM: 3, rumbo: 0, alcanceM: 16 } as Sitio };
