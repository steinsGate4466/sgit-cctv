/* =============================================================================
   COBERTURA — qué lee primero el jefe de línea (bloque 27)
   -----------------------------------------------------------------------------
   El orden de esta pantalla ES la funcionalidad. Si una zona vital sin vista
   no sale arriba, la pantalla existe y no sirve para nada.
============================================================================= */
import {
  ordenarZonas, pesoDeUrgencia, titularDeCobertura, porcentajeCobertura,
} from '../src/modules/zonas/cobertura-orden';

const z = (nombre: string, o: any = {}) => ({
  nombre, zonaVital: false, camaras: 4, viendo: 4, ciegas: 0, dudosas: 0, ...o,
});

describe('orden: primero lo que duele', () => {
  it('una zona vital sin vista va antes que todo lo demás', () => {
    const r = ordenarZonas([
      z('Estacionamiento', { ciegas: 5, viendo: 0, camaras: 5 }),
      z('Salida del horno', { zonaVital: true, ciegas: 1, viendo: 2, camaras: 3 }),
      z('Púlpito', {}),
    ]);
    expect(r[0].nombre).toBe('Salida del horno');
  });

  it('con dos vitales ciegas, gana la que tiene más cámaras caídas', () => {
    const r = ordenarZonas([
      z('Foso', { zonaVital: true, ciegas: 1, viendo: 3, camaras: 4 }),
      z('Colada', { zonaVital: true, ciegas: 3, viendo: 1, camaras: 4 }),
    ]);
    expect(r[0].nombre).toBe('Colada');
  });

  it('una zona vital que aún ve NO se cuela por encima de un hueco real', () => {
    const r = ordenarZonas([
      z('Vital con incidencia', { zonaVital: true, dudosas: 2 }),
      z('Cualquiera sin vista', { ciegas: 1, viendo: 3 }),
    ]);
    expect(r[0].nombre).toBe('Cualquiera sin vista');
  });

  it('lo que está entero va al final', () => {
    const r = ordenarZonas([z('Entera'), z('Rota', { ciegas: 1, viendo: 3 })]);
    expect(r[r.length - 1].nombre).toBe('Entera');
  });

  it('a igualdad de urgencia se ordena por nombre, no al azar', () => {
    const r = ordenarZonas([z('Zeta'), z('Alfa'), z('Media')]);
    expect(r.map((x) => x.nombre)).toEqual(['Alfa', 'Media', 'Zeta']);
  });

  it('los cinco pesos están bien repartidos', () => {
    expect(pesoDeUrgencia(z('a', { zonaVital: true, ciegas: 1 }))).toBe(0);
    expect(pesoDeUrgencia(z('a', { ciegas: 1 }))).toBe(1);
    expect(pesoDeUrgencia(z('a', { zonaVital: true, dudosas: 1 }))).toBe(2);
    expect(pesoDeUrgencia(z('a', { dudosas: 1 }))).toBe(3);
    expect(pesoDeUrgencia(z('a'))).toBe(4);
  });
});

describe('el titular', () => {
  it('sin inventario no habla de porcentajes', () => {
    expect(titularDeCobertura(0, 0, 0)).toContain('No se puede medir');
  });
  it('lo primero que dice es la zona vital sin vista', () => {
    expect(titularDeCobertura(50, 40, 2)).toContain('2 zona(s)');
  });
  it('si no hay vitales afectadas, lo dice explícitamente', () => {
    expect(titularDeCobertura(50, 45, 0)).toContain('ninguna en zona vital');
  });
  it('todo bien se dice sin adornos', () => {
    expect(titularDeCobertura(50, 50, 0)).toBe('Todas las cámaras de tu ámbito están dando imagen.');
  });
});

describe('el porcentaje', () => {
  it('con inventario vacío es «sin datos», NO cero', () => {
    expect(porcentajeCobertura(0, 0)).toBeNull();
  });
  it('no inventa precisión: un decimal', () => {
    expect(porcentajeCobertura(3, 2)).toBe(66.7);
    expect(porcentajeCobertura(50, 45)).toBe(90);
  });
  it('todo viendo es 100, no 99.9', () => {
    expect(porcentajeCobertura(7, 7)).toBe(100);
  });
});
