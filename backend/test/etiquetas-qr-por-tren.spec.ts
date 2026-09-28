// Prueba UNITARIA: Prisma se sustituye por un doble.
jest.mock('@prisma/client', () => ({ PrismaClient: class {}, Prisma: {} }));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AssetsService } from '../src/modules/assets/assets.service';

/**
 * BLOQUE 142 · LA HOJA DE ETIQUETAS QR.
 *
 * Fija dos fallos que estaban en producción:
 *   1. Un Jefe de Tren sin tren asignado recibía las etiquetas de TODA la
 *      planta (códigos y ubicaciones de los tres trenes).
 *   2. Un `take: 200` callado dejaba fuera la mitad sin avisar.
 */
describe('Hoja de etiquetas QR — ámbito y tope', () => {
  function build(opts: { total: number; exigeAmbito?: boolean; trenes?: string[] }) {
    const prisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          ambitoTrenes: opts.trenes ?? [],
          role: { exigeAmbito: !!opts.exigeAmbito },
        }),
      },
      location: { findMany: jest.fn().mockResolvedValue([]) },
      asset: {
        count: jest.fn().mockResolvedValue(opts.total),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new AssetsService(prisma, {} as any, {} as any, {} as any);
    return { service, prisma };
  }

  it('un rol sectorizado sin tren asignado no recibe NINGUNA etiqueta', async () => {
    const { service, prisma } = build({ total: 0, exigeAmbito: true });
    await expect(service.qrSheet({}, 'jefe-sin-tren')).rejects.toBeInstanceOf(NotFoundException);
    const where = prisma.asset.count.mock.calls[0][0].where;
    expect(where.locationId).toEqual({ in: [] });
  });

  it('si pasa del tope lo DICE, con la cifra, en vez de recortar callado', async () => {
    const { service, prisma } = build({ total: AssetsService.TOPE_ETIQUETAS + 132 });
    await expect(service.qrSheet({}, 'admin')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.qrSheet({}, 'admin')).rejects.toThrow(String(AssetsService.TOPE_ETIQUETAS + 132));
    expect(prisma.asset.findMany).not.toHaveBeenCalled();
  });

  it('usa los mismos filtros que el listado (tipo, estado, búsqueda)', async () => {
    const { service, prisma } = build({ total: 0 });
    await service.qrSheet({ type: 'CAMERA' as any, status: 'OPERATIVO' as any, search: 'T2' }, 'admin').catch(() => null);
    const where = prisma.asset.count.mock.calls[0][0].where;
    expect(where.type).toBe('CAMERA');
    expect(where.status).toBe('OPERATIVO');
    expect(where.OR).toBeDefined();
    expect(where.deletedAt).toBeNull();
  });
});
