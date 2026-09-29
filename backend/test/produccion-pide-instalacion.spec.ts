jest.mock('@prisma/client', () => ({ PrismaClient: class {}, Prisma: {} }));

import { ForbiddenException } from '@nestjs/common';
import { InstalacionService } from '../src/modules/instalacion/instalacion.service';

/**
 * BLOQUE 137 · Producción pide una instalación en SU tren, y sólo ve lo suyo.
 */
describe('Producción pide una instalación', () => {
  function build(trenes: string[]) {
    const creadas: any[] = [];
    const prisma: any = {
      user: {
        findUnique: jest.fn().mockImplementation(({ select }: any) => Promise.resolve(
          select?.fullName ? { fullName: 'Jefe de línea T2' } : { ambitoTrenes: trenes, role: { exigeAmbito: true } },
        )),
      },
      location: {
        findMany: jest.fn().mockResolvedValue([{ id: 'ubic-t2', parentId: null, type: 'TREN', code: 'AASA-PISCO-T2', stageId: null }]),
        findUnique: jest.fn().mockResolvedValue({ id: 'x' }),
      },
      instalacion: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }: any) => { creadas.push(data); return Promise.resolve({ id: 'i1', ...data }); }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const audit: any = { record: jest.fn().mockResolvedValue(undefined) };
    return { service: new InstalacionService(prisma, audit), prisma, creadas };
  }
  const dto = { tipoSitio: 'NAVE', tipoEquipo: 'CAMERA', justificacion: 'Se necesita ver la salida de barras' };

  it('en su tren: se crea, a su nombre y marcada como de Producción', async () => {
    const { service, creadas } = build(['AASA-PISCO-T2']);
    await service.solicitar({ ...dto, locationId: 'ubic-t2' } as any, 'u-t2');
    expect(creadas).toHaveLength(1);
    expect(creadas[0].creadoPorId).toBe('u-t2');
    expect(creadas[0].areaSolicitante).toBe('Producción');
    expect(creadas[0].solicitadaPor).toBe('Jefe de línea T2');
  });

  it('en otro tren: se rechaza', async () => {
    const { service, creadas } = build(['AASA-PISCO-T2']);
    await expect(service.solicitar({ ...dto, locationId: 'ubic-del-t1' } as any, 'u-t2'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(creadas).toHaveLength(0);
  });

  it('«mías» filtra por quien la pidió, con el usuario de la sesión', async () => {
    const { service, prisma } = build([]);
    await service.mias('u-t2');
    expect(prisma.instalacion.findMany.mock.calls[0][0].where).toEqual({ creadoPorId: 'u-t2' });
    expect(await service.mias(null)).toEqual([]);
  });
});
