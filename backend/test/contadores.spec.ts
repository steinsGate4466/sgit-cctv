import { ContadoresService } from '../src/modules/dashboard/contadores.service';

jest.mock('../src/common/ambito-usuario', () => ({ filtroConAmbito: jest.fn(async () => null) }));
import { filtroConAmbito } from '../src/common/ambito-usuario';

/** Bloque 170 — los números del menú. */
function prismaFalso(over: Partial<Record<string, any>> = {}) {
  return {
    incident: { count: jest.fn(async ({ where }: any) => (where.priority ? 2 : 9)) },
    workOrder: { count: jest.fn(async ({ where }: any) => (where.detailedAt === null ? 5 : 3)) },
    accessRequest: { count: jest.fn(async () => 0) },
    instalacion: { count: jest.fn(async () => { throw new Error('tabla en migración'); }) },
    $queryRaw: jest.fn(async () => [{ n: BigInt(4) }]),
    ...over,
  } as any;
}

describe('contadores del menú', () => {
  it('sin permiso de una pantalla, su número ni se calcula', async () => {
    const p = prismaFalso();
    const r = await new ContadoresService(p).contadores({ userId: 'u', permissions: ['incident.read'] });
    expect(Object.keys(r)).toEqual(['/incidents']);
    expect(p.workOrder.count).not.toHaveBeenCalled();
    expect(p.$queryRaw).not.toHaveBeenCalled();
  });

  it('incidencias: dice cuántas graves y se pinta en rojo si las hay', async () => {
    const r = await new ContadoresService(prismaFalso()).contadores({ userId: 'u', permissions: ['incident.read'] });
    expect(r['/incidents']).toEqual({ n: 9, que: '9 incidencias vivas · 2 graves', tono: 'alerta' });
  });

  it('los ceros no se devuelven y una cuenta que falla no tumba a las demás', async () => {
    const r = await new ContadoresService(prismaFalso()).contadores({
      userId: 'u',
      permissions: ['incident.read', 'wo.read', 'dashboard.read', 'access.read', 'asset.read', 'inventory.read'],
    });
    expect(r['/access']).toBeUndefined();        // 0 → fuera
    expect(r['/instalaciones']).toBeUndefined(); // falló → fuera, sin romper
    expect(r['/maintenance'].n).toBe(3);
    expect(r['/bandeja'].n).toBe(5);
    expect(r['/inventory']).toMatchObject({ n: 4, tono: 'alerta' });
  });

  it('respeta el ámbito: la cuenta lleva el filtro de ubicaciones del usuario', async () => {
    (filtroConAmbito as jest.Mock).mockResolvedValueOnce({ in: ['L1'] });
    const p = prismaFalso();
    await new ContadoresService(p).contadores({ userId: 'u', permissions: ['incident.read', 'wo.read'] });
    expect(p.incident.count.mock.calls[0][0].where.asset).toEqual({ locationId: { in: ['L1'] } });
    expect(p.workOrder.count.mock.calls[0][0].where.OR).toEqual([
      { asset: { locationId: { in: ['L1'] } } }, { locationId: { in: ['L1'] } },
    ]);
  });
});
