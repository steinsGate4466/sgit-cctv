import { descendientes, raicesDelAmbito, NodoUbicacion } from '../src/common/ambito-planta';

// Árbol de prueba, parecido al real:
//   PLANTA
//     T1 (TREN, code AASA-T1)
//       E1 (ETAPA, stage=desbaste)  -> R1 (RACK)
//       E2 (ETAPA, stage=colada)
//     T2 (TREN, code AASA-T2)
//       E3 (ETAPA, stage=desbaste)
const arbol: NodoUbicacion[] = [
  { id: 'P',  parentId: null, type: 'PLANTA', code: 'P' },
  { id: 'T1', parentId: 'P',  type: 'TREN',   code: 'AASA-T1' },
  { id: 'E1', parentId: 'T1', type: 'ETAPA',  code: 'T1-DESB', stageId: 'desbaste' },
  { id: 'R1', parentId: 'E1', type: 'RACK',   code: 'T1-R01' },
  { id: 'E2', parentId: 'T1', type: 'ETAPA',  code: 'T1-COL',  stageId: 'colada' },
  { id: 'T2', parentId: 'P',  type: 'TREN',   code: 'AASA-T2' },
  { id: 'E3', parentId: 'T2', type: 'ETAPA',  code: 'T2-DESB', stageId: 'desbaste' },
];
const porCodigo = new Map([['DESBASTE', 'desbaste'], ['COLADA', 'colada']]);

describe('descendientes', () => {
  it('incluye la raíz y todo lo que cuelga de ella', () => {
    expect(descendientes(arbol, ['T1'])).toEqual(new Set(['T1', 'E1', 'R1', 'E2']));
  });
  it('no se lleva lo de otro tren', () => {
    expect(descendientes(arbol, ['T1']).has('E3')).toBe(false);
  });
  it('una hoja se devuelve sola', () => {
    expect(descendientes(arbol, ['R1'])).toEqual(new Set(['R1']));
  });
  it('sin raíces devuelve vacío', () => {
    expect(descendientes(arbol, []).size).toBe(0);
  });
  it('un ciclo NO cuelga el servidor', () => {
    // A es hijo de B y B es hijo de A: dato imposible, pero lo escriben personas.
    const ciclo: NodoUbicacion[] = [
      { id: 'A', parentId: 'B', type: 'ZONA', code: 'A' },
      { id: 'B', parentId: 'A', type: 'ZONA', code: 'B' },
    ];
    const r = descendientes(ciclo, ['A']);
    expect(r.has('A')).toBe(true);
    expect(r.size).toBeLessThanOrEqual(2);
  });
});

describe('raicesDelAmbito', () => {
  it('sin tren ni etapa devuelve null: no hay filtro', () => {
    expect(raicesDelAmbito(arbol, {})).toBeNull();
  });
  it('solo tren devuelve el nodo del tren', () => {
    expect(raicesDelAmbito(arbol, { tren: 'AASA-T1' })).toEqual(['T1']);
  });
  it('un tren que no existe devuelve lista vacía, no la planta entera', () => {
    expect(raicesDelAmbito(arbol, { tren: 'AASA-T9' })).toEqual([]);
  });
  it('solo etapa devuelve TODAS sus instancias, en los trenes que sea', () => {
    const r = raicesDelAmbito(arbol, { etapa: 'DESBASTE' }, porCodigo);
    expect(new Set(r!)).toEqual(new Set(['E1', 'E3']));
  });
  it('tren + etapa acota a la instancia de ESE tren', () => {
    // Es el caso que justifica el cruce: la misma etapa existe en los tres
    // trenes, y sin acotar se mezclarían.
    expect(raicesDelAmbito(arbol, { tren: 'AASA-T1', etapa: 'DESBASTE' }, porCodigo)).toEqual(['E1']);
    expect(raicesDelAmbito(arbol, { tren: 'AASA-T2', etapa: 'DESBASTE' }, porCodigo)).toEqual(['E3']);
  });
  it('etapa que no existe en ese tren devuelve vacío', () => {
    expect(raicesDelAmbito(arbol, { tren: 'AASA-T2', etapa: 'COLADA' }, porCodigo)).toEqual([]);
  });
  it('etapa desconocida devuelve vacío, no todo', () => {
    expect(raicesDelAmbito(arbol, { etapa: 'NO_EXISTE' }, porCodigo)).toEqual([]);
  });
});

describe('el filtro completo (raíces + descendientes)', () => {
  it('filtrar por Tren 1 incluye el rack que cuelga de su etapa', () => {
    const raices = raicesDelAmbito(arbol, { tren: 'AASA-T1' })!;
    expect(descendientes(arbol, raices).has('R1')).toBe(true);
  });
  it('filtrar por etapa Desbaste del Tren 1 incluye su rack y excluye el Tren 2', () => {
    const raices = raicesDelAmbito(arbol, { tren: 'AASA-T1', etapa: 'DESBASTE' }, porCodigo)!;
    const dentro = descendientes(arbol, raices);
    expect(dentro.has('R1')).toBe(true);
    expect(dentro.has('E3')).toBe(false);
    expect(dentro.has('E2')).toBe(false);
  });
});
