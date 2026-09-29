/**
 * PLANO REFERENCIAL DE UNA SALA ELÉCTRICA — bloque 165 (demo de las zonas).
 *
 * Una sala eléctrica TÍPICA de un tren de laminación: filas de tableros (CCM),
 * tablero general, gabinete de comunicaciones con su switch y UPS, bandeja de
 * cables y dos cámaras domo en el pasillo. NO ES LA PLANTA REAL: lo dice en la
 * franja superior y en el rótulo. Sirve para enseñar cómo una zona del plano
 * del tren abre el plano de la sala (planta → tren → sala).
 *
 *   30 m × 16 m · 1 m = 40 px → 1200 × 640 px.
 */
export const M_POR_PX_SALA = 0.025;
export const ANCHO_SALA_M = 30;
export const ALTO_SALA_M = 16;
export const ANCHO_SALA = Math.round(ANCHO_SALA_M / M_POR_PX_SALA);
export const ALTO_SALA = Math.round(ALTO_SALA_M / M_POR_PX_SALA);

const p = (m: number) => Math.round((m / M_POR_PX_SALA) * 10) / 10;
const C = {
  papel: '#f7f7f4', muro: '#34424a', tablero: '#dfe6ea', tableroBorde: '#4b5b64', texto: '#26333a',
  suave: '#6b7a82', rojo: '#b3261e', bandeja: '#d9822b', gabinete: '#cfd8dc', piso: '#ecebe4',
};
const t = (x: number, y: number, s: string, tam = 0.5, o: { peso?: number; color?: string; ancla?: string } = {}) =>
  `<text x="${p(x)}" y="${p(y)}" font-family="Arial, Helvetica, sans-serif" font-size="${p(tam)}" font-weight="${o.peso ?? 700}"`
  + ` fill="${o.color ?? C.texto}" text-anchor="${o.ancla ?? 'start'}">${s}</text>`;
const r = (x: number, y: number, w: number, h: number, fill: string, stroke: string, sw = 0.06) =>
  `<rect x="${p(x)}" y="${p(y)}" width="${p(w)}" height="${p(h)}" fill="${fill}" stroke="${stroke}" stroke-width="${p(sw)}"/>`;
const l = (x1: number, y1: number, x2: number, y2: number, stroke: string, sw = 0.05, extra = '') =>
  `<line x1="${p(x1)}" y1="${p(y1)}" x2="${p(x2)}" y2="${p(y2)}" stroke="${stroke}" stroke-width="${p(sw)}"${extra}/>`;

