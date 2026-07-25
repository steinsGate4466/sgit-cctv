import { computeEffectiveStatuses } from '../src/common/asset-status';

/**
 * Camino crítico: estado operativo DERIVADO del activo.
 * Es la regla que evita la contradicción "la OM dice error pero el activo dice operativo".
 */
describe('asset-status — estado operativo derivado', () => {
  /** Prisma simulado: devuelve las OM e incidencias que le indiquemos. */
  function prismaMock(workOrders: any[], incidents: any[]) {
    return {
      workOrder: { findMany: jest.fn().mockResolvedValue(workOrders) },
      incident: { findMany: jest.fn().mockResolvedValue(incidents) },
    } as any;
  }

  it('OM activa → el activo queda EN MANTENIMIENTO', async () => {
    const prisma = prismaMock([{ assetId: 'a1' }], []);
    const r = await computeEffectiveStatuses(prisma, [{ id: 'a1', status: 'OPERATIVO' }]);
    expect(r.a1).toBe('MANTENIMIENTO');
  });

  it('incidencia CRITICA abierta → FUERA_SERVICIO', async () => {
    const prisma = prismaMock([], [{ assetId: 'a1', priority: 'CRITICA' }]);
    const r = await computeEffectiveStatuses(prisma, [{ id: 'a1', status: 'OPERATIVO' }]);
    expect(r.a1).toBe('FUERA_SERVICIO');
  });

  it('incidencia ALTA abierta → FUERA_SERVICIO', async () => {
    const prisma = prismaMock([], [{ assetId: 'a1', priority: 'ALTA' }]);
    const r = await computeEffectiveStatuses(prisma, [{ id: 'a1', status: 'OPERATIVO' }]);
    expect(r.a1).toBe('FUERA_SERVICIO');
  });

  it('incidencia MEDIA abierta → CON_INCIDENCIA (degradado)', async () => {
    const prisma = prismaMock([], [{ assetId: 'a1', priority: 'MEDIA' }]);
    const r = await computeEffectiveStatuses(prisma, [{ id: 'a1', status: 'OPERATIVO' }]);
    expect(r.a1).toBe('CON_INCIDENCIA');
  });

  it('la OM tiene prioridad sobre la incidencia', async () => {
    const prisma = prismaMock([{ assetId: 'a1' }], [{ assetId: 'a1', priority: 'CRITICA' }]);
    const r = await computeEffectiveStatuses(prisma, [{ id: 'a1', status: 'OPERATIVO' }]);
    expect(r.a1).toBe('MANTENIMIENTO');
  });

  it('BAJA y STOCK son administrativos: no los pisa nada', async () => {
    const prisma = prismaMock([{ assetId: 'a1' }], [{ assetId: 'a2', priority: 'CRITICA' }]);
    const r = await computeEffectiveStatuses(prisma, [
      { id: 'a1', status: 'BAJA' },
      { id: 'a2', status: 'STOCK' },
    ]);
    expect(r.a1).toBe('BAJA');
    expect(r.a2).toBe('STOCK');
  });

  it('sin OM ni incidencias abiertas → conserva su estado base', async () => {
    const prisma = prismaMock([], []);
    const r = await computeEffectiveStatuses(prisma, [{ id: 'a1', status: 'OPERATIVO' }]);
    expect(r.a1).toBe('OPERATIVO');
  });

  it('no consulta la base de datos si no hay activos (sin N+1)', async () => {
    const prisma = prismaMock([], []);
    const r = await computeEffectiveStatuses(prisma, []);
    expect(r).toEqual({});
    expect(prisma.workOrder.findMany).not.toHaveBeenCalled();
    expect(prisma.incident.findMany).not.toHaveBeenCalled();
  });

  it('resuelve muchos activos con solo 2 consultas (en lote)', async () => {
    const prisma = prismaMock([{ assetId: 'a2' }], [{ assetId: 'a3', priority: 'CRITICA' }]);
    const activos = [
      { id: 'a1', status: 'OPERATIVO' },
      { id: 'a2', status: 'OPERATIVO' },
      { id: 'a3', status: 'OPERATIVO' },
    ];
    const r = await computeEffectiveStatuses(prisma, activos);
    expect(r).toEqual({ a1: 'OPERATIVO', a2: 'MANTENIMIENTO', a3: 'FUERA_SERVICIO' });
    expect(prisma.workOrder.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.incident.findMany).toHaveBeenCalledTimes(1);
  });
});
