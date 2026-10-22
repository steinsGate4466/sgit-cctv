// Prueba UNITARIA: Prisma se sustituye por un doble.
jest.mock('@prisma/client', () => ({ PrismaClient: class {}, Prisma: {} }));
jest.mock('argon2', () => ({ verify: jest.fn(async (_h: string, p: string) => p === 'correcta') }));

import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import * as ts from 'typescript';
import {
  RESPUESTA_DEL_AVISO, SOLO_FALLAS, TIPOS_DE_AVISO, cuentaComoFalla, motivoNumeroSapInvalido,
  motivoSinOmSap, normalizarNumeroSap, textoBreveParaSap, tipoDeAviso, tipoDeOrdenSugerido,
} from '../src/common/aviso-sap';
import { computeEffectiveStatuses } from '../src/common/asset-status';
import { IncidentsService } from '../src/modules/incidents/incidents.service';
import { MaintenanceService } from '../src/modules/maintenance/maintenance.service';

/* =============================================================================
   BLOQUE 180 · EL AVISO Y LA ORDEN, COMO EN SAP
   -----------------------------------------------------------------------------
   Decisiones de Cristhian (22/10/2026, claude/DISENO-AVISO-OM-SAP.md):
   1. Una incidencia no siempre es un correctivo: «¿el equipo funciona?».
      Sólo la FALLA cuenta en MTBF/MTTR y quita servicio.
   2. La OM la crea SAP. «Primero el N° SAP»: sin él no se abre, ni avanza,
      ni saca material, ni se cierra.
   3. El tipo de orden lo PROPONE el aviso y lo DECIDE quien la trata.
============================================================================= */

