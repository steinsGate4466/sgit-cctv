// Prueba UNITARIA: Prisma se sustituye por un doble.
jest.mock('@prisma/client', () => ({ PrismaClient: class {}, Prisma: {} }));

import { ForbiddenException } from '@nestjs/common';
import { IncidentsService } from '../src/modules/incidents/incidents.service';

/**
 * BLOQUE 139 · cada uno reporta en su tren, y queda quién lo reportó.
 * La puerta general (`POST /incidents`) lleva el activo en el cuerpo, así que
 * el guard de ámbito no lo veía: se comprueba dentro del servicio.
 */
describe('Nueva incidencia — ámbito y quién la reporta', () => {
  function build(opts: { trenes?: string[]; locationDelActivo: string | null; ubicacionesDelTren: string[] }) {
    const creadas: any[] = [];
    const prisma: any = {
      user: { findUnique: jest.fn().mockResolvedValue({ ambitoTrenes: opts.trenes ?? [], role: { exigeAmbito: false } }) },
      location: {
        findMany: jest.fn().mockResolvedValue(opts.ubicacionesDelTren.map((id) => ({ id, parentId: null, type: 'TREN', code: 'AASA-PISCO-T2', siglaTren: 'T2', path: '' }))),
        findFirst: jest.fn().mockResolvedValue({ id: 'tren2', path: 'AASA/PISCO/T2', code: 'AASA-PISCO-T2' }),
      },
      asset: { findUnique: jest.fn().mockResolvedValue(opts.locationDelActivo === null ? null : { locationId: opts.locationDelActivo }) },
      incident: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }: any) => { creadas.push(data); return Promise.resolve({ id: 'i1', ...data, reportedAt: new Date() }); }),
      },
      failureEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const avisos: any = { destinatarios: jest.fn().mockResolvedValue([]), encolar: jest.fn() };
    return { service: new IncidentsService(prisma, {} as any, {} as any, avisos), creadas };
  }

  it('sin tren asignado (ve todo): crea y guarda quién la reportó', async () => {
    const { service, creadas } = build({ locationDelActivo: 'x', ubicacionesDelTren: [] });
    await service.create({ title: 'No hay imagen', assetId: 'a1' } as any, 'u-jefe');
    expect(creadas[0].reportedById).toBe('u-jefe');
  });

  it('con tren asignado: un equipo de OTRO tren se rechaza', async () => {
    const { service, creadas } = build({ trenes: ['AASA-PISCO-T2'], locationDelActivo: 'ubic-del-tren-1', ubicacionesDelTren: ['ubic-del-tren-2'] });
    await expect(service.create({ title: 'No hay imagen', assetId: 'a1' } as any, 'u-t2'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(creadas).toHaveLength(0);
  });

  it('con tren asignado: un equipo de SU tren se crea', async () => {
    const { service, creadas } = build({ trenes: ['AASA-PISCO-T2'], locationDelActivo: 'ubic-del-tren-2', ubicacionesDelTren: ['ubic-del-tren-2'] });
    await service.create({ title: 'No hay imagen', assetId: 'a1' } as any, 'u-t2');
    expect(creadas).toHaveLength(1);
    expect(creadas[0].reportedById).toBe('u-t2');
  });
});
