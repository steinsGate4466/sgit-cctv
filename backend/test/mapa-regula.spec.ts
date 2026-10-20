/* Bloque 176 · el mapa regula: zonas de riesgo, cableado y avisos de norma. */
import * as fs from 'fs';
import * as path from 'path';
import {
  TOPE_UTP_M, avisosDeNorma, largoPx, lineaPasaPorZona, nivelesEnPunto, recorrido, riesgosDeUbicacion, validarTrazado,
} from '../src/modules/planos/regulacion';
import { perfilDeSeguridad } from '../src/common/seguridad-del-trabajo';
import { PlanosService } from '../src/modules/planos/planos.service';

const cuadro = (x: number, y: number, w: number, h: number): [number, number][] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

describe('bloque 176 · geometría del cable', () => {
  it('sin trazado va en L (por bandeja), con trazado pasa por sus puntos', () => {
    expect(recorrido({ x: 0, y: 0 }, { x: 30, y: 40 }, null)).toEqual([[0, 0], [30, 0], [30, 40]]);
    expect(largoPx(recorrido({ x: 0, y: 0 }, { x: 30, y: 40 }, null))).toBe(70);
    expect(largoPx(recorrido({ x: 0, y: 0 }, { x: 30, y: 40 }, [[0, 40]]))).toBe(70);
    expect(largoPx([[0, 0], [30, 40]])).toBe(50);
  });
  it('detecta el cable que cruza un área aunque ningún quiebre caiga dentro', () => {
    const area = cuadro(40, -10, 20, 20);
    expect(lineaPasaPorZona([[0, 0], [100, 0]], area)).toBe(true);
    expect(lineaPasaPorZona([[0, 50], [100, 50]], area)).toBe(false);
  });
  it('el trazado se valida dentro del plano y con tope de puntos', () => {
    expect(validarTrazado([[10, 10]], 100, 100)).toEqual({ puntos: [[10, 10]] });
    expect('error' in validarTrazado([[500, 10]], 100, 100)).toBe(true);
    expect('error' in validarTrazado(Array.from({ length: 61 }, () => [1, 1]), 100, 100)).toBe(true);
    expect(validarTrazado([], 100, 100)).toEqual({ puntos: [] });
  });
});

describe('bloque 176 · riesgo', () => {
  it('lo que la ubicación ya declara sale como borde, con su porqué', () => {
    const r = riesgosDeUbicacion({ riesgoPersonas: true, riesgoPersonasMotivo: 'Paso de grúa', intervencionFirmada: 'CON_PERMISO_ELECTRICO', criticidadProduccion: 'CRITICA' });
    expect(r.map((x) => x.nivel)).toEqual(['ALTO_RIESGO', 'ELECTRICO', 'VITAL']);
    expect(r[0].porque).toBe('Paso de grúa');
    expect(riesgosDeUbicacion({})).toEqual([]);
    // Exige parada + riesgo para personas = UN alto riesgo, no dos.
    expect(riesgosDeUbicacion({ riesgoPersonas: true, intervencionFirmada: 'EXIGE_PARADA' })).toHaveLength(1);
  });
  it('un punto dentro de varias áreas recibe todos sus niveles, lo más grave primero', () => {
    const zonas = [{ nivel: 'VITAL' as const, puntos: cuadro(0, 0, 50, 50) }, { nivel: 'ALTO_RIESGO' as const, puntos: cuadro(10, 10, 10, 10) }];
    expect(nivelesEnPunto(15, 15, zonas)).toEqual(['ALTO_RIESGO', 'VITAL']);
    expect(nivelesEnPunto(40, 40, zonas)).toEqual(['VITAL']);
    expect(nivelesEnPunto(90, 90, zonas)).toEqual([]);
  });
  it('un área del mapa SUMA exigencias al abrir la orden, nunca las quita', () => {
    const base = perfilDeSeguridad({ intervencionAplica: 'EN_MARCHA', intervencionFirmada: true, alturaM: 1, medioAcceso: 'A_PIE' });
    expect(base.enAltura).toBe(false);
    const conMapa = perfilDeSeguridad({
      intervencionAplica: 'EN_MARCHA', intervencionFirmada: true, alturaM: 1, medioAcceso: 'A_PIE',
      zonasDeRiesgo: [
        { nivel: 'ALTO_RIESGO', nombre: 'Paso de grúa 2', motivo: 'carga suspendida sobre el pasillo' },
        { nivel: 'ELECTRICO', nombre: 'MCC 1', motivo: 'tableros energizados' },
      ],
    });
    const claves = conMapa.requisitos.map((r) => r.clave);
    expect(claves).toEqual(expect.arrayContaining(['ZONA_ALTO_RIESGO', 'BLOQUEO_LOTO', 'ACOMPANANTE']));
    expect(conMapa.personasMinimas).toBe(2);
    expect(conMapa.riesgos).toContain('Paso de grúa 2: carga suspendida sobre el pasillo');
    // Lo que el perfil ya exigía sin el mapa sigue ahí.
    for (const r of base.requisitos) expect(claves).toContain(r.clave);
  });
});

