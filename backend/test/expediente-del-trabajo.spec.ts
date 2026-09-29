jest.mock('@prisma/client', () => ({ PrismaClient: class {}, Prisma: {} }));

import { NotFoundException } from '@nestjs/common';
import { DocumentsService } from '../src/modules/documents/documents.service';

/** BLOQUE 155 · el expediente de una instalación o de una orden. */
describe('Documentos del trabajo', () => {
  const pdf = { buffer: Buffer.concat([Buffer.from([0x25, 0x50, 0x44, 0x46]), Buffer.alloc(100)]), originalname: 'acta.pdf' };
  function build(opts: { instalacion?: boolean; orden?: boolean; version?: number } = {}) {
    const creados: any[] = [];
    const prisma: any = {
      instalacion: { findUnique: jest.fn().mockResolvedValue(opts.instalacion === false ? null : { id: 'ins1' }) },
      workOrder: { findUnique: jest.fn().mockResolvedValue(opts.orden === false ? null : { id: 'wo1' }) },
      document: {
        findFirst: jest.fn().mockResolvedValue(opts.version ? { version: opts.version } : null),
        create: jest.fn().mockImplementation(({ data }: any) => { creados.push(data); return Promise.resolve({ id: 'd1', title: data.title, version: data.version }); }),
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const storage: any = { put: jest.fn().mockResolvedValue(undefined) };
    const audit: any = { record: jest.fn().mockResolvedValue(undefined) };
    return { service: new DocumentsService(prisma, storage, audit), prisma, creados, storage };
  }

  it('cuelga de la instalación, sin equipo ni ubicación', async () => {
    const { service, creados, storage } = build();
    await service.subir(pdf, { title: 'Acta de entrega', category: 'PLANO', instalacionId: 'ins1' }, 'tec');
    expect(creados[0].instalacionId).toBe('ins1');
    expect(creados[0].workOrderId).toBeNull();
    expect(storage.put).toHaveBeenCalled();
  });

  it('cuelga de la orden', async () => {
    const { service, creados } = build();
    await service.subir(pdf, { title: 'Protocolo', category: 'CONFIG', workOrderId: 'wo1' }, 'tec');
    expect(creados[0].workOrderId).toBe('wo1');
  });

  it('el mismo título en el mismo trabajo es la versión siguiente, no se pisa', async () => {
    const { service, creados, prisma } = build({ version: 2 });
    await service.subir(pdf, { title: 'Plano del tramo', category: 'PLANO', instalacionId: 'ins1' }, 'tec');
    expect(prisma.document.findFirst.mock.calls[0][0].where.instalacionId).toBe('ins1');
    expect(creados[0].version).toBe(3);
  });

  it('una instalación que no existe no recibe documentos', async () => {
    const { service } = build({ instalacion: false });
    await expect(service.subir(pdf, { title: 'X', category: 'PLANO', instalacionId: 'no' }, 'tec'))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('la lista del expediente filtra por el trabajo', async () => {
    const { service, prisma } = build();
    await service.lista({ workOrderId: 'wo1' });
    expect(prisma.document.findMany.mock.calls[0][0].where.workOrderId).toBe('wo1');
  });
});
