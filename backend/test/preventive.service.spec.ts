// Prueba UNITARIA: no debe depender del cliente Prisma generado (`prisma generate`).
// Se sustituye por un doble; la base de datos se simula en cada caso.
jest.mock('@prisma/client', () => ({ PrismaClient: class {}, Prisma: {} }));

import * as fs from 'fs';
import * as path from 'path';
import { PreventiveService } from '../src/modules/preventive/preventive.service';

/**
 * BLOQUE 180 · EL PREVENTIVO PROGRAMA Y VINCULA. NO CREA ÓRDENES SOLO.
 *
 * Decisión 3 de Cristhian (22/10/2026): la OM de una rutina la genera SAP
 * —plan + hoja de ruta— y aquí se VINCULA. Hasta el bloque 179 este servicio
 * creaba preventivas cada madrugada con número propio: dos órdenes para el
 * mismo trabajo. Las reglas de negocio de la generación (sólo PREVENTIVO, no
 * duplicar, fecha real de vencimiento, zona, fuera BAJA/STOCK, auditoría) se
 * conservan: ahora las cumple el VÍNCULO, que es el único que crea.
 */
const plan = (over: any = {}) => ({
  id: 'p1',
  assetId: 'a1',
  intervalDays: 30,
  zoneCritical: true,
  active: true,
  nextDueAt: new Date('2026-07-01T08:00:00Z'),
  asset: {
    id: 'a1',
    assetCode: 'AA-CAM-T1-FX-001',
    type: 'CAMERA',
    status: 'OPERATIVO',
    deletedAt: null,
    locationId: null,
    location: { name: 'Tren 1 (Laminación)' },
    cabinet: null,
    ...(over.asset || {}),
  },
  ...over,
});

