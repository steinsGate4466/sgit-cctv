import { decidirAvisoDeInspeccion, descripcionDelAviso, tituloDelAviso } from '../src/modules/grua/om-de-inspeccion';

/**
 * BLOQUES 140 Y 180 · el hallazgo de la inspección de grúa se convierte en un
 * AVISO. La OM no la crea SGIT —la crea SAP y la trata Mantenimiento— y una
 * observación no es un correctivo: es una condición que se va a dañar.
 */
describe('¿La inspección de grúa abre un aviso?', () => {
  it('fuera de servicio: aviso de FALLA', () => {
    expect(decidirAvisoDeInspeccion({ resultado: 'FUERA_DE_SERVICIO' })).toBe('FALLA');
  });
  it('con observaciones y seguimiento marcado: aviso de CONDICIÓN (no cuenta como falla)', () => {
    expect(decidirAvisoDeInspeccion({ resultado: 'OPERATIVA_CON_OBSERVACIONES', requiereSeguimiento: true })).toBe('CONDICION');
  });
  it('con observaciones SIN seguimiento: no', () => {
    expect(decidirAvisoDeInspeccion({ resultado: 'OPERATIVA_CON_OBSERVACIONES', requiereSeguimiento: false })).toBe('NO');
  });
  it('no se pudo acceder: no (no hay hallazgo; hay que volver a subir)', () => {
    expect(decidirAvisoDeInspeccion({ resultado: 'NO_SE_PUDO_ACCEDER', requiereSeguimiento: true })).toBe('NO');
  });
  it('si ya se hizo dentro de una orden: no se abre aviso', () => {
    expect(decidirAvisoDeInspeccion({ resultado: 'FUERA_DE_SERVICIO', workOrderId: 'wo1' })).toBe('NO');
  });
  it('el aviso dice qué, dónde y de qué inspección salió', () => {
    expect(tituloDelAviso({ grua: '107', posicionEnGrua: 'pluma', resultado: 'FUERA_DE_SERVICIO' }))
      .toMatch(/fuera de servicio · grúa 107 \(pluma\)/i);
    const t = descripcionDelAviso({ code: 'GRU-2026-0003', grua: '107', posicionEnGrua: 'pluma', resultado: 'FUERA_DE_SERVICIO', hallazgos: 'Chicote partido' });
    expect(t).toMatch(/GRU-2026-0003/);
    expect(t).toMatch(/Chicote partido/);
  });
});

jest.mock('@prisma/client', () => ({ PrismaClient: class {}, Prisma: {} }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { GruaService } = require('../src/modules/grua/grua.service');

describe('GruaService.crear — abre o enlaza el AVISO, nunca una orden', () => {
  function build(vivo: any) {
    const prisma: any = {
      asset: { findFirst: jest.fn().mockResolvedValue({ id: 'a1', type: 'CAMERA', assetCode: 'AA-CAM-GRU-107' }) },
      inspeccionGrua: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'i1', code: 'GRU-2026-0003' }),
        update: jest.fn().mockResolvedValue({}),
      },
      incident: { findFirst: jest.fn().mockResolvedValue(vivo) },
      workOrder: { create: jest.fn(), findFirst: jest.fn() },
    };
    const incidencias: any = {
      create: jest.fn().mockResolvedValue({ id: 'inc-nueva', code: 'INC-2026-0200' }),
      update: jest.fn().mockResolvedValue({}),
    };
    const s = new GruaService(prisma, incidencias);
    s['siguienteCodigo'] = async () => 'GRU-2026-0003';
    return { s, prisma, incidencias };
  }
  const fuera: any = { assetId: 'a1', grua: '107', resultado: 'FUERA_DE_SERVICIO', camaraEstado: 'NO_CONFORME' };
  const observada: any = { assetId: 'a1', grua: '107', resultado: 'OPERATIVA_CON_OBSERVACIONES', requiereSeguimiento: true, camaraEstado: 'OBSERVADO' };

  it('fuera de servicio sin aviso vivo: abre un aviso de FALLA y lo enlaza', async () => {
    const { s, prisma, incidencias } = build(null);
    const r = await s.crear(fuera, 'tec');
    expect(incidencias.create).toHaveBeenCalledTimes(1);
    expect(incidencias.create.mock.calls[0][0].tipoAviso).toBe('FALLA');
    expect(prisma.inspeccionGrua.update.mock.calls[0][0].data.incidentId).toBe('inc-nueva');
    expect(prisma.workOrder.create).not.toHaveBeenCalled();
    expect(r.aviso).toEqual({ code: 'INC-2026-0200', nuevo: true, tipo: 'FALLA' });
  });

  it('con observaciones: aviso de CONDICIÓN, no un correctivo', async () => {
    const { s, incidencias } = build(null);
    const r = await s.crear(observada, 'tec');
    expect(incidencias.create.mock.calls[0][0].tipoAviso).toBe('CONDICION');
    expect(r.aviso.tipo).toBe('CONDICION');
  });

  it('con aviso vivo: se enlaza a ése, no abre otro', async () => {
    const { s, incidencias } = build({ id: 'inc-vieja', code: 'INC-2026-0150', tipoAviso: 'FALLA' });
    const r = await s.crear(fuera, 'tec');
    expect(incidencias.create).not.toHaveBeenCalled();
    expect(r.aviso).toEqual({ code: 'INC-2026-0150', nuevo: false, tipo: 'FALLA' });
  });

  it('si el aviso vivo decía que funcionaba y ahora está fuera de servicio, pasa a FALLA', async () => {
    const { s, incidencias } = build({ id: 'inc-vieja', code: 'INC-2026-0150', tipoAviso: 'CONDICION' });
    const r = await s.crear(fuera, 'tec');
    expect(incidencias.update).toHaveBeenCalledWith('inc-vieja', { tipoAviso: 'FALLA' });
    expect(r.aviso.tipo).toBe('FALLA');
  });

  it('si abrir el aviso falla, la inspección se queda y se dice', async () => {
    const { s, incidencias } = build(null);
    incidencias.create.mockRejectedValue(new Error('sin conexión'));
    const r = await s.crear(fuera, 'tec');
    expect(r.code).toBe('GRU-2026-0003');
    expect(r.aviso).toBeNull();
    expect(r.avisoError).toMatch(/Repórtalo a mano/);
  });
});
