/**
 * Bloque 160 · el ámbito guardado con SIGLA («T1») tiene que ver su tren.
 * Antes el filtro del árbol comparaba `code === 'T1'` contra «AASA-PISCO-T1»
 * y el operador con su tren bien asignado no veía nada.
 */
import { descendientes, mismoTren, raicesDelAmbito } from '../src/common/ambito-planta';
import { cruzarAmbito } from '../src/common/ambito-usuario';

const nodos = [
  { id: 'p', parentId: null, type: 'PLANTA', code: 'AASA-PISCO' },
  { id: 't1', parentId: 'p', type: 'TREN', code: 'AASA-PISCO-T1', siglaTren: 'T1' },
  { id: 't2', parentId: 'p', type: 'TREN', code: 'AASA-PISCO-T2', siglaTren: 'T2' },
  { id: 'z1', parentId: 't1', type: 'ZONA', code: 'Z1' },
];

describe('Ámbito por sigla, código o sufijo', () => {
  it('«T1», «t1» y «AASA-PISCO-T1» nombran el mismo tren', () => {
    expect(mismoTren('T1', 'AASA-PISCO-T1', 'T1')).toBe(true);
    expect(mismoTren('t1', 'AASA-PISCO-T1')).toBe(true);
    expect(mismoTren('AASA-PISCO-T1', 'AASA-PISCO-T1')).toBe(true);
    expect(mismoTren('T2', 'AASA-PISCO-T1', 'T1')).toBe(false);
    expect(mismoTren('', 'AASA-PISCO-T1')).toBe(false);
  });

  it('el árbol de un ámbito «T1» es el Tren 1 con lo que cuelga de él', () => {
    const raices = raicesDelAmbito(nodos as any, { tren: 'T1' });
    expect(raices).toEqual(['t1']);
    expect([...descendientes(nodos as any, raices!)].sort()).toEqual(['t1', 'z1']);
  });

  it('pedir el código con permiso por sigla no deja la pantalla vacía', () => {
    expect(cruzarAmbito('AASA-PISCO-T1', ['T1'])).toBe('AASA-PISCO-T1');
    expect(cruzarAmbito('AASA-PISCO-T2', ['T1'])).toBe('NADA');
  });
});
