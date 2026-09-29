/* Bloque 165 · «ver por zonas: sala eléctrica y así, en todos lados y para el Tren 2». */
import { cajaDeZona, dentroDeZona, estadoDeZona, rotuloDeZona, validarZona } from '../src/modules/planos/geometria';

describe('zonas del plano', () => {
  const sala: [number, number][] = [[1060, 1190], [1500, 1190], [1500, 1430], [1060, 1430]];

  it('un equipo dentro de la sala es de la sala; uno fuera, no', () => {
    expect(dentroDeZona(1280, 1300, sala)).toBe(true);
    expect(dentroDeZona(1600, 1300, sala)).toBe(false);
    expect(dentroDeZona(1280, 1000, sala)).toBe(false);
  });

  it('funciona con polígonos en L (una nave con un entrante)', () => {
    const L: [number, number][] = [[0, 0], [100, 0], [100, 40], [40, 40], [40, 100], [0, 100]];
    expect(dentroDeZona(20, 80, L)).toBe(true);
    expect(dentroDeZona(80, 80, L)).toBe(false); // el entrante
  });

  it('valida lo que se dibuja: mínimo 3 puntos, dentro del plano y con área', () => {
    expect(validarZona([[0, 0], [10, 10]], 100, 100)).toEqual({ error: expect.stringMatching(/3 puntos/) });
    expect(validarZona([[0, 0], [200, 0], [0, 50]], 100, 100)).toEqual({ error: expect.stringMatching(/fuera del plano/) });
    expect(validarZona([[0, 0], [50, 50], [100, 100]], 100, 100)).toEqual({ error: expect.stringMatching(/pequeña|línea/) });
    expect(validarZona([[0.4, 0], [90.6, 0], [90, 80]], 100, 100)).toEqual({ puntos: [[0, 0], [91, 0], [90, 80]] });
    expect(validarZona('no', 100, 100)).toHaveProperty('error');
  });

  it('la caja encuadra la zona y da su centro para el rótulo', () => {
    expect(cajaDeZona(sala)).toEqual({ x: 1060, y: 1190, w: 440, h: 240, cx: 1280, cy: 1310 });
  });

  it('el nombre de una zona con muesca no cae en la muesca (encima de otra zona)', () => {
    const linea: [number, number][] = [[1060, 200], [3520, 200], [3520, 750], [1860, 750], [1860, 500], [1580, 500], [1580, 750], [1060, 750]];
    const r = rotuloDeZona(linea);
    expect(dentroDeZona(r.x, r.y, linea)).toBe(true);
    const c = cajaDeZona(linea);
    expect(dentroDeZona(c.cx, c.cy, linea)).toBe(true); // aquí la caja también vale…
    const u: [number, number][] = [[0, 0], [100, 0], [100, 100], [70, 100], [70, 20], [30, 20], [30, 100], [0, 100]];
    const cu = cajaDeZona(u);
    expect(dentroDeZona(cu.cx, cu.cy, u)).toBe(false); // …pero en una U el centro de la caja cae fuera
    const ru = rotuloDeZona(u);
    expect(dentroDeZona(ru.x, ru.y, u)).toBe(true);
  });

  it('la zona toma el color de su PEOR equipo; sin equipos es «vacia», no verde', () => {
    expect(estadoDeZona({ ok: 10, alerta: 0, caida: 1, sindato: 0 })).toBe('caida');
    expect(estadoDeZona({ ok: 3, alerta: 1, caida: 0, sindato: 2 })).toBe('alerta');
    expect(estadoDeZona({ ok: 3, alerta: 0, caida: 0, sindato: 1 })).toBe('sindato');
    expect(estadoDeZona({ ok: 4, alerta: 0, caida: 0, sindato: 0 })).toBe('ok');
    expect(estadoDeZona({ ok: 0, alerta: 0, caida: 0, sindato: 0 })).toBe('vacia');
  });
});
