jest.mock('@prisma/client', () => ({ PrismaClient: class {}, Prisma: {} }));

import { BadRequestException } from '@nestjs/common';
import { MaintenanceService } from '../src/modules/maintenance/maintenance.service';

/**
 * BLOQUE 136 · el subtipo de la OM sale del catálogo TRABAJO_OM y tiene que
 * ser del mismo tipo que la orden.
 */
describe('Subtipo de una orden', () => {
  function build(trabajo: any) {
    const creadas: any[] = [];
    const prisma: any = {
      catalogItem: { findUnique: jest.fn().mockResolvedValue(trabajo) },
      workOrder: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }: any) => { creadas.push(data); return Promise.resolve({ id: 'w1', ...data }); }),
      },
    };
    const svc = new MaintenanceService(prisma, { record: jest.fn() } as any, {} as any, {} as any, {} as any);
    return { svc, creadas };
  }
  const base = { type: 'PREVENTIVO', assetId: 'a1', code: 'OM-X-1' } as any;

  it('un subtipo del catálogo y del mismo tipo se guarda', async () => {
    const { svc, creadas } = build({ active: true, group: 'PREVENTIVO', name: 'Limpieza de domo' });
    await svc.create({ ...base, subtipo: 'LIMPIEZA_DE_DOMO' }, 'u1').catch(() => null);
    expect(creadas[0]?.subtipo).toBe('LIMPIEZA_DE_DOMO');
  });

  it('un código que no está en el catálogo se rechaza', async () => {
    const { svc } = build(null);
    await expect(svc.create({ ...base, subtipo: 'INVENTADO' }, 'u1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('un trabajo de otro tipo se rechaza', async () => {
    const { svc } = build({ active: true, group: 'CORRECTIVO', name: 'Cambio de fuente' });
    await expect(svc.create({ ...base, subtipo: 'CAMBIO_DE_FUENTE' }, 'u1')).rejects.toThrow(/tipo CORRECTIVO/);
  });

  it('un trabajo desactivado se rechaza', async () => {
    const { svc } = build({ active: false, group: 'PREVENTIVO', name: 'Viejo' });
    await expect(svc.create({ ...base, subtipo: 'VIEJO' }, 'u1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