const raiz = path.join(__dirname, '..');
const leer = (f: string) => fs.readFileSync(path.join(raiz, f), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');

describe('1 · «¿el equipo funciona?» — reglas puras', () => {
  it('sin tipo (lo de antes del bloque 180) se lee como FALLA', () => {
    expect(tipoDeAviso(null)).toBe('FALLA');
    expect(tipoDeAviso(undefined)).toBe('FALLA');
    expect(cuentaComoFalla(null)).toBe(true);
  });
  it('sólo la falla cuenta como falla', () => {
    expect(cuentaComoFalla('FALLA')).toBe(true);
    expect(cuentaComoFalla('CONDICION')).toBe(false);
    expect(cuentaComoFalla('SOLICITUD')).toBe(false);
  });
  it('el aviso PROPONE el tipo de orden: no un correctivo para todo', () => {
    expect(tipoDeOrdenSugerido('FALLA')).toBe('CORRECTIVO');
    expect(tipoDeOrdenSugerido('CONDICION')).toBe('PREVENTIVO');
    expect(tipoDeOrdenSugerido('SOLICITUD')).toBe('MEJORA');
  });
  it('el filtro de fallas INCLUYE el histórico sin tipo (NULL)', () => {
    /* `not: 'SOLICITUD'` dejaría fuera los NULL en SQL: el MTBF de todo el
       histórico caería de golpe. */
    expect(SOLO_FALLAS).toEqual({ OR: [{ tipoAviso: null }, { tipoAviso: 'FALLA' }] });
  });
});

describe('2 · el N° de SAP, como lo enseña SAP', () => {
  it('sin espacios, en mayúsculas y sin ceros delante', () => {
    expect(normalizarNumeroSap('  010000261278 ')).toBe('10000261278');
    expect(normalizarNumeroSap('4000 123 456')).toBe('4000123456');
    expect(normalizarNumeroSap('')).toBeNull();
    expect(normalizarNumeroSap(null)).toBeNull();
  });
  it('rechaza lo que SAP no enseñaría, diciendo por qué', () => {
    expect(motivoNumeroSapInvalido('10000261278')).toBeNull();
    expect(motivoNumeroSapInvalido('SAP-4711')).toMatch(/cifras/);
    expect(motivoNumeroSapInvalido('12')).toMatch(/entre 4 y 12/);
    expect(motivoNumeroSapInvalido('1234567890123')).toMatch(/entre 4 y 12/);
  });
  it('el texto breve del aviso cabe en los 40 de SAP y se corta por palabras', () => {
    const t = textoBreveParaSap('Revisión de cámaras CCTV de la grúa G1 lado sur con soporte flojo');
    expect(t.length).toBeLessThanOrEqual(40);
    expect(t.endsWith(' ')).toBe(false);
    expect(textoBreveParaSap('REVISION DE CAMARAS CCTV GRUA G1')).toBe('REVISION DE CAMARAS CCTV GRUA G1');
  });
  it('sin N° SAP se dice qué no se puede y quién lo apunta', () => {
    expect(motivoSinOmSap({ code: 'OM-2026-0001', externalRef: '4000123456' }, 'abre')).toBeNull();
    const m = motivoSinOmSap({ code: 'OM-2026-0001', externalRef: null }, 'abre');
    expect(m).toMatch(/OM-2026-0001/);
    expect(m).toMatch(/no se abre/);
    expect(m).toMatch(/Producción o el Jefe/);
  });
});

describe('3 · la pantalla pregunta con las mismas palabras que el servidor', () => {
  /* El espejo de la pantalla se EJECUTA aquí: si uno cambia y el otro no, la
     pantalla avisaría de una cosa y el servidor haría otra. */
  const fuente = fs.readFileSync(path.join(raiz, '..', 'frontend', 'src', 'avisoSap.ts'), 'utf8');
  const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const modulo: any = { exports: {} };
  vm.runInNewContext(js, { module: modulo, exports: modulo.exports });
  const front = modulo.exports;

  it('mismos tipos y mismas respuestas', () => {
    expect([...front.TIPOS_DE_AVISO]).toEqual([...TIPOS_DE_AVISO]);
    expect(front.RESPUESTA_DEL_AVISO).toEqual(RESPUESTA_DEL_AVISO);
    for (const t of [...TIPOS_DE_AVISO, null]) expect(front.tipoDeOrdenSugerido(t)).toBe(tipoDeOrdenSugerido(t));
  });
  it('misma normalización y mismos motivos de rechazo', () => {
    for (const x of ['  010000261278 ', '4000 123', 'SAP-4711', '12', 'abc123', '', '000000004711']) {
      expect(front.normalizarNumeroSap(x)).toBe(normalizarNumeroSap(x));
      const n = normalizarNumeroSap(x);
      if (n) expect(front.motivoNumeroSapInvalido(n)).toBe(motivoNumeroSapInvalido(n));
    }
  });
});

describe('4 · el estado del equipo sólo lo cambia una FALLA', () => {
  const prisma = (incidents: any[]) => ({
    workOrder: { findMany: jest.fn().mockResolvedValue([]) },
    incident: { findMany: jest.fn().mockResolvedValue(incidents) },
  }) as any;

  it('una condición de zona crítica NO pinta «fuera de servicio»: funciona', async () => {
    const r = await computeEffectiveStatuses(prisma([{ assetId: 'a1', priority: 'CRITICA', tipoAviso: 'CONDICION' }]),
      [{ id: 'a1', status: 'OPERATIVO' }]);
    expect(r.a1).toBe('OPERATIVO');
  });
  it('un pedido o cambio tampoco', async () => {
    const r = await computeEffectiveStatuses(prisma([{ assetId: 'a1', priority: 'ALTA', tipoAviso: 'SOLICITUD' }]),
      [{ id: 'a1', status: 'OPERATIVO' }]);
    expect(r.a1).toBe('OPERATIVO');
  });
  it('la falla sí, como siempre', async () => {
    const r = await computeEffectiveStatuses(prisma([{ assetId: 'a1', priority: 'ALTA', tipoAviso: 'FALLA' }]),
      [{ id: 'a1', status: 'OPERATIVO' }]);
    expect(r.a1).toBe('FUERA_SERVICIO');
  });
});

describe('5 · el aviso y su evento de falla', () => {
  function incidencias(over: any = {}) {
    const creadas: any[] = [];
    const eventos: any[] = [];
    const cambios: any[] = [];
    const prisma: any = {
      user: { findUnique: jest.fn().mockResolvedValue({ ambitoTrenes: [], role: { exigeAmbito: false } }) },
      location: { findMany: jest.fn().mockResolvedValue([]) },
      asset: { findUnique: jest.fn().mockResolvedValue({ id: 'a1', locationId: null, referencePlace: 'Lecho' }) },
      incident: {
        findFirst: jest.fn().mockResolvedValue(over.otraConElAviso ?? null),
        findUnique: jest.fn().mockResolvedValue(over.actual ?? null),
        create: jest.fn().mockImplementation(({ data }: any) => {
          creadas.push(data);
          return Promise.resolve({ id: 'i1', ...data, reportedAt: new Date(), occurredAt: null });
        }),
        update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'i1', ...over.actual, ...data })),
      },
      failureEvent: {
        create: jest.fn().mockImplementation(({ data }: any) => { eventos.push(data); return Promise.resolve({}); }),
        findUnique: jest.fn().mockResolvedValue(over.evento ?? null),
        update: jest.fn().mockImplementation((a: any) => { cambios.push(a); return Promise.resolve({}); }),
      },
    };
    const audit: any = { record: jest.fn().mockResolvedValue(undefined) };
    const avisos: any = { destinatarios: jest.fn().mockResolvedValue([]), encolar: jest.fn().mockResolvedValue(0) };
    return { s: new IncidentsService(prisma, audit, {} as any, avisos), prisma, creadas, eventos, cambios, audit };
  }

  it('«no funciona»: nace el evento de falla', async () => {
    const { s, creadas, eventos } = incidencias();
    await s.create({ title: 'Sin imagen', assetId: 'a1', tipoAviso: 'FALLA' } as any, 'u1');
    expect(creadas[0].tipoAviso).toBe('FALLA');
    expect(eventos).toHaveLength(1);
  });
  it('«funciona, pero se va a dañar»: NO hay evento de falla', async () => {
    const { s, creadas, eventos } = incidencias();
    await s.create({ title: 'Gabinete destrozado', assetId: 'a1', tipoAviso: 'CONDICION' } as any, 'u1');
    expect(creadas[0].tipoAviso).toBe('CONDICION');
    expect(eventos).toHaveLength(0);
  });
  it('sin contestar vale FALLA, como antes del bloque', async () => {
    const { s, creadas, eventos } = incidencias();
    await s.create({ title: 'Sin imagen', assetId: 'a1' } as any, 'u1');
    expect(creadas[0].tipoAviso).toBe('FALLA');
    expect(eventos).toHaveLength(1);
  });
  it('el N° de aviso SAP se guarda como lo enseña SAP; si ya está en otra, se AVISA', async () => {
    const { s, creadas } = incidencias({ otraConElAviso: { code: 'INC-2026-0009' } });
    const r: any = await s.create({ title: 'Sin imagen', assetId: 'a1', avisoSap: ' 010000261278 ' } as any, 'u1');
    expect(creadas[0].avisoSap).toBe('10000261278');
    expect(r.avisoSapRepetido).toMatch(/INC-2026-0009/);
  });
  it('reclasificar a condición apaga el evento SIN borrarlo, con su motivo', async () => {
    const actual = { id: 'i1', code: 'INC-1', assetId: 'a1', tipoAviso: 'FALLA', reportedAt: new Date(), occurredAt: null, resolvedAt: null, category: 'GENERAL', reportedById: 'u1' };
    const { s, prisma, cambios } = incidencias({ actual, evento: { id: 'e1', assetId: 'a1', esFalsaAlarma: false, notaFalsaAlarma: null } });
    prisma.incident.findUnique.mockImplementation(() => Promise.resolve({ ...actual, tipoAviso: 'CONDICION' }));
    prisma.incident.findUnique.mockImplementationOnce(() => Promise.resolve(actual));
    await s.update('i1', { tipoAviso: 'CONDICION' } as any);
    expect(cambios[0].data.esFalsaAlarma).toBe(true);
    expect(cambios[0].data.notaFalsaAlarma).toMatch(/Reclasificado/);
    expect(prisma.failureEvent.create).not.toHaveBeenCalled();
  });
  it('el PATCH general no toca el N° de aviso SAP: tiene su puerta', async () => {
    const { s } = incidencias({ actual: { id: 'i1', tipoAviso: 'FALLA' } });
    await expect(s.update('i1', { avisoSap: '10000261278' } as any)).rejects.toThrow(/Aviso SAP/);
  });
  it('apuntar el aviso SAP: quien reporta lo apunta si falta; cambiarlo es de Mantenimiento', async () => {
    const a = incidencias({ actual: { id: 'i1', code: 'INC-1', avisoSap: null } });
    a.prisma.incident.update.mockResolvedValue({ id: 'i1', code: 'INC-1', avisoSap: '10000261278' });
    await expect(a.s.registrarAvisoSap('i1', '10000261278', 'u-prod', false)).resolves.toMatchObject({ avisoSap: '10000261278' });
    const b = incidencias({ actual: { id: 'i1', code: 'INC-1', avisoSap: '10000261278' } });
    await expect(b.s.registrarAvisoSap('i1', '10000999999', 'u-prod', false)).rejects.toThrow(/Mantenimiento/);
    expect(b.prisma.incident.update).not.toHaveBeenCalled();
  });
  it('la puerta de Producción también marca FALLA y crea su evento', () => {
    const svc = leer('src/modules/incidents/incidents.service.ts');
    const prod = svc.slice(svc.indexOf('async reportarDesdeProduccion('), svc.indexOf('async findAll('));
    expect(prod).toContain("tipoAviso: 'FALLA'");
    expect(prod).toContain('failureEvent.create');
  });
});

