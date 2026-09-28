jest.mock('@prisma/client', () => ({ PrismaClient: class {}, Prisma: {} }));

import { ForbiddenException } from '@nestjs/common';
import { ProcedimientosService } from '../src/modules/procedimientos/procedimientos.service';

/** BLOQUE 141 · la propuesta de mejora en PDF, para las tres áreas. */
describe('PDF de una propuesta de mejora', () => {
  const mejora = {
    id: 'm1', texto: 'Cambiar el conector antes de reiniciar el NVR', minutosReales: 25,
    estado: 'PROPUESTA', createdAt: new Date('2026-09-20'), decididaEn: null, motivoDecision: null,
    procedimiento: { titulo: 'Cámara sin imagen', pasos: ['Revisar PoE', 'Reiniciar'], minutosEstimados: 40, tipoActivo: 'CAMERA', marca: null, modelo: null },
    workOrder: { code: 'OM-2026-0101', activity: 'Sin imagen en el lecho' },
    propuestaPor: { id: 'tec', fullName: 'Técnico Uno' },
    decididaPor: null,
  };
  function build() {
    const prisma: any = { mejoraProcedimiento: { findUnique: jest.fn().mockResolvedValue(mejora) } };
    const audit: any = { record: jest.fn().mockResolvedValue(undefined) };
    return { service: new ProcedimientosService(prisma, audit, {} as any), audit };
  }

  it('quien la propuso la saca, y es un PDF de verdad', async () => {
    const { service, audit } = build();
    const r = await service.pdfDeMejora('m1', 'tec', []);
    expect(r.buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(r.filename).toMatch(/^mejora-/);
    expect(audit.record.mock.calls[0][0].action).toBe('MEJORA_PDF');
  });

  it('quien decide (procedimiento.manage) también', async () => {
    const r = await build().service.pdfDeMejora('m1', 'jefe', ['procedimiento.manage']);
    expect(r.buffer.length).toBeGreaterThan(1000);
  });

  it('un tercero, no: dice quién propuso qué', async () => {
    await expect(build().service.pdfDeMejora('m1', 'otro', ['wo.read'])).rejects.toBeInstanceOf(ForbiddenException);
  });
});
