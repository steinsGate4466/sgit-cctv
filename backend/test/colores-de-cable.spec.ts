import {
  colorEsperado, revisarColor, resumirColores, COLORES, TramoParaRevisar,
} from '../src/common/colores-de-cable';

/**
 * PRUEBAS DEL COLOR DE CABLE — bloque 45.
 *
 * La prueba que da sentido a todo el archivo es la de la cadena de la antena:
 * ANTENA ──amarillo──► FUENTE ──azul──► SWITCH. Es la que costó dos intentos
 * entender y la que demuestra que el color se deduce de los DOS extremos.
 */

const t = (x: Partial<TramoParaRevisar> = {}): TramoParaRevisar => ({ ...x });
const color = (x: Partial<TramoParaRevisar>) => colorEsperado(t(x)).color;

describe('la cadena real de una antena PMP', () => {
  it('ANTENA ↔ FUENTE es AMARILLO: ese tramo lleva 24 V', () => {
    expect(color({ tipoA: 'WIRELESS', tipoB: 'PSU' })).toBe('AMARILLO');
    expect(color({ tipoA: 'PSU', tipoB: 'WIRELESS' })).toBe('AMARILLO');
  });

  it('FUENTE ↔ SWITCH es AZUL: sale del puerto LAN, es red pura', () => {
    /* Éste es el que estaba mal. Pintar toda la cadena de amarillo habría
       hecho creer que hay tensión donde no la hay. */
    expect(color({ tipoA: 'PSU', tipoB: 'SWITCH' })).toBe('AZUL');
  });

  it('el motivo explica POR QUÉ, no sólo cuál', () => {
    expect(colorEsperado(t({ tipoA: 'PSU', tipoB: 'SWITCH' })).motivo)
      .toContain('sin tensión');
    expect(colorEsperado(t({ tipoA: 'WIRELESS', tipoB: 'PSU' })).motivo)
      .toContain('24 V');
  });
});

describe('CCTV manda sobre la alimentación', () => {
  it('una cámara PoE va VERDE, no amarilla — decisión de planta', () => {
    expect(color({ tipoA: 'CAMERA', tipoB: 'SWITCH' })).toBe('VERDE');
    // Incluso si pasa por una fuente: sigue siendo CCTV.
    expect(color({ tipoA: 'CAMERA', tipoB: 'PSU' })).toBe('VERDE');
  });

  it('y gana también sobre el troncal', () => {
    expect(color({ tipoA: 'CAMERA', tipoB: 'SWITCH', esTroncal: true })).toBe('VERDE');
  });
});

describe('el resto del esquema', () => {
  it('troncal entre salas es NARANJA', () => {
    expect(color({ tipoA: 'SWITCH', tipoB: 'SWITCH', esTroncal: true })).toBe('NARANJA');
  });
  it('equipos dentro del rack, NEGRO', () => {
    expect(color({ tipoA: 'SWITCH', tipoB: 'NVR' })).toBe('NEGRO');
  });
  it('a un puesto cableado, AZUL', () => {
    expect(color({ tipoA: 'SWITCH', tipoB: 'PC' })).toBe('AZUL');
  });
  it('telefonía, BLANCO', () => {
    expect(color({ tipoA: 'SWITCH', tipoB: 'PHONE' })).toBe('BLANCO');
  });
  it('sin los dos extremos NO se inventa un color', () => {
    // Devolver uno «razonable» sería justo lo que este proyecto prohíbe.
    expect(color({ tipoA: 'SWITCH' })).toBeNull();
    expect(color({})).toBeNull();
  });
});

describe('revisarColor · enseña la discrepancia, no la corrige', () => {
  it('coincide: no dice nada', () => {
    const v = revisarColor(t({ tipoA: 'CAMERA', tipoB: 'SWITCH', colorDeclarado: 'VERDE' }));
    expect(v.coincide).toBe(true);
    expect(v.aviso).toBeNull();
  });

  it('NO coincide: lo dice con el porqué, y NO cambia el dato', () => {
    const v = revisarColor(t({
      tipoA: 'CAMERA', tipoB: 'SWITCH', colorDeclarado: 'AMARILLO', etiqueta: 'AA-CAM-T1-COL-004',
    }));
    expect(v.coincide).toBe(false);
    expect(v.declarado).toBe('AMARILLO');   // se respeta lo declarado
    expect(v.esperado).toBe('VERDE');
    expect(v.aviso).toContain('AA-CAM-T1-COL-004');
    expect(v.aviso).toContain('o el rótulo o el cable');
  });

  it('sin declarar NO es lo mismo que estar mal', () => {
    const v = revisarColor(t({ tipoA: 'CAMERA', tipoB: 'SWITCH' }));
    expect(v.sinDeclarar).toBe(true);
    expect(v.coincide).toBe(false);
    // Y propone, con el motivo delante.
    expect(v.aviso).toContain('VERDE');
  });

  it('si no se puede deducir el esperado, lo declarado se da por bueno', () => {
    const v = revisarColor(t({ tipoA: 'SWITCH', colorDeclarado: 'AZUL' }));
    expect(v.coincide).toBe(true);
  });
});

describe('el resumen por tren', () => {
  const ok = (c: any, a = 'CAMERA', b = 'SWITCH') =>
    revisarColor(t({ tipoA: a, tipoB: b, colorDeclarado: c }));

  it('cuenta correctos, discrepantes y sin declarar', () => {
    const r = resumirColores([
      ok('VERDE'), ok('VERDE'), ok('AMARILLO'),
      revisarColor(t({ tipoA: 'CAMERA', tipoB: 'SWITCH' })),
    ]);
    expect(r.correctos).toBe(2);
    expect(r.discrepantes).toBe(1);
    expect(r.sinDeclarar).toBe(1);
  });

  it('sólo lista los colores que EXISTEN en el tren', () => {
    const r = resumirColores([ok('VERDE'), ok('VERDE')]);
    expect(r.porColor).toHaveLength(1);
    expect(r.porColor[0].tramos).toBe(2);
  });

  it('el titular avisa primero de lo que está mal', () => {
    expect(resumirColores([ok('AMARILLO')]).titular).toContain('no corresponde');
    expect(resumirColores([revisarColor(t({ tipoA: 'CAMERA', tipoB: 'SWITCH' }))]).titular)
      .toContain('no tiene color declarado');
    expect(resumirColores([ok('VERDE')]).titular).toContain('siguen el estándar');
    expect(resumirColores([]).titular).toContain('Todavía no hay tramos');
  });
});

describe('el catálogo', () => {
  it('son los seis del estándar de la planta, sin repetidos', () => {
    expect(COLORES).toHaveLength(6);
    expect(new Set(COLORES.map((c) => c.color)).size).toBe(6);
  });
  it('cada uno explica POR QUÉ se separa: la leyenda sale de aquí', () => {
    for (const c of COLORES) expect(c.porQue.length).toBeGreaterThan(20);
  });
});