describe('bloque 176 · avisos de norma', () => {
  it('UTP de más de 90 m es grave; la subida entre switches no se mide contra 90', () => {
    const a = avisosDeNorma({
      cables: [
        { assetId: 'c1', codigo: 'CAM-1', metros: TOPE_UTP_M + 5, estimado: true, esEnlace: false, cruza: [], medio: [1, 1] },
        { assetId: 's2', codigo: 'SW-2', metros: 300, estimado: false, esEnlace: true, cruza: [], medio: [1, 1] },
        { assetId: 'c3', codigo: 'CAM-3', metros: 40, estimado: false, esEnlace: false, cruza: [{ nivel: 'ELECTRICO', nombre: 'MCC 1' }], medio: [1, 1] },
      ],
      switches: [{ assetId: 's1', codigo: 'SW-1', xPx: 0, yPx: 0, capacidad: 8, ocupados: 8, poeUsados: 4, poePuertos: 4 }],
      sinConexion: [{ assetId: 'c9', codigo: 'CAM-9', xPx: 0, yPx: 0 }],
      switchFuera: [],
    });
    expect(a[0]).toMatchObject({ clave: 'UTP_90', gravedad: 'grave', assetId: 'c1' });
    expect(a.some((x) => x.assetId === 's2' && x.clave === 'UTP_90')).toBe(false);
    expect(a.map((x) => x.clave)).toEqual(expect.arrayContaining(['CRUZA_ELECTRICO', 'SIN_PUERTOS', 'SIN_POE', 'SIN_CONEXION']));
    expect(a[a.length - 1].gravedad).toBe('info');
  });
});

