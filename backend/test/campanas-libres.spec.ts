/* Bloque 175 · campañas de cualquier tipo, planificables. */
import { CampanasService } from '../src/modules/campanas/campanas.service';
import {
  avanceDeMeta, claveDeTipo, esMapeo, estadoDelPlan, fechasMal, limpiarTipo, tipoCanonico,
} from '../src/modules/campanas/plan-de-campana';

const audit = { record: jest.fn().mockResolvedValue(undefined) };
function servicio(prisma: any) {
  return new CampanasService(prisma, audit as any);
}

describe('bloque 175 · el tipo es libre, pero uno solo por nombre', () => {
  it('las viejas sin tipo son de mapeo', () => {
    expect(esMapeo(null)).toBe(true);
    expect(esMapeo('Mapeo de antenas')).toBe(true);
    expect(esMapeo('Rotulado')).toBe(false);
    expect(esMapeo('Instalación')).toBe(false);
  });
  it('«rotulado» y «Rotulado» son el mismo tipo; se reutiliza como ya está escrito', () => {
    expect(claveDeTipo('  INSTALACIÓN ')).toBe('instalacion');
    expect(limpiarTipo('  rotulado   de  gabinetes')).toBe('Rotulado de gabinetes');
    expect(tipoCanonico('rotulado', ['Instalación', 'Rotulado'])).toBe('Rotulado');
    expect(tipoCanonico('instalacion', ['Instalación'])).toBe('Instalación');
    expect(tipoCanonico('limpieza de domos', ['Rotulado'])).toBe('Limpieza de domos');
  });
});

describe('bloque 175 · el plan', () => {
  const ahora = new Date('2026-10-18T15:00:00Z'); // 10:00 en planta
  it('fin antes del inicio no se acepta', () => {
    expect(fechasMal(new Date('2026-10-20'), new Date('2026-10-10'))).toMatch(/antes del inicio/);
    expect(fechasMal(new Date('2026-10-10'), new Date('2026-10-20'))).toBeNull();
    expect(fechasMal(null, null)).toBeNull();
  });
  it('el orden: aprobada gana, sin fin no se inventa plazo, lo de hoy no está atrasado', () => {
    const viejo = new Date('2026-10-01T05:00:00Z');
    expect(estadoDelPlan({ estado: 'APROBADA', inicioPrevisto: null, finPrevisto: viejo }, ahora)).toBe('TERMINADA');
    expect(estadoDelPlan({ estado: 'EN_CAMPO', inicioPrevisto: null, finPrevisto: null }, ahora)).toBe('SIN_PLAN');
    expect(estadoDelPlan({ estado: 'EN_CAMPO', inicioPrevisto: null, finPrevisto: viejo }, ahora)).toBe('ATRASADA');
    const hoy = new Date('2026-10-18T05:00:00Z');
    expect(estadoDelPlan({ estado: 'EN_CAMPO', inicioPrevisto: null, finPrevisto: hoy }, ahora)).toBe('EN_PLAZO');
    const futuro = new Date('2026-10-25T05:00:00Z');
    expect(estadoDelPlan({ estado: 'PENDIENTE', inicioPrevisto: futuro, finPrevisto: futuro }, ahora)).toBe('POR_EMPEZAR');
  });
  it('sin meta en alguna zona, el porcentaje no se inventa', () => {
    expect(avanceDeMeta([{ esperados: 10, hechos: 5 }, { esperados: 10, hechos: 10 }]).pct).toBe(75);
    const m = avanceDeMeta([{ esperados: 10, hechos: 5 }, { esperados: null, hechos: 3 }]);
    expect(m.pct).toBeNull();
    expect(m.sinMeta).toBe(1);
  });
});

