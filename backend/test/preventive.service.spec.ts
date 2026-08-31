// Prueba UNITARIA: no debe depender del cliente Prisma generado (`prisma generate`).
// Se sustituye por un doble; la base de datos se simula en cada caso.
jest.mock('@prisma/client', () => ({ PrismaClient: class {}, Prisma: {} }));

import { PreventiveService } from '../src/modules/preventive/preventive.service';

/**
 * Camino crítico: generación automática de OM.
 * Regla de oro del negocio: SOLO se generan PREVENTIVAS.
 * Correctivo, Mejora y Predictivo nacen de una decisión humana.
 */
describe('PreventiveService — generación automática de OM', () => {
  const plan = (over: any = {}) => ({
    assetId: 'a1',
    intervalDays: 30,
    zoneCritical: true,
    nextDueAt: new Date('2026-07-01T08:00:00Z'),
    asset: {
      id: 'a1',
      assetCode: 'AA-CAM-T1-FX-001',
      type: 'CAMERA',
      location: { name: 'Tren 1 (Laminación)' },
      cabinet: null,
      ...(over.asset || {}),
    },
    ...over,
  });

  /** Prisma simulado. `openWo` = si el activo ya tiene una OM preventiva abierta. */
  function build(planes: any[], openWo: any = null) {
    const created: any[] = [];
    const prisma: any = {
      preventivePlan: { findMany: jest.fn().mockResolvedValue(planes) },
      workOrder: {
        // findFirst se usa para dos cosas: buscar OM abierta y calcular el correlativo.
        findFirst: jest.fn().mockImplementation((args: any) => {
          if (args?.where?.code) return Promise.resolve(null); // no hay códigos previos del año
          return Promise.resolve(openWo);
        }),
        findUnique: jest.fn().mockResolvedValue(null), // el código propuesto está libre
        create: jest.fn().mockImplementation(({ data }: any) => {
          created.push(data);
          return Promise.resolve(data);
        }),
      },
      /* BLOQUE 78. El generador ahora consulta tres cosas más para PROGRAMAR
         de verdad —ventanas de parada, hojas de ruta y el árbol de planta— en
         vez de crear la orden «para hoy» y ya.

         Se devuelven vacías a propósito: estas pruebas fijan las reglas del
         generador (no duplicar, sólo PREVENTIVO, reintentar el código), no la
         programación. Esa tiene sus propias pruebas sobre la función pura
         `programacion-preventiva.ts`, que no necesita base de datos. */
      ventanaParada: { findMany: jest.fn().mockResolvedValue([]) },
      hojaDeRuta: { findMany: jest.fn().mockResolvedValue([]) },
      location: { findMany: jest.fn().mockResolvedValue([]) },
      asset: { findMany: jest.fn().mockResolvedValue([]) },
      processStage: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const audit: any = { record: jest.fn().mockResolvedValue(undefined) };
    // La letra A/B/C: sin equipos clasificados manda el intervalo del plan.
    const criticidad: any = { resumen: jest.fn().mockResolvedValue({ equipos: [] }) };
    return {
      service: new PreventiveService(prisma, audit, criticidad),
      prisma, audit, created,
    };
  }

  it('SOLO crea órdenes de tipo PREVENTIVO', async () => {
    const { service, created } = build([plan()]);
    await service.generateDue(null, 'test');
    expect(created).toHaveLength(1);
    expect(created[0].type).toBe('PREVENTIVO');
    // Ningún otro tipo debe aparecer jamás en la generación automática.
    expect(['CORRECTIVO', 'MEJORA', 'PREDICTIVO']).not.toContain(created[0].type);
  });

  it('no duplica si el activo ya tiene una OM preventiva abierta', async () => {
    const { service, created } = build([plan()], { id: 'wo-existente' });
    const r = await service.generateDue(null, 'test');
    expect(created).toHaveLength(0);
    expect(r.generated).toBe(0);
    expect(r.skipped[0].motivo).toMatch(/ya tiene/i);
  });

  it('programa la OM en la fecha real de vencimiento (no "hoy")', async () => {
    const vence = new Date('2026-06-15T08:00:00Z');
    const { service, created } = build([plan({ nextDueAt: vence })]);
    await service.generateDue(null, 'test');
    expect(created[0].scheduledDate).toEqual(vence);
  });

  it('hereda la zona desde la ubicación del activo', async () => {
    const { service, created } = build([plan()]);
    await service.generateDue(null, 'test');
    expect(created[0].zone).toBe('Tren 1 (Laminación)');
  });

  it('si el activo está en un gabinete, la zona lo incluye', async () => {
    const { service, created } = build([plan({ asset: { cabinet: { code: 'GAB-T1-R01' } } })]);
    await service.generateDue(null, 'test');
    expect(created[0].zone).toContain('GAB-T1-R01');
  });

  it('excluye activos fuera de operación (BAJA / STOCK / eliminados)', async () => {
    const { service, prisma } = build([]);
    await service.generateDue(null, 'test');
    const filtro = prisma.preventivePlan.findMany.mock.calls[0][0].where;
    expect(filtro.active).toBe(true);
    expect(filtro.asset.deletedAt).toBeNull();
    expect(filtro.asset.status.notIn).toEqual(expect.arrayContaining(['BAJA', 'STOCK']));
  });

  it('deja traza de auditoría de lo generado', async () => {
    const { service, audit } = build([plan()]);
    await service.generateDue(null, 'test');
    expect(audit.record).toHaveBeenCalledTimes(1);
    const traza = audit.record.mock.calls[0][0];
    expect(traza.action).toBe('PREVENTIVE_GENERATE');
    expect(traza.after.generadas).toBe(1);
  });

  it('la OM nace ABIERTA y ligada al activo del plan', async () => {
    const { service, created } = build([plan()]);
    await service.generateDue(null, 'test');
    expect(created[0].status).toBe('ABIERTA');
    expect(created[0].assetId).toBe('a1');
    expect(created[0].code).toMatch(/^OM-\d{4}-\d{4}$/);
  });
});
