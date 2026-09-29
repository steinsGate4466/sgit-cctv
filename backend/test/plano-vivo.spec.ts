jest.mock('@prisma/client', () => ({ PrismaClient: class {}, Prisma: {} }));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { calibrar, colorDelPunto, dentroDelPlano } from '../src/modules/planos/geometria';
import { PlanosService } from '../src/modules/planos/planos.service';

/** BLOQUE 151 · PLANO VIVO. */
describe('Calibrar la escala', () => {
  it('dos puntos a 600 px que son 60 m → 0,1 m por píxel', () => {
    expect(calibrar({ x: 100, y: 100 }, { x: 700, y: 100 }, 60)).toEqual({ metrosPorPx: 0.1 });
  });
  it('en diagonal usa la distancia real, no sólo la horizontal', () => {
    const r = calibrar({ x: 0, y: 0 }, { x: 300, y: 400 }, 50) as any;
    expect(r.metrosPorPx).toBeCloseTo(0.1);
  });
  it('dos puntos casi en el mismo sitio: error claro', () => {
    expect(calibrar({ x: 10, y: 10 }, { x: 15, y: 12 }, 10)).toEqual({ error: expect.stringMatching(/mismo sitio/) });
  });
  it('distancia cero o negativa: error', () => {
    expect('error' in calibrar({ x: 0, y: 0 }, { x: 500, y: 0 }, 0)).toBe(true);
  });
});

describe('Dentro del plano', () => {
  it('borde incluido, fuera no', () => {
    expect(dentroDelPlano(0, 0, 100, 100)).toBe(true);
    expect(dentroDelPlano(100, 100, 100, 100)).toBe(true);
    expect(dentroDelPlano(101, 50, 100, 100)).toBe(false);
    expect(dentroDelPlano(NaN, 50, 100, 100)).toBe(false);
  });
});

describe('El color del punto', () => {
  const v = (estado: any, caducada = false) => ({ estado, texto: 't', caducada });
  it('manda el monitoreo vigente', () => {
    expect(colorDelPunto(v('RESPONDE'), 'FUERA_SERVICIO').color).toBe('ok');
    expect(colorDelPunto(v('CAIDO'), 'OPERATIVO').color).toBe('caida');
    expect(colorDelPunto(v('INESTABLE'), 'OPERATIVO').color).toBe('alerta');
  });
  it('monitoreo caducado: GRIS, aunque lo declarado diga operativo', () => {
    const r = colorDelPunto(v('SIN_DATO', true), 'OPERATIVO');
    expect(r.color).toBe('sindato');
  });
  it('sin monitoreo: lo declarado, y se dice que es declarado', () => {
    expect(colorDelPunto(null, 'FUERA_SERVICIO')).toMatchObject({ color: 'caida', fuente: 'declarado' });
    expect(colorDelPunto(null, 'CON_INCIDENCIA').color).toBe('alerta');
    expect(colorDelPunto(null, 'OPERATIVO')).toMatchObject({ color: 'ok', fuente: 'declarado' });
  });
});

describe('PlanosService — reglas de gestión', () => {
  function build(plano: any, extra: any = {}) {
    const prisma: any = {
      plano: {
        findUnique: jest.fn().mockResolvedValue(plano),
        update: jest.fn().mockResolvedValue({ ...plano, metrosPorPx: 0.1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      posicionEnPlano: { count: jest.fn().mockResolvedValue(extra.colocados ?? 0), upsert: jest.fn().mockResolvedValue({}) },
      asset: { findFirst: jest.fn().mockResolvedValue(extra.activo ?? null) },
      location: { findMany: jest.fn().mockResolvedValue(extra.nodos ?? [{ id: 'area', parentId: null, type: 'AREA', code: 'A' }]) },
      user: { findUnique: jest.fn().mockResolvedValue(extra.usuario ?? { ambitoTrenes: [], role: { exigeAmbito: false } }) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const audit: any = { record: jest.fn().mockResolvedValue(undefined) };
    return { s: new PlanosService(prisma, {} as any, audit), prisma };
  }
  const base = { id: 'p1', locationId: 'area', estado: 'BORRADOR', anchoPx: 1000, altoPx: 800, metrosPorPx: null, version: 1 };

  it('no se publica sin calibrar', async () => {
    await expect(build(base).s.publicar('p1', 'u')).rejects.toThrow(/Calibra/);
  });
  it('no se publica vacío', async () => {
    await expect(build({ ...base, metrosPorPx: 0.1 }, { colocados: 0 }).s.publicar('p1', 'u')).rejects.toThrow(/vacío/);
  });
  it('al publicar, el anterior de la misma zona queda archivado', async () => {
    const { s, prisma } = build({ ...base, metrosPorPx: 0.1 }, { colocados: 3 });
    await s.publicar('p1', 'u');
    expect(prisma.plano.updateMany.mock.calls[0][0]).toMatchObject({
      where: { locationId: 'area', estado: 'PUBLICADO' }, data: { estado: 'ARCHIVADO' },
    });
  });
  it('no se coloca fuera de la imagen', async () => {
    await expect(build(base).s.colocar('p1', 'a1', { xPx: 1200, yPx: 10 } as any, 'u'))
      .rejects.toBeInstanceOf(BadRequestException);
  });
  it('no se coloca un equipo de otra zona', async () => {
    const { s } = build(base, { activo: { id: 'a1', locationId: 'otra', assetCode: 'AA-CAM-1' } });
    await expect(s.colocar('p1', 'a1', { xPx: 10, yPx: 10 } as any, 'u')).rejects.toThrow(/no está en la zona/);
  });
  it('un equipo de su zona se coloca', async () => {
    const { s, prisma } = build(base, { activo: { id: 'a1', locationId: 'area', assetCode: 'AA-CAM-1' } });
    await s.colocar('p1', 'a1', { xPx: 10, yPx: 20, rumbo: 90 } as any, 'u');
    expect(prisma.posicionEnPlano.upsert.mock.calls[0][0].create).toMatchObject({ xPx: 10, yPx: 20, rumbo: 90 });
  });
  it('un plano de otra zona no se enseña a quien tiene ámbito', async () => {
    const { s } = build({ ...base, estado: 'PUBLICADO' }, {
      usuario: { ambitoTrenes: ['T2'], role: { exigeAmbito: true } },
      nodos: [{ id: 'area', parentId: null, type: 'AREA', code: 'A' }, { id: 't2', parentId: null, type: 'TREN', code: 'T2' }],
    });
    await expect(s.imagen('p1', 'u-t2', false)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
