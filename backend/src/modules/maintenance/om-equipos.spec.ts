import { equiposDeLaOrden, contar, frase } from './om-equipos';

const r = (assetId: string) => ({ assetId, papel: 'REPORTADO' as const });
const i = (assetId: string) => ({ assetId, papel: 'INTERVENIDO' as const });

describe('equiposDeLaOrden', () => {
  it('sin filas no revienta y no inventa nada', () => {
    const e = equiposDeLaOrden([]);
    expect(e.cuantosEquipos).toBe(0);
    expect(e.cambioDeAlcance).toBe(false);
  });

  it('lo normal: se reporta uno y se toca el mismo', () => {
    const e = equiposDeLaOrden([r('A'), i('A')]);
    expect(e.reportados).toEqual(['A']);
    expect(e.intervenidos).toEqual(['A']);
    expect(e.cambioDeAlcance).toBe(false);
    expect(e.cuantosEquipos).toBe(1);
  });

  /* LOS DOS CASOS QUE EL BOOLEANO `scopeChanged` NO DISTINGUÍA. */
  it('se reportó la cámara y se tocó el switch: lo reportado QUEDA SIN TOCAR', () => {
    const e = equiposDeLaOrden([r('CAM'), i('SW')]);
    expect(e.cambioDeAlcance).toBe(true);
    expect(e.reportadosSinTocar).toEqual(['CAM']);
    expect(e.intervenidosNoReportados).toEqual(['SW']);
  });

  it('se tocó lo reportado Y ADEMÁS otra cosa: no queda nada pendiente', () => {
    const e = equiposDeLaOrden([r('CAM'), i('CAM'), i('SW')]);
    expect(e.cambioDeAlcance).toBe(true);
    expect(e.reportadosSinTocar).toEqual([]);      // <- la diferencia que importa
    expect(e.intervenidosNoReportados).toEqual(['SW']);
  });

  it('una campaña de mapeo: doce equipos intervenidos, ninguno reportado', () => {
    const filas = Array.from({ length: 12 }, (_, n) => i(`CAM-${n}`));
    const e = equiposDeLaOrden(filas);
    expect(e.intervenidos).toHaveLength(12);
    expect(e.cuantosEquipos).toBe(12);
  });

  it('un equipo repetido con el mismo papel no se cuenta dos veces', () => {
    const e = equiposDeLaOrden([i('A'), i('A'), i('A')]);
    expect(e.intervenidos).toEqual(['A']);
  });

  it('una fila sin equipo se ignora en vez de romper la cuenta', () => {
    const e = equiposDeLaOrden([{ assetId: '', papel: 'INTERVENIDO' }, i('A')]);
    expect(e.intervenidos).toEqual(['A']);
  });
});

describe('contar — la cifra que iba mal al comité', () => {
  it('una campaña de mapeo deja de contar como una sola intervención', () => {
    const c = contar([
      { id: 'OM1', equipos: Array.from({ length: 12 }, (_, n) => i(`CAM-${n}`)) },
    ]);
    expect(c.ordenes).toBe(1);
    expect(c.intervenciones).toBe(12);   // antes: 1
    expect(c.equiposPorOrden).toBe(12);
  });

  /* Lo REPORTADO no es trabajo: si se reportó la cámara y se tocó el switch,
     la intervención es una, no dos. */
  it('lo reportado no cuenta como intervención', () => {
    const c = contar([{ id: 'OM1', equipos: [r('CAM'), i('SW')] }]);
    expect(c.intervenciones).toBe(1);
    expect(c.equiposDistintos).toBe(1);
  });

  it('el mismo equipo en dos órdenes son dos intervenciones y un equipo', () => {
    const c = contar([
      { id: 'OM1', equipos: [i('CAM-7')] },
      { id: 'OM2', equipos: [i('CAM-7')] },
    ]);
    expect(c.intervenciones).toBe(2);
    expect(c.equiposDistintos).toBe(1);
  });

  it('el mismo equipo repetido DENTRO de una orden cuenta una vez', () => {
    const c = contar([{ id: 'OM1', equipos: [i('CAM-7'), i('CAM-7')] }]);
    expect(c.intervenciones).toBe(1);
  });

  /* Un NaN en un tablero que va a una reunión es peor que una casilla vacía,
     porque parece un número. */
  it('sin órdenes la media es 0, nunca NaN', () => {
    const c = contar([]);
    expect(c.equiposPorOrden).toBe(0);
    expect(Number.isNaN(c.equiposPorOrden)).toBe(false);
  });

  it('una orden sin equipos apuntados no rompe nada', () => {
    const c = contar([{ id: 'OM1' }]);
    expect(c.ordenes).toBe(1);
    expect(c.intervenciones).toBe(0);
  });
});

describe('frase', () => {
  it('cuando cada orden tocó un equipo, no marea con dos cifras', () => {
    expect(frase(contar([{ id: 'A', equipos: [i('1')] }]))).toContain('un equipo cada una');
  });

  it('cuando difieren, enseña LAS DOS: gestión y trabajo', () => {
    const f = frase(contar([{ id: 'A', equipos: [i('1'), i('2'), i('3')] }]));
    expect(f).toContain('1 órdenes');
    expect(f).toContain('3 equipos');
  });

  it('sin órdenes lo dice en vez de enseñar ceros', () => {
    expect(frase(contar([]))).toBe('Sin órdenes en el periodo.');
  });
});