/** Prisma simulado. `viva` = la preventiva viva que ya tiene el equipo; `otra` = otra orden con ese N° SAP. */
function build(opts: { planes?: any[]; plan?: any; viva?: any; otra?: any; abiertas?: any[] } = {}) {
  const created: any[] = [];
  const updated: any[] = [];
  const prisma: any = {
    preventivePlan: {
      findMany: jest.fn().mockResolvedValue(opts.planes ?? []),
      findUnique: jest.fn().mockResolvedValue(opts.plan === undefined ? plan() : opts.plan),
    },
    workOrder: {
      findMany: jest.fn().mockResolvedValue(opts.abiertas ?? []),
      findFirst: jest.fn().mockImplementation((args: any) => {
        if (args?.where?.code) return Promise.resolve(null); // no hay códigos previos del año
        if (args?.where?.externalRef) return Promise.resolve(opts.otra ?? null);
        return Promise.resolve(opts.viva ?? null);
      }),
      create: jest.fn().mockImplementation(({ data }: any) => {
        created.push(data);
        return Promise.resolve({ id: 'w-nueva', code: data.code, externalRef: data.externalRef });
      }),
      update: jest.fn().mockImplementation(({ where, data }: any) => {
        updated.push({ where, data });
        return Promise.resolve({ id: where.id, code: opts.viva?.code, externalRef: data.externalRef });
      }),
    },
    /* El programa consulta ventanas, hojas y árbol para PROGRAMAR de verdad
       (bloque 78). Vacías a propósito: aquí se fijan las reglas del vínculo;
       la programación tiene sus pruebas en `programacion-preventiva.spec`. */
    ventanaParada: { findMany: jest.fn().mockResolvedValue([]) },
    hojaDeRuta: { findMany: jest.fn().mockResolvedValue([]) },
    location: { findMany: jest.fn().mockResolvedValue([]) },
    asset: { findMany: jest.fn().mockResolvedValue([]) },
    processStage: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const audit: any = { record: jest.fn().mockResolvedValue(undefined) };
  const criticidad: any = { resumen: jest.fn().mockResolvedValue({ equipos: [] }) };
  return { service: new PreventiveService(prisma, audit, criticidad), prisma, audit, created, updated };
}

describe('PreventiveService — el PROGRAMA no crea nada', () => {
  it('dice qué rutina toca y NO crea ni modifica órdenes', async () => {
    const { service, prisma } = build({ planes: [plan()] });
    const r = await service.programa(30);
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0].assetCode).toBe('AA-CAM-T1-FX-001');
    expect(r.resumen.sinOm).toBe(1);
    expect(prisma.workOrder.create).not.toHaveBeenCalled();
    expect(prisma.workOrder.update).not.toHaveBeenCalled();
  });

  it('marca la rutina que ya tiene su OM, y si le falta el N° SAP', async () => {
    const { service } = build({
      planes: [plan(), plan({ id: 'p2', assetId: 'a2', asset: { id: 'a2', assetCode: 'AA-CAM-T1-FX-002' } })],
      abiertas: [{ id: 'w1', code: 'OM-2026-0001', externalRef: null, assetId: 'a2', status: 'ABIERTA' }],
    });
    const r = await service.programa(30);
    expect(r.resumen).toMatchObject({ tocan: 2, sinOm: 1, omSinSap: 1, vinculadas: 0 });
    expect(r.filas.find((f: any) => f.assetId === 'a2')!.orden).toMatchObject({ code: 'OM-2026-0001', externalRef: null });
  });

  it('excluye equipos fuera de operación (BAJA / STOCK / eliminados) y rutinas apagadas', async () => {
    const { service, prisma } = build();
    await service.programa(30);
    const filtro = prisma.preventivePlan.findMany.mock.calls[0][0].where;
    expect(filtro.active).toBe(true);
    expect(filtro.asset.deletedAt).toBeNull();
    expect(filtro.asset.status.notIn).toEqual(expect.arrayContaining(['BAJA', 'STOCK']));
  });

  it('el programa del día queda en la auditoría, sin crear órdenes', async () => {
    const { service, prisma, audit } = build({ planes: [plan()] });
    await service.programaDelDia('sistema (automático)');
    expect(prisma.workOrder.create).not.toHaveBeenCalled();
    const traza = audit.record.mock.calls[0][0];
    expect(traza.action).toBe('PREVENTIVE_PROGRAMA');
    expect(traza.after.equipos).toEqual(['AA-CAM-T1-FX-001']);
  });
});

