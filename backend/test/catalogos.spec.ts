import {
  codigoDesdeNombre, agruparItems, motivoInvalido, TIPOS_CATALOGO, TIPO_ES,
} from '../src/modules/catalogos/catalogos.util';

/**
 * Los catálogos editables son la respuesta a un error que ya cometí: meter en
 * el código nombres que solo la gente de planta sabe. Estas pruebas fijan las
 * dos piezas que, si fallan, ensucian el catálogo para siempre sin que nadie
 * lo note hasta que hay doscientas filas.
 */

describe('codigoDesdeNombre', () => {
  it('quita acentos y pasa a mayúsculas', () => {
    expect(codigoDesdeNombre('Cable dañado')).toBe('CABLE_DANADO');
  });

  it('convierte los signos en separador, sin dejarlos pegados', () => {
    expect(codigoDesdeNombre('Cable dañado (cortado, aplastado)'))
      .toBe('CABLE_DANADO_CORTADO_APLASTADO');
  });

  it('no deja guiones al principio ni al final', () => {
    expect(codigoDesdeNombre('  ¡Fuente PoE!  ')).toBe('FUENTE_POE');
  });

  it('conserva los números', () => {
    expect(codigoDesdeNombre('Tramo mayor a 90 m')).toBe('TRAMO_MAYOR_A_90_M');
  });

  it('corta a 40 caracteres: un código largo no se lee', () => {
    const largo = codigoDesdeNombre('a'.repeat(80));
    expect(largo.length).toBe(40);
  });

  it('un nombre solo de signos no produce código', () => {
    expect(codigoDesdeNombre('¿¡...!?')).toBe('');
  });
});

describe('agruparItems', () => {
  const items = [
    { code: 'B', name: 'Bravo', group: 'Red', sequence: 2 },
    { code: 'A', name: 'Alfa', group: 'Red', sequence: 1 },
    { code: 'C', name: 'Charlie', group: 'Energía', sequence: 1 },
    { code: 'D', name: 'Delta', group: null, sequence: 1 },
  ];

  it('agrupa por familia', () => {
    const g = agruparItems(items as any);
    expect(g.map((x) => x.grupo)).toEqual(['Energía', 'Red', 'Otros']);
  });

  it('dentro de cada grupo respeta el orden declarado', () => {
    const red = agruparItems(items as any).find((g) => g.grupo === 'Red')!;
    expect(red.opciones.map((o) => o.name)).toEqual(['Alfa', 'Bravo']);
  });

  it('lo que no tiene familia va a "Otros", y "Otros" va al final', () => {
    // Esconderlo sería peor: una opción que no se ve es una opción que no
    // existe, y el técnico acabaría eligiendo cualquier otra.
    const g = agruparItems(items as any);
    expect(g[g.length - 1].grupo).toBe('Otros');
    expect(g[g.length - 1].opciones[0].name).toBe('Delta');
  });

  it('con el mismo orden, desempata por nombre', () => {
    const g = agruparItems([
      { code: 'Z', name: 'Zulu', group: 'X', sequence: 1 },
      { code: 'A', name: 'Alfa', group: 'X', sequence: 1 },
    ] as any);
    expect(g[0].opciones.map((o) => o.name)).toEqual(['Alfa', 'Zulu']);
  });

  it('lista vacía no revienta', () => {
    expect(agruparItems([])).toEqual([]);
  });
});

describe('motivoInvalido', () => {
  it('acepta lo normal', () => {
    expect(motivoInvalido({ name: 'Cable dañado' })).toBeNull();
  });

  it('exige nombre', () => {
    expect(motivoInvalido({ name: '   ' })).toMatch(/obligatorio/);
  });

  it('rechaza un nombre del que no sale ningún código', () => {
    expect(motivoInvalido({ name: '¿¡...!?' })).toMatch(/letras o números/);
  });

  it('rechaza un código con caracteres que no admite', () => {
    expect(motivoInvalido({ name: 'Algo', code: 'con-guion' })).toMatch(/mayúsculas/);
  });

  it('rechaza un nombre desmedido', () => {
    expect(motivoInvalido({ name: 'x'.repeat(200) })).toMatch(/demasiado largo/);
  });
});

describe('los cuatro tipos', () => {
  it('todos tienen etiqueta en castellano', () => {
    // Sin esto, la pantalla mostraría MOTIVO_AVANCE al usuario.
    for (const t of TIPOS_CATALOGO) expect(TIPO_ES[t]).toBeTruthy();
  });
});