describe('6 · «primero el N° SAP» en la orden', () => {
  function ordenes(wo: any, permisos = ['wo.update', 'wo.approve']) {
    const prisma: any = {
      workOrder: {
        findUnique: jest.fn().mockResolvedValue(wo),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: wo?.id, code: wo?.code, ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u1', active: true, passwordHash: 'h',
          role: { name: 'Técnico de Red', permissions: permisos.map((code) => ({ permission: { code } })) },
        }),
      },
    };
    const audit: any = { record: jest.fn().mockResolvedValue(undefined) };
    return { s: new MaintenanceService(prisma, audit, {} as any, {} as any, {} as any), prisma, audit };
  }
  const sinSap = { id: 'w1', code: 'OM-2026-0001', status: 'ABIERTA', startedAt: null, externalRef: null, progressPct: 0, type: 'CORRECTIVO' };

  it('sin N° SAP no se abre, y se dice ANTES de pedir la firma', async () => {
    const { s, prisma } = ordenes(sinSap);
    await expect(s.openSigned('w1', { email: 'x', password: 'correcta', seguridad: [] } as any)).rejects.toThrow(/no se abre/);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
  it('sin N° SAP no se anota avance ni se cierra', async () => {
    const a = ordenes(sinSap);
    await expect(a.s.addProgress('w1', { pct: 50 } as any, 'u1')).rejects.toThrow(/no se anota avance/);
    const b = ordenes({ ...sinSap, status: 'EN_PROCESO' });
    await expect(b.s.closeSigned('w1', { email: 'x', password: 'correcta' } as any)).rejects.toThrow(/no se cierra/);
  });
  it('ni se pone en proceso por el PATCH, ni el PATCH toca el N° SAP', async () => {
    const a = ordenes(sinSap);
    await expect(a.s.update('w1', { status: 'EN_PROCESO' } as any)).rejects.toThrow(/no se pone en proceso/);
    const b = ordenes({ ...sinSap, externalRef: '4000123456' });
    await expect(b.s.update('w1', { externalRef: '4000999999' } as any)).rejects.toThrow(/N° SAP/);
  });
  it('apuntarlo: con wo.create si falta; cambiarlo, sólo con wo.approve', async () => {
    const a = ordenes(sinSap);
    await expect(a.s.registrarNumeroSap('w1', ' 04000123456 ', 'u1', false)).resolves.toMatchObject({ externalRef: '4000123456' });
    const b = ordenes({ ...sinSap, externalRef: '4000123456' });
    await expect(b.s.registrarNumeroSap('w1', '4000999999', 'u1', false)).rejects.toThrow(/Jefe de Mantenimiento/);
    const c = ordenes({ ...sinSap, status: 'CERRADA', externalRef: null });
    await expect(c.s.registrarNumeroSap('w1', '4000123456', 'u1', true)).rejects.toThrow(/cerrada/);
  });
  it('el material no sale del almacén sin la OM de SAP', () => {
    const prep = leer('src/modules/maintenance/preparacion.service.ts');
    const retiro = prep.slice(prep.indexOf('async generarRetiro('), prep.indexOf('async rechazarMaterial('));
    expect(retiro).toContain("motivoSinOmSap(wo, 'saca material del almacén')");
  });
  it('la puerta del N° SAP pide wo.create o wo.approve, con ámbito', () => {
    const ctrl = leer('src/modules/maintenance/maintenance.controller.ts');
    expect(ctrl).toMatch(/@AmbitoDe\('workOrder'\)\s*@Patch\(':id\/sap'\)\s*@RequireAlguno\('wo\.create', 'wo\.approve'\)/);
  });
});

describe('7 · el tipo lo propone el aviso y lo decide quien trata la orden', () => {
  it('convertir un aviso usa la sugerencia, no un correctivo fijo', () => {
    const svc = leer('src/modules/maintenance/maintenance.service.ts');
    const d = svc.slice(svc.indexOf('async desdeIncidencia('));
    expect(d).toContain('tipoDeOrdenSugerido(incidencia.tipoAviso)');
    expect(d).not.toContain("dto?.type || 'CORRECTIVO'");
  });
  it('la pantalla vuelve a enseñar el tipo al convertir (revertido el 21/10)', () => {
    const f = fs.readFileSync(path.join(raiz, '..', 'frontend', 'src', 'components', 'AsignarOm.tsx'), 'utf8');
    expect(f).toContain('tipoDeOrdenSugerido(incidente.tipoAviso)');
    expect(f).not.toMatch(/\{!incidente && \(\s*<label>Tipo de trabajo/);
  });
  it('la instalación tiene tipo propio y queda fuera del reparto', () => {
    expect(leer('src/modules/instalacion/instalacion.service.ts')).toContain("type: 'INSTALACION'");
    expect(leer('src/modules/indicadores/calculo.ts')).toContain("instalacion: cuenta('INSTALACION')");
  });
});