describe('bloque 176 · quién edita y qué queda auditado', () => {
  const ctrl = fs.readFileSync(path.join(__dirname, '../src/modules/planos/planos.controller.ts'), 'utf8');
  it('toda escritura del mapa exige location.manage Y wo.approve (sólo el Jefe)', () => {
    expect(ctrl).toMatch(/const EDITA = \['location\.manage', 'wo\.approve'\]/);
    const escrituras = [...ctrl.matchAll(/@(Post|Put|Patch|Delete)\([^)]*\)\s*\n\s*@RequirePermissions\(([^)]*)\)/g)];
    expect(escrituras.length).toBeGreaterThanOrEqual(11);
    for (const m of escrituras) expect(m[2]).toBe('...EDITA');
  });

  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const plano = { id: 'p1', estado: 'PUBLICADO', anchoPx: 1000, altoPx: 500, metrosPorPx: 0.5, locationId: 'L' };

  it('un área sin motivo no se guarda; con motivo queda auditada', async () => {
    const prisma: any = {
      plano: { findUnique: jest.fn().mockResolvedValue(plano) },
      zonaDeRiesgo: { create: jest.fn().mockResolvedValue({ id: 'r1', nivel: 'ALTO_RIESGO', nombre: 'Paso', motivo: 'grúa' }) },
    };
    const s = new PlanosService(prisma, {} as any, audit as any);
    const area = { nivel: 'ALTO_RIESGO', nombre: 'Paso de grúa', puntos: cuadro(10, 10, 100, 50) };
    await expect(s.guardarRiesgo('p1', null, { ...area, motivo: '' }, 'u1')).rejects.toThrow(/por qué es de riesgo/);
    await expect(s.guardarRiesgo('p1', null, { ...area, nivel: 'INVENTADO', motivo: 'carga suspendida' }, 'u1')).rejects.toThrow(/nivel/);
    await s.guardarRiesgo('p1', null, { ...area, motivo: 'carga suspendida' }, 'u1');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'MAPA_RIESGO_CREAR' }));
  });

  it('quitar un área exige motivo y se audita ANTES de borrar', async () => {
    const orden: string[] = [];
    audit.record.mockImplementation(async () => { orden.push('audit'); });
    const prisma: any = {
      plano: { findUnique: jest.fn().mockResolvedValue(plano) },
      zonaDeRiesgo: {
        findFirst: jest.fn().mockResolvedValue({ id: 'r1', nivel: 'ALTO_RIESGO', nombre: 'Paso', motivo: 'grúa', puntos: [] }),
        delete: jest.fn().mockImplementation(async () => { orden.push('delete'); }),
      },
    };
    const s = new PlanosService(prisma, {} as any, audit as any);
    await expect(s.borrarRiesgo('p1', 'r1', '', 'u1')).rejects.toThrow(/por qué/);
    await s.borrarRiesgo('p1', 'r1', 'Se retiró el riel de la grúa', 'u1');
    expect(orden).toEqual(['audit', 'delete']);
  });

  it('no se traza un cable sin puerto declarado ni con un extremo fuera del plano', async () => {
    const prisma: any = {
      plano: { findUnique: jest.fn().mockResolvedValue(plano) },
      switchPort: { findUnique: jest.fn().mockResolvedValue(null) },
      posicionEnPlano: { findUnique: jest.fn() },
    };
    const s = new PlanosService(prisma, {} as any, audit as any);
    await expect(s.guardarTrazado('p1', 'cam', [[10, 10]], 'u1')).rejects.toThrow(/puerto de switch/);
    prisma.switchPort.findUnique.mockResolvedValue({ switchId: 'sw', portNumber: 3, connectedAsset: { assetCode: 'CAM' } });
    prisma.posicionEnPlano.findUnique.mockResolvedValue(null);
    await expect(s.guardarTrazado('p1', 'cam', [[10, 10]], 'u1')).rejects.toThrow(/colocados en este plano/);
  });

  it('el trazado guarda los metros de antes y de después en la auditoría', async () => {
    audit.record.mockReset().mockResolvedValue(undefined);
    const prisma: any = {
      plano: { findUnique: jest.fn().mockResolvedValue(plano) },
      switchPort: { findUnique: jest.fn().mockResolvedValue({ switchId: 'sw', portNumber: 3, connectedAsset: { assetCode: 'CAM' } }) },
      posicionEnPlano: { findUnique: jest.fn().mockImplementation(({ where }) => Promise.resolve(where.planoId_assetId.assetId === 'sw' ? { xPx: 0, yPx: 0 } : { xPx: 100, yPx: 100 })) },
      trazadoCable: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({}) },
    };
    const s = new PlanosService(prisma, {} as any, audit as any);
    const r = await s.guardarTrazado('p1', 'cam', [[0, 300], [100, 300]], 'u1');
    // en L: 200 px · 0,5 = 100 m; trazado: 300 + 100 + 200 = 600 px · 0,5 = 300 m
    expect(r).toEqual({ metros: 300, estimado: false });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'MAPA_CABLE_TRAZAR', before: expect.objectContaining({ metros: 100 }), after: expect.objectContaining({ metros: 300 }),
    }));
  });
});
