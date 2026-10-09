import { haceCirculo, puedeColgarDe, exigirPadreValido } from '../src/common/jerarquia-ubicaciones';

/** Bloque 172 · «Pertenece a» ofrecía cualquier ubicación, también una hija (círculo). */
describe('jerarquía de ubicaciones', () => {
  it('el padre tiene que ser de nivel mayor', () => {
    expect(puedeColgarDe('TREN', 'PLANTA')).toBe(true);
    expect(puedeColgarDe('SALA', 'TREN')).toBe(true);
    expect(puedeColgarDe('SALA', 'AREA')).toBe(true);
    expect(puedeColgarDe('TREN', 'SALA')).toBe(false);
    expect(puedeColgarDe('AREA', 'AREA')).toBe(false);
    expect(() => exigirPadreValido('TREN', 'SALA')).toThrow(/no puede colgar de una sala/);
  });

  it('elegir como padre a una hija o nieta hace un círculo', () => {
    const padreDe = new Map<string, string | null>([['planta', null], ['t1', 'planta'], ['sala', 't1'], ['zona', 'sala']]);
    expect(haceCirculo('t1', 'zona', padreDe)).toBe(true);
    expect(haceCirculo('t1', 't1', padreDe)).toBe(true);
    expect(haceCirculo('sala', 'planta', padreDe)).toBe(false);
  });
});
