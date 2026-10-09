import { aTrenDePlanta, filtroDeTrenDePlanta, TRENES_ACEPTADOS } from '../src/common/tren-de-planta';

/** Bloque 172 · el desplegable mandaba «T1» y la base guarda el enum TREN_1: no se podía apuntar ninguna parada. */
describe('tren de planta · lo que manda el desplegable vs. lo que guarda la base', () => {
  it('todas las formas de decir «Tren 1» acaban en TREN_1', () => {
    for (const v of ['T1', 't1', 'TREN_1', 'AASA-PISCO-T1', 'Tren 1', 'Tren 1 (Laminación)']) {
      expect(aTrenDePlanta(v)).toBe('TREN_1');
    }
    expect(aTrenDePlanta('T3')).toBe('TREN_3');
  });

  it('oficinas → planta general; patio → patio', () => {
    expect(aTrenDePlanta('Oficinas')).toBe('PLANTA_GENERAL');
    expect(aTrenDePlanta('AASA-PISCO-OFI')).toBe('PLANTA_GENERAL');
    expect(aTrenDePlanta('PLANTA_GENERAL')).toBe('PLANTA_GENERAL');
    expect(aTrenDePlanta('Patio de palanquillas')).toBe('PATIO');
  });

  it('vacío es «sin tren» y ausente es «no tocar»', () => {
    expect(aTrenDePlanta('')).toBeNull();
    expect(aTrenDePlanta(null)).toBeNull();
    expect(aTrenDePlanta(undefined)).toBeUndefined();
  });

  it('lo que no es un tren se rechaza diciendo qué vale; en un filtro se ignora', () => {
    expect(() => aTrenDePlanta('T9')).toThrow(/Tren 1, Tren 2, Tren 3/);
    expect(() => aTrenDePlanta('GRU')).toThrow();
    expect(filtroDeTrenDePlanta('GRU')).toBeUndefined();
    expect(filtroDeTrenDePlanta('T2')).toBe('TREN_2');
  });

  it('los DTO aceptan el enum y la forma corta, y nada que la base no guarde', () => {
    for (const v of TRENES_ACEPTADOS) expect(() => aTrenDePlanta(v)).not.toThrow();
  });
});

import * as fs from 'fs';
import * as path from 'path';
import { TRENES_DE_PLANTA } from '../src/common/tren-de-planta';

describe('tren de planta · el desplegable ofrece EXACTAMENTE lo que la base guarda', () => {
  it('frontend/src/ubicaciones.tsx (TRENES_DE_PLANTA) = enum PlantTrain del backend', () => {
    const front = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', 'ubicaciones.tsx'), 'utf8');
    const bloque = front.slice(front.indexOf('export const TRENES_DE_PLANTA'), front.indexOf('];', front.indexOf('export const TRENES_DE_PLANTA')));
    const enFront = [...bloque.matchAll(/valor:\s*'([A-Z_0-9]+)'/g)].map((m) => m[1]);
    expect(enFront.sort()).toEqual([...TRENES_DE_PLANTA].sort());
    const schema = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
    const e = schema.slice(schema.indexOf('enum PlantTrain'), schema.indexOf('}', schema.indexOf('enum PlantTrain')));
    const enBase = [...e.matchAll(/^\s+([A-Z_0-9]+)\b/gm)].map((m) => m[1]);
    expect(enBase.sort()).toEqual([...TRENES_DE_PLANTA].sort());
  });
});