describe('bloque 175 · reglas del servicio', () => {
  beforeEach(() => audit.record.mockClear());

  it('crear exige tipo y nombre, y reutiliza el tipo ya escrito', async () => {
    const create = jest.fn().mockImplementation(({ data }) => ({ id: 'c1', ...data }));
    const prisma: any = {
      campanaMapeo: {
        findFirst: jest.fn().mockResolvedValue(null),
        groupBy: jest.fn().mockResolvedValue([{ tipo: 'Rotulado', _count: { _all: 2 } }]),
        create,
      },
      user: { findFirst: jest.fn() },
    };
    const s = servicio(prisma);
    await expect(s.crear({ nombre: 'Campaña', tipo: '' })).rejects.toThrow(/de qué es la campaña/);
    await expect(s.crear({ nombre: 'ab', tipo: 'Rotulado' })).rejects.toThrow(/nombre/);
    await expect(s.crear({ nombre: 'Rotular T2', tipo: 'rotulado', inicioPrevisto: '2026-11-10', finPrevisto: '2026-11-01' }))
      .rejects.toThrow(/antes del inicio/);
    const c: any = await s.crear({ nombre: 'Rotular T2', tipo: 'ROTULADO', unidad: 'rótulos' });
    expect(c.tipo).toBe('Rotulado');
    expect(c.unidad).toBe('rótulos');
  });

  it('no se cierra con zonas sin aprobar; cancelar exige motivo', async () => {
    const prisma: any = {
      campanaMapeo: {
        findUnique: jest.fn().mockResolvedValue({ id: 'c1', estado: 'EN_CURSO', zonas: [{ estado: 'APROBADA' }, { estado: 'CARGADA' }] }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const s = servicio(prisma);
    await expect(s.editar('c1', { estado: 'CERRADA' })).rejects.toThrow(/1 zona\(s\) sin aprobar/);
    await expect(s.editar('c1', { estado: 'CANCELADA' })).rejects.toThrow(/por qué se cancela/);
    await s.editar('c1', { estado: 'CANCELADA', motivo: 'Se suspende por parada larga' });
    expect(prisma.campanaMapeo.update).toHaveBeenCalled();
  });

  it('en mapeo el avance NO se escribe: se cuenta', async () => {
    const prisma: any = {
      zonaCampana: {
        findUnique: jest.fn().mockResolvedValue({ id: 'z1', estado: 'EN_CAMPO', hechos: null, campana: { tipo: null, estado: 'EN_CURSO' } }),
        update: jest.fn(),
      },
    };
    await expect(servicio(prisma).anotarAvance('z1', 4, undefined)).rejects.toThrow(/se cuenta solo/);
    expect(prisma.zonaCampana.update).not.toHaveBeenCalled();
  });

  it('fuera del mapeo, se anota y la zona pasa a «en campo»', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma: any = {
      zonaCampana: {
        findUnique: jest.fn().mockResolvedValue({ id: 'z1', estado: 'PENDIENTE', hechos: null, campana: { tipo: 'Rotulado', estado: 'EN_CURSO' } }),
        update,
      },
    };
    await servicio(prisma).anotarAvance('z1', '7', undefined);
    expect(update.mock.calls[0][0].data).toMatchObject({ hechos: 7, estado: 'EN_CAMPO' });
    await expect(servicio(prisma).anotarAvance('z1', -1, undefined)).rejects.toThrow(/entero/);
  });

  it('fuera del mapeo, «terminé» sin número no se acepta, y se aprueba sólo lo que alguien dio por terminado', async () => {
    const zona = { id: 'z1', estado: 'EN_CAMPO', hechos: null, esperados: 10, campana: { tipo: 'Instalación', unidad: 'cámaras', estado: 'EN_CURSO' }, location: {} };
    const prisma: any = { zonaCampana: { findUnique: jest.fn().mockResolvedValue(zona), update: jest.fn() } };
    const s = servicio(prisma);
    await expect(s.marcarCargada('z1', 'u1')).rejects.toThrow(/cuánto se hizo/);
    const r: any = await s.revisarZona('z1');
    expect(r.esMapeo).toBe(false);
    expect(r.sePuedeAprobar).toBe(false);
    zona.estado = 'CARGADA'; (zona as any).hechos = 8;
    const r2: any = await s.revisarZona('z1');
    expect(r2.sePuedeAprobar).toBe(true);
    expect(r2.faltan).toBe(2);
  });

  it('quien cargó no revisa, sea del tipo que sea', async () => {
    const prisma: any = {
      zonaCampana: { findUnique: jest.fn().mockResolvedValue({ id: 'z1', estado: 'CARGADA', cargadaPorId: 'u1' }) },
    };
    await expect(servicio(prisma).decidirZona('z1', true, undefined, 'u1')).rejects.toThrow(/cargaste tú/);
  });
});
