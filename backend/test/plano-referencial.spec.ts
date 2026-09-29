/**
 * Bloque 156 · Plano referencial del tren y su púlpito (demo).
 *
 * Lo que no puede romperse: que el dibujo diga que NO es la planta real, que
 * sea un SVG limpio (el servidor rechaza scripts y enlaces externos) y que cada
 * equipo de demo caiga dentro del plano, con su cámara del tren creada.
 */
import {
  ANCHO, ALTO, M_POR_PX, ANCHO_M, ALTO_M, SITIOS_M, CAMARAS_DEL_TREN, enPx, svgTrenYPulpito,
} from '../prisma/plano-tren-referencial';

describe('Plano referencial del tren y su púlpito', () => {
  const svg = svgTrenYPulpito();

  it('dice dos veces que no es la planta real', () => {
    expect(svg.match(/NO ES LA PLANTA REAL/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('es un SVG limpio y del tamaño declarado', () => {
    expect(svg).not.toMatch(/<script|\son\w+=|href=|<foreignObject/i);
    expect(svg).toContain(`viewBox="0 0 ${ANCHO} ${ALTO}"`);
    expect(ANCHO * M_POR_PX).toBe(ANCHO_M);
    expect(ALTO * M_POR_PX).toBe(ALTO_M);
  });

  it('trae el tren completo y los tres púlpitos', () => {
    for (const pieza of ['HORNO DE', 'TREN DESBASTADOR', 'TREN INTERMEDIO', 'TREN ACABADOR',
      'LECHO DE ENFRIAMIENTO', 'CIZALLA EN FRÍO', 'PÚLPITO DE CONTROL', 'PÚLPITO DEL HORNO', 'PÚLPITO DEL LECHO']) {
      expect(svg).toContain(pieza);
    }
  });

  it('cada equipo de demo cae dentro del plano', () => {
    for (const [codigo, s] of Object.entries(SITIOS_M)) {
      const { x, y } = enPx(s);
      expect({ codigo, dentro: x >= 0 && x <= ANCHO && y >= 0 && y <= ALTO }).toEqual({ codigo, dentro: true });
      if (s.rumbo != null) expect(s.alcanceM).toBeGreaterThan(0);
    }
  });

  it('cada cámara del tren tiene sitio y prefijo DEMO- (la borra demo:borrar)', () => {
    for (const c of CAMARAS_DEL_TREN) {
      expect(c.codigo.startsWith('DEMO-')).toBe(true);
      expect(SITIOS_M[c.codigo]).toBeDefined();
      expect(c.lugar).toMatch(/ejemplo/);
    }
  });
});