describe('PreventiveService — VINCULAR la OM de SAP a su rutina', () => {
  it('crea SÓLO una PREVENTIVA, con el N° SAP como lo enseña SAP', async () => {
    const { service, created } = build();
    const r = await service.vincularSap('a1', ' 004000123456 ', 'u-jefe', 'ip');
    expect(r.creada).toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0].type).toBe('PREVENTIVO');
    expect(created[0].externalRef).toBe('4000123456');
    expect(created[0].status).toBe('ABIERTA');
    expect(created[0].assetId).toBe('a1');
    expect(created[0].code).toMatch(/^OM-\d{4}-\d{4}$/);
    expect(created[0].createdById).toBe('u-jefe');
  });

  it('la programa en la fecha real de vencimiento (no "hoy")', async () => {
    const vence = new Date('2026-06-15T08:00:00Z');
    const { service, created } = build({ plan: plan({ nextDueAt: vence }) });
    await service.vincularSap('a1', '4000123456', 'u1');
    expect(created[0].scheduledDate).toEqual(vence);
  });

  it('hereda la zona del activo, con su gabinete si lo tiene', async () => {
    const a = build();
    await a.service.vincularSap('a1', '4000123456', 'u1');
    expect(a.created[0].zone).toBe('Tren 1 (Laminación)');
    const b = build({ plan: plan({ asset: { cabinet: { code: 'GAB-T1-R01' } } }) });
    await b.service.vincularSap('a1', '4000123456', 'u1');
    expect(b.created[0].zone).toContain('GAB-T1-R01');
  });

  it('NO duplica: si ya hay una preventiva viva sin N° SAP, se le pone a ésa', async () => {
    const { service, created, updated } = build({ viva: { id: 'w-vieja', code: 'OM-2026-0007', externalRef: null } });
    const r = await service.vincularSap('a1', '4000123456', 'u1');
    expect(created).toHaveLength(0);
    expect(updated[0]).toEqual({ where: { id: 'w-vieja' }, data: { externalRef: '4000123456' } });
    expect(r.creada).toBe(false);
  });

  it('si la preventiva viva ya tiene OTRO N° SAP, no crea otra: dice cuál es', async () => {
    const { service, created } = build({ viva: { id: 'w1', code: 'OM-2026-0007', externalRef: '4000999999' } });
    await expect(service.vincularSap('a1', '4000123456', 'u1')).rejects.toThrow(/OM-2026-0007.*4000999999/);
    expect(created).toHaveLength(0);
  });

  it('un N° SAP que ya está en otra orden se AVISA, no se impide', async () => {
    const { service, created } = build({ otra: { code: 'OM-2026-0042' } });
    const r = await service.vincularSap('a1', '4000123456', 'u1');
    expect(created).toHaveLength(1);
    expect(r.aviso).toMatch(/OM-2026-0042/);
  });

  it('sin número, o con un número que SAP no enseñaría, se rechaza diciendo por qué', async () => {
    const { service, created } = build();
    await expect(service.vincularSap('a1', '  ', 'u1')).rejects.toThrow(/N° de la OM/);
    await expect(service.vincularSap('a1', '4000-123', 'u1')).rejects.toThrow(/cifras/);
    expect(created).toHaveLength(0);
  });

  it('una rutina apagada o un equipo de baja no se vinculan', async () => {
    const a = build({ plan: plan({ active: false }) });
    await expect(a.service.vincularSap('a1', '4000123456', 'u1')).rejects.toThrow(/desactivada/);
    const b = build({ plan: plan({ asset: { status: 'BAJA' } }) });
    await expect(b.service.vincularSap('a1', '4000123456', 'u1')).rejects.toThrow(/no está en operación/);
    const c = build({ plan: null });
    await expect(c.service.vincularSap('a1', '4000123456', 'u1')).rejects.toThrow(/no tiene rutina/);
  });

  it('deja traza de auditoría de quién vinculó qué', async () => {
    const { service, audit } = build();
    await service.vincularSap('a1', '4000123456', 'u-jefe', 'ip');
    const traza = audit.record.mock.calls[0][0];
    expect(traza.action).toBe('PREVENTIVE_VINCULAR_SAP');
    expect(traza.userId).toBe('u-jefe');
    expect(traza.after).toMatchObject({ externalRef: '4000123456', creada: true });
  });
});

describe('Bloque 180 · la generación automática se retiró de verdad', () => {
  /* Las pruebas leen el CÓDIGO: el fallo típico sería volver a enchufar la
     generación «un momento» desde el planificador o desde un botón. */
  const leer = (f: string) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');

  it('el servicio ya no tiene `generateDue`', () => {
    expect(leer('src/modules/preventive/preventive.service.ts')).not.toContain('generateDue');
  });
  it('el planificador sólo documenta el programa del día', () => {
    const f = leer('src/modules/preventive/preventive.scheduler.ts');
    expect(f).toContain('programaDelDia');
    expect(f).not.toContain('workOrder.create');
  });
  it('no queda ruta que genere: ni `generate` ni `autogen`', () => {
    const c = leer('src/modules/preventive/preventive.controller.ts');
    expect(c).not.toMatch(/@Post\('generate'\)/);
    expect(c).not.toMatch(/@Post\('autogen'\)/);
    expect(c).toMatch(/@Post\('activo\/:assetId\/vincular-sap'\)\s*@RequirePermissions\('wo\.approve'\)/);
  });
});
