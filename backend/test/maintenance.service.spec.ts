// Prueba UNITARIA: no depende del cliente Prisma generado.
jest.mock('@prisma/client', () => ({ PrismaClient: class {}, Prisma: {} }));
// argon2 se sustituye: la firma es válida cuando la contraseña es 'correcta'.
jest.mock('argon2', () => ({
  verify: jest.fn(async (_hash: string, pass: string) => pass === 'correcta'),
}));

import { MaintenanceService } from '../src/modules/maintenance/maintenance.service';

/**
 * Camino crítico del Bloque 1: la ejecución de la OM en campo.
 * Es el único registro escrito de lo que pasó en planta; si acepta datos
 * imposibles, el análisis posterior de reincidencia no vale nada.
 */
describe('MaintenanceService — ejecución de OM en campo', () => {
  const USUARIO = (rol: string, id = 'u1') => ({
    id, email: 'tec@aa.local', active: true,
    passwordHash: 'hash', role: { name: rol },
  });

  function build(over: any = {}) {
    const prisma: any = {
      workOrder: {
        findUnique: jest.fn().mockResolvedValue(over.wo ?? null),
        findFirst: jest.fn().mockResolvedValue(over.ultimaOm ?? null),
        create: jest.fn().mockImplementation(({ data }: any) => ({ id: 'w1', ...data })),
        update: jest.fn().mockImplementation(({ data }: any) => ({
          id: 'w1', ...(over.wo || {}), ...data,
        })),
      },
      user: { findUnique: jest.fn().mockResolvedValue(over.usuario ?? USUARIO('Técnico de Red')) },
      workOrderProgress: {
        create: jest.fn().mockImplementation(({ data }: any) => ({ id: 'p1', ...data })),
        findMany: jest.fn().mockResolvedValue(over.avances ?? []),
      },
      // $transaction recibe un arreglo de promesas ya construidas.
      $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
    };
    const audit = { record: jest.fn().mockResolvedValue(null) };
    const preventive = { markServiced: jest.fn().mockResolvedValue(null) };
    const svc = new MaintenanceService(prisma, audit as any, {} as any, preventive as any);
    return { svc, prisma, audit };
  }

  // --------------------------------------------------- correlativo por año
  describe('correlativo del código', () => {
    it('parte de 0001 cuando no hay órdenes del año', async () => {
      const { svc, prisma } = build({ ultimaOm: null });
      await svc.create({ type: 'MAPEO', locationId: 'loc1' } as any);
      const code = prisma.workOrder.create.mock.calls[0][0].data.code;
      expect(code).toMatch(/^OM-\d{4}-0001$/);
    });

    it('toma el MAYOR correlativo del año, no la cantidad de órdenes', async () => {
      // Defecto anterior: contaba todas las órdenes de la historia. Si había 50
      // de años previos, la primera de este año salía 0051 y podía chocar.
      const year = new Date().getFullYear();
      const { svc, prisma } = build({ ultimaOm: { code: `OM-${year}-0042` } });
      await svc.create({ type: 'CORRECTIVO', assetId: 'a1' } as any);
      expect(prisma.workOrder.create.mock.calls[0][0].data.code).toBe(`OM-${year}-0043`);
    });

    it('respeta el código manual si lo envían (viene de SAP)', async () => {
      const { svc, prisma } = build();
      await svc.create({ type: 'CORRECTIVO', assetId: 'a1', code: 'OM-SAP-999' } as any);
      expect(prisma.workOrder.create.mock.calls[0][0].data.code).toBe('OM-SAP-999');
    });
  });

  // ------------------------------------------------------------ alta de OM
  describe('alta', () => {
    it('rechaza una orden sin activo ni ubicación', async () => {
      const { svc } = build();
      // Sin ninguno de los dos, el técnico no sabe a dónde ir.
      await expect(svc.create({ type: 'CORRECTIVO' } as any)).rejects.toThrow(/activo o la ubicación/i);
    });

    it('acepta una orden de MAPEO con solo ubicación', async () => {
      const { svc, prisma } = build();
      await svc.create({ type: 'MAPEO', locationId: 'loc1' } as any);
      const data = prisma.workOrder.create.mock.calls[0][0].data;
      expect(data.locationId).toBe('loc1');
      expect(data.assetId).toBeUndefined();
    });

    it('guarda la recepción de Producción y la parada estimada', async () => {
      const { svc, prisma } = build();
      await svc.create({
        type: 'CORRECTIVO', assetId: 'a1',
        requestedBy: 'Ing. Producción', requestChannel: 'WHATSAPP',
        externalRef: 'SAP-4711', plannedStopAt: '2026-07-30T14:00:00Z',
      } as any);
      const d = prisma.workOrder.create.mock.calls[0][0].data;
      expect(d.requestedBy).toBe('Ing. Producción');
      expect(d.requestChannel).toBe('WHATSAPP');
      expect(d.externalRef).toBe('SAP-4711');
      expect(d.plannedStopAt).toBeInstanceOf(Date);
    });
  });

  // ------------------------------------------------------------- apertura
  describe('apertura en campo', () => {
    const abierta = { id: 'w1', code: 'OM-2026-0001', type: 'CORRECTIVO', status: 'ABIERTA', startedAt: null };

    it('registra inicio real, firmante y acompañante', async () => {
      const { svc, prisma } = build({ wo: abierta });
      await svc.openSigned('w1', {
        email: 'tec@aa.local', password: 'correcta', companionId: 'u2',
      } as any);
      const d = prisma.workOrder.update.mock.calls[0][0].data;
      expect(d.status).toBe('EN_PROCESO');
      expect(d.openedById).toBe('u1');
      expect(d.companionId).toBe('u2');
      expect(d.startedAt).toBeInstanceOf(Date);
    });

    it('rechaza la firma con contraseña incorrecta y lo deja auditado', async () => {
      const { svc, audit } = build({ wo: abierta });
      await expect(svc.openSigned('w1', { email: 'tec@aa.local', password: 'mala' } as any))
        .rejects.toThrow(/firma inválida/i);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'FIRMA_FALLIDA' }),
      );
    });

    it('no permite abrir dos veces la misma orden', async () => {
      const { svc } = build({ wo: { ...abierta, startedAt: new Date('2026-07-29T08:00:00Z') } });
      await expect(svc.openSigned('w1', { email: 'tec@aa.local', password: 'correcta' } as any))
        .rejects.toThrow(/ya fue abierta/i);
    });

    it('no permite abrir una orden ya cerrada', async () => {
      const { svc } = build({ wo: { ...abierta, status: 'CERRADA' } });
      await expect(svc.openSigned('w1', { email: 'tec@aa.local', password: 'correcta' } as any))
        .rejects.toThrow(/ya está cerrada/i);
    });

    it('el acompañante no puede ser el mismo que firma', async () => {
      const { svc } = build({ wo: abierta });
      // Si van dos a campo, son dos personas.
      await expect(svc.openSigned('w1', {
        email: 'tec@aa.local', password: 'correcta', companionId: 'u1',
      } as any)).rejects.toThrow(/persona distinta/i);
    });

    it('un Técnico eléctrico NO puede abrir una orden de mapeo', async () => {
      const { svc } = build({
        wo: { ...abierta, type: 'MAPEO' },
        usuario: USUARIO('Técnico'),
      });
      await expect(svc.openSigned('w1', { email: 'tec@aa.local', password: 'correcta' } as any))
        .rejects.toThrow(/mapeo/i);
    });

    it('el Técnico de Red sí puede abrir una orden de mapeo', async () => {
      const { svc, prisma } = build({
        wo: { ...abierta, type: 'MAPEO' },
        usuario: USUARIO('Técnico de Red'),
      });
      await svc.openSigned('w1', { email: 'tec@aa.local', password: 'correcta' } as any);
      expect(prisma.workOrder.update).toHaveBeenCalled();
    });

    it('un Técnico eléctrico SÍ puede abrir una correctiva', async () => {
      const { svc, prisma } = build({ wo: abierta, usuario: USUARIO('Técnico') });
      await svc.openSigned('w1', { email: 'tec@aa.local', password: 'correcta' } as any);
      expect(prisma.workOrder.update).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------- avance
  describe('reporte de avance', () => {
    const enCurso = { id: 'w1', code: 'OM-2026-0001', status: 'ABIERTA', progressPct: 0 };

    it('guarda el avance y deja la orden EN PROCESO', async () => {
      const { svc, prisma } = build({ wo: enCurso });
      await svc.addProgress('w1', { pct: 30, note: 'la parada se acortó' } as any, 'u1');
      expect(prisma.workOrderProgress.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ pct: 30 }) }),
      );
      const d = prisma.workOrder.update.mock.calls[0][0].data;
      expect(d.progressPct).toBe(30);
      expect(d.status).toBe('EN_PROCESO');
    });

    it('acota el porcentaje entre 0 y 100', async () => {
      const { svc, prisma } = build({ wo: enCurso });
      await svc.addProgress('w1', { pct: 150 } as any, 'u1');
      expect(prisma.workOrder.update.mock.calls[0][0].data.progressPct).toBe(100);
    });

    it('no deja bajar el avance sin explicación', async () => {
      // Si el avance retrocede es porque apareció más trabajo del previsto:
      // eso hay que poder justificarlo ante el Jefe.
      const { svc } = build({ wo: { ...enCurso, progressPct: 60 } });
      await expect(svc.addProgress('w1', { pct: 40 } as any, 'u1'))
        .rejects.toThrow(/explica el motivo/i);
    });

    it('sí deja bajarlo si se explica', async () => {
      const { svc, prisma } = build({ wo: { ...enCurso, progressPct: 60 } });
      await svc.addProgress('w1', { pct: 40, note: 'se encontró otro tramo dañado' } as any, 'u1');
      expect(prisma.workOrder.update).toHaveBeenCalled();
    });

    it('no admite avance sobre una orden cerrada', async () => {
      const { svc } = build({ wo: { ...enCurso, status: 'CERRADA' } });
      await expect(svc.addProgress('w1', { pct: 80 } as any, 'u1'))
        .rejects.toThrow(/cerrada/i);
    });
  });

  // ------------------------------------------------------------ desviación
  describe('desviación de lo planificado', () => {
    it('calcula duración real, retraso de inicio y exceso', async () => {
      const d = MaintenanceService.calcularDesviacion({
        plannedStopAt: new Date('2026-07-29T08:00:00Z'),
        plannedDurationMin: 60,
        startedAt: new Date('2026-07-29T08:30:00Z'), // arrancó 30 min tarde
        endedAt: new Date('2026-07-29T10:00:00Z'),   // duró 90 min
      });
      expect(d.duracionRealMin).toBe(90);
      expect(d.retrasoInicioMin).toBe(30);
      expect(d.desviacionMin).toBe(30);   // 90 real - 60 estimado
      expect(d.desviacionPct).toBe(50);
    });

    it('devuelve null cuando falta el dato, no un cero', async () => {
      // Una desviación de 0 y "no se sabe" no son lo mismo: si se devolviera
      // cero, el informe diría que Producción estima perfecto.
      const d = MaintenanceService.calcularDesviacion({ startedAt: null, endedAt: null });
      expect(d.duracionRealMin).toBeNull();
      expect(d.desviacionMin).toBeNull();
      expect(d.desviacionPct).toBeNull();
    });

    it('si terminó antes de lo estimado, la desviación es negativa', async () => {
      const d = MaintenanceService.calcularDesviacion({
        plannedDurationMin: 120,
        startedAt: new Date('2026-07-29T08:00:00Z'),
        endedAt: new Date('2026-07-29T09:00:00Z'),
      });
      expect(d.desviacionMin).toBe(-60);
    });
  });

  // ---------------------------------------------------------------- cierre
  describe('cierre', () => {
    const enProceso = {
      id: 'w1', code: 'OM-2026-0001', type: 'CORRECTIVO', status: 'EN_PROCESO',
      startedAt: new Date('2026-07-29T08:00:00Z'), executedDate: null,
      technicianId: null, assetId: 'a1', diagnosis: null,
    };

    it('guarda causa, reincidencia y hora real de cierre', async () => {
      const { svc, prisma } = build({ wo: enProceso });
      await svc.closeSigned('w1', {
        email: 'tec@aa.local', password: 'correcta',
        rootCause: 'CABLE_FUERA_NORMA', isRecurrent: true,
        endedAt: '2026-07-29T09:30:00Z',
      } as any);
      const d = prisma.workOrder.update.mock.calls[0][0].data;
      expect(d.status).toBe('CERRADA');
      expect(d.rootCause).toBe('CABLE_FUERA_NORMA');
      expect(d.isRecurrent).toBe(true);
      expect(d.closedById).toBe('u1');
    });

    it('rechaza una hora de cierre anterior al inicio', async () => {
      const { svc } = build({ wo: enProceso });
      // Un dato imposible ensucia para siempre el cálculo de duración.
      await expect(svc.closeSigned('w1', {
        email: 'tec@aa.local', password: 'correcta',
        endedAt: '2026-07-29T07:00:00Z',
      } as any)).rejects.toThrow(/anterior a la de inicio/i);
    });

    it('deja la duración real en la auditoría', async () => {
      const { svc, audit } = build({ wo: enProceso });
      await svc.closeSigned('w1', {
        email: 'tec@aa.local', password: 'correcta',
        endedAt: '2026-07-29T09:30:00Z',
      } as any);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CLOSE_WO',
          after: expect.objectContaining({ duracionMinutos: 90 }),
        }),
      );
    });

    it('si se cierra sin haber abierto, no deja el inicio en blanco', async () => {
      const { svc, prisma } = build({ wo: { ...enProceso, startedAt: null } });
      await svc.closeSigned('w1', { email: 'tec@aa.local', password: 'correcta' } as any);
      expect(prisma.workOrder.update.mock.calls[0][0].data.startedAt).toBeTruthy();
    });
  });
});