export function svgSalaElectrica(rotulo = 'Sala eléctrica'): string {
  const s: string[] = [];
  s.push(r(0, 0, ANCHO_SALA_M, ALTO_SALA_M, C.papel, C.papel, 0));
  s.push(r(0, 0, ANCHO_SALA_M, 1.4, '#fbe9e7', '#fbe9e7', 0));
  s.push(t(ANCHO_SALA_M / 2, 1, 'PLANO REFERENCIAL DE UNA SALA ELÉCTRICA — NO ES LA PLANTA REAL', 0.7, { ancla: 'middle', color: C.rojo }));

  // Muros y puertas.
  s.push(r(1, 2.2, 28, 12.6, C.piso, C.muro, 0.25));
  s.push(l(1, 8, 1, 10, C.piso, 0.35));
  s.push(t(1.4, 9.2, 'PUERTA', 0.4, { color: C.suave }));
  s.push(l(26, 14.8, 28, 14.8, C.piso, 0.35));
  s.push(t(27, 15.5, 'SALIDA DE EMERGENCIA', 0.4, { ancla: 'middle', color: C.suave }));

  // Tres filas de tableros del CCM (centro de control de motores).
  const filas = [{ y: 3.2, n: 'CCM-1' }, { y: 6.8, n: 'CCM-2' }, { y: 10.4, n: 'CCM-3' }];
  for (const f of filas) {
    for (let k = 0; k < 14; k++) s.push(r(4 + k * 1.1, f.y, 1, 1.2, C.tablero, C.tableroBorde, 0.04));
    s.push(t(3.8, f.y + 0.9, f.n, 0.5, { ancla: 'end' }));
  }
  s.push(t(11.7, 5.5, 'pasillo de operación', 0.4, { ancla: 'middle', color: C.suave, peso: 400 }));
  s.push(t(11.7, 9.1, 'pasillo de operación', 0.4, { ancla: 'middle', color: C.suave, peso: 400 }));

  // Tablero general y tablero de servicios auxiliares (de él sale la alimentación de CCTV).
  s.push(r(21, 3.2, 3.2, 1.4, '#e6dccb', C.tableroBorde, 0.06));
  s.push(t(22.6, 5.3, 'TABLERO GENERAL', 0.45, { ancla: 'middle' }));
  s.push(r(21, 6.8, 2, 1.2, '#e6dccb', C.tableroBorde, 0.06));
  s.push(t(22, 8.6, 'SERV. AUXILIARES', 0.4, { ancla: 'middle' }));

  // Gabinete de comunicaciones (switch) y UPS.
  s.push(r(25.4, 6.8, 1.2, 1.4, C.gabinete, C.tableroBorde, 0.06));
  s.push(t(26, 8.8, 'GAB. COMUNIC.', 0.4, { ancla: 'middle' }));
  s.push(r(25.4, 10.4, 1.6, 1.2, '#d6dde0', C.tableroBorde, 0.06));
  s.push(t(26.2, 12.2, 'UPS', 0.45, { ancla: 'middle' }));

  // Bandeja de cables (referencial).
  s.push(`<path d="M${p(2)} ${p(2.7)} L${p(27.5)} ${p(2.7)} L${p(27.5)} ${p(12.5)}" stroke="${C.bandeja}" stroke-width="${p(0.12)}" fill="none" stroke-dasharray="${p(0.4)} ${p(0.2)}"/>`);
  s.push(t(2.2, 2.55, 'BANDEJA (REFERENCIAL)', 0.35, { color: C.bandeja }));

  // Rótulo.
  s.push(r(19.6, 12.2, 5.4, 2.4, '#ffffff', C.muro, 0.05));
  s.push(t(19.8, 12.9, 'SGIT-CCTV · PLANO DE DEMOSTRACIÓN', 0.35));
  s.push(t(19.8, 13.5, rotulo, 0.4));
  s.push(t(19.8, 14.0, 'Escala: 1 m = 40 px · NO ES LA PLANTA REAL', 0.3, { peso: 400, color: C.rojo }));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO_SALA}" height="${ALTO_SALA}" viewBox="0 0 ${ANCHO_SALA} ${ALTO_SALA}">\n${s.join('\n')}\n</svg>`;
}

export type SitioSala = { xm: number; ym: number; alturaM?: number; rumbo?: number; alcanceM?: number };

/** Los equipos de la sala (todos DEMO-, los borra `demo:borrar`). */
export const EQUIPOS_SALA_T2: { codigo: string; tipo: 'CAMERA' | 'SWITCH' | 'UPS' | 'TABLERO_ELECTRICO'; lugar: string;
  estado: 'OPERATIVO' | 'MANTENIMIENTO' | 'FUERA_SERVICIO'; sitio: SitioSala }[] = [
  { codigo: 'DEMO-CAM-T2-SE1', tipo: 'CAMERA', lugar: 'Sala eléctrica, pasillo CCM-1/CCM-2 (ejemplo)', estado: 'OPERATIVO', sitio: { xm: 2.2, ym: 6, alturaM: 3, rumbo: 0, alcanceM: 9 } },
  { codigo: 'DEMO-CAM-T2-SE2', tipo: 'CAMERA', lugar: 'Sala eléctrica, pasillo CCM-2/CCM-3 (ejemplo)', estado: 'MANTENIMIENTO', sitio: { xm: 19.5, ym: 9.4, alturaM: 3, rumbo: 180, alcanceM: 9 } },
  { codigo: 'DEMO-SW-T2-SE', tipo: 'SWITCH', lugar: 'Gabinete de comunicaciones de la sala (ejemplo)', estado: 'OPERATIVO', sitio: { xm: 26, ym: 7.5, alturaM: 1.5 } },
  { codigo: 'DEMO-UPS-T2-SE', tipo: 'UPS', lugar: 'UPS de la sala eléctrica (ejemplo)', estado: 'OPERATIVO', sitio: { xm: 26.2, ym: 11, alturaM: 0.5 } },
];
export const enPxSala = (s: SitioSala) => ({ x: p(s.xm), y: p(s.ym) });
