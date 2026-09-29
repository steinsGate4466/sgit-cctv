import { actividadDeLaOm, decidirOmDeInspeccion } from '../src/modules/grua/om-de-inspeccion';

/** BLOQUE 140 · el hallazgo de la inspección de grúa se convierte en orden. */
describe('¿La inspección de grúa abre una orden?', () => {
  it('fuera de servicio: sí', () => {
    expect(decidirOmDeInspeccion({ resultado: 'FUERA_DE_SERVICIO' })).toBe('ABRIR');
  });
  it('con observaciones y seguimiento marcado: sí', () => {
    expect(decidirOmDeInspeccion({ resultado: 'OPERATIVA_CON_OBSERVACIONES', requiereSeguimiento: true })).toBe('ABRIR');
  });
  it('con observaciones SIN seguimiento: no', () => {
    expect(decidirOmDeInspeccion({ resultado: 'OPERATIVA_CON_OBSERVACIONES', requiereSeguimiento: false })).toBe('NO');
  });
  it('no se pudo acceder: no (no hay hallazgo; hay que volver a subir)', () => {
    expect(decidirOmDeInspeccion({ resultado: 'NO_SE_PUDO_ACCEDER', requiereSeguimiento: true })).toBe('NO');
  });
  it('si ya se hizo dentro de una orden: no se abre otra', () => {
    expect(decidirOmDeInspeccion({ resultado: 'FUERA_DE_SERVICIO', workOrderId: 'wo1' })).toBe('NO');
  });
  it('la actividad dice qué, dónde y de qué inspección salió', () => {
    const t = actividadDeLaOm({ code: 'GRU-2026-0003', grua: '107', posicionEnGrua: 'pluma', resultado: 'FUERA_DE_SERVICIO', hallazgos: 'Chicote partido' });
    expect(t).toMatch(/fuera de servicio en grúa 107 \(pluma\)/i);
    expect(t).toMatch(/GRU-2026-0003/);
    expect(t).toMatch(/Chicote partido/);
  });
});

jest.mock('@prisma/client', () => ({ PrismaClient: class {}, Prisma: {} }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { GruaService } = require('../src/modules/grua/grua.service');

describe('GruaService.crear — abre o enlaza la orden', () => {
  function build(abierta: any) {
    const prisma: any = {
      asset: { findFirst: jest.fn().mockResolvedValue({ id: 'a1', type: 'CAMERA', assetCode: 'AA-CAM-GRU-107' }) },
      inspeccionGrua: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'i1', code: 'GRU-2026-0003' }),
        update: jest.fn().mockResolvedValue({}),
      },
      workOrder: { findFirst: jest.fn().mockResolvedValue(abierta) },
    };
    const ordenes: any = { create: jest.fn().mockResolvedValue({ id: 'wo-nueva', code: 'OM-2026-0200' }) };
    const s = new GruaService(prisma, ordenes);
    s['siguienteCodigo'] = async () => 'GRU-2026-0003';
    return { s, prisma, ordenes };
  }
  const dto: any = { assetId: 'a1', grua: '107', resultado: 'FUERA_DE_SERVICIO', camaraEstado: 'NO_CONFORME' };

  it('sin correctivo abierto: abre uno nuevo y lo enlaza', async () => {
    const { s, prisma, ordenes } = build(null);
    const r = await s.crear(dto, 'tec');
    expect(ordenes.create).toHaveBeenCalledTimes(1);
    expect(ordenes.create.mock.calls[0][0].type).toBe('CORRECTIVO');
    expect(prisma.inspeccionGrua.update.mock.calls[0][0].data.workOrderId).toBe('wo-nueva');
    expect(r.om).toEqual({ code: 'OM-2026-0200', nueva: true });
  });

  it('con correctivo abierto: se enlaza a ése, no abre otro', async () => {
    const { s, ordenes } = build({ id: 'wo-vieja', code: 'OM-2026-0150' });
    const r = await s.crear(dto, 'tec');
    expect(ordenes.create).not.toHaveBeenCalled();
    expect(r.om).toEqual({ code: 'OM-2026-0150', nueva: false });
  });

  it('si abrir la orden falla, la inspección se queda y se dice', async () => {
    const { s, ordenes } = build(null);
    ordenes.create.mockRejectedValue(new Error('sin conexión'));
    const r = await s.crear(dto, 'tec');
    expect(r.code).toBe('GRU-2026-0003');
    expect(r.om).toBeNull();
    expect(r.omError).toMatch(/Ábrela a mano/);
  });
});
