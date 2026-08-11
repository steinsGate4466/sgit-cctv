import { BadRequestException, ConflictException } from '@nestjs/common';
import { InstalacionService } from '../src/modules/instalacion/instalacion.service';
import { perfilDe, PERFILES } from '../src/modules/instalacion/requisitos-sitio';

/**
 * INSTALACIONES
 *
 * Lo que se prueba es la idea central: **el formulario cambia según el
 * sitio**, y el servidor exige lo que ese sitio necesita — ni más ni menos.
 * Si esa tabla y esta validación se separan, el técnico acaba sin poder
 * guardar y sin saber por qué.
 */

function prismaFalso(over: any = {}) {
  return {
    instalacion: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'i1', ...data })),
      groupBy: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    asset: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
    location: { findUnique: jest.fn().mockResolvedValue({ id: 'L1' }) },
    workOrder: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
    $transaction: jest.fn(),
    ...over,
  } as any;
}
const auditFalso = () => ({ record: jest.fn().mockResolvedValue(undefined) } as any);

const BASE = {
  id: 'i1', codigo: 'INS-2026-0001', estado: 'EN_EVALUACION',
  tipoSitio: 'GRUA', tipoEquipo: 'CAMERA', cantidad: 1,
  justificacion: 'No se ve la carga del puente 3', locationId: null,
  referenciaSitio: null, ambiente: null, notas: null,
  assetCreadoId: null, workOrderId: null,
};

describe('perfiles de sitio · cada sitio pregunta lo suyo', () => {
  it('la grúa pregunta por manlift; el púlpito, no', () => {
    const grua = perfilDe('GRUA').grupos.flatMap((g) => g.campos);
    const pulpito = perfilDe('PULPITO').grupos.flatMap((g) => g.campos);

    expect(grua).toContain('necesitaManlift');
    expect(grua).toContain('gruaSeDetiene');
    expect(grua).toContain('porCadenaPortacables');
    expect(pulpito).not.toContain('necesitaManlift');
    expect(pulpito).not.toContain('gruaSeDetiene');
  });

  it('el púlpito pregunta por el falso techo y quién autoriza entrar', () => {
    const pulpito = perfilDe('PULPITO').grupos.flatMap((g) => g.campos);
    expect(pulpito).toContain('hayFalsoTecho');
    expect(pulpito).toContain('quienAutoriza');
  });

  it('la sala eléctrica avisa de la interferencia, no de la altura', () => {
    const p = perfilDe('SALA_ELECTRICA');
    expect(p.avisos.join(' ')).toMatch(/electromagn/i);
    expect(p.grupos.flatMap((g) => g.campos)).toContain('necesitaLoto');
  });

  it('un sitio sin perfil propio cae en el genérico, no revienta', () => {
    const p = perfilDe('LABORATORIO');
    expect(p.nombre).toBe('Otro sitio');
    expect(p.obligatoriosAlEvaluar.length).toBeGreaterThan(0);
  });

  it('todos los perfiles exigen algo, y lo que exigen está entre sus campos', () => {
    // El fallo que esta prueba caza: pedir un campo obligatorio que el
    // formulario nunca enseña. El técnico no podría guardar y no vería dónde.
    for (const [clave, perfil] of Object.entries(PERFILES)) {
      const visibles = new Set(perfil.grupos.flatMap((g) => g.campos));
      expect(perfil.obligatoriosAlEvaluar.length).toBeGreaterThan(0);
      for (const c of perfil.obligatoriosAlEvaluar) {
        expect([clave, c, [...visibles].includes(c)]).toEqual([clave, c, true]);
      }
    }
  });
});

describe('instalaciones · la visita se puede guardar a medias', () => {
  it('guardar sin cerrar NO exige nada', async () => {
    // El técnico está en el sitio con guantes. Si el formulario sólo deja
    // guardar completo, apunta en un papel — y el papel se pierde.
    const prisma = prismaFalso();
    prisma.instalacion.findUnique.mockResolvedValue(BASE);
    const s = new InstalacionService(prisma, auditFalso());
    s.detalle = jest.fn().mockResolvedValue({ ok: true }) as any;

    await expect(s.evaluar('i1', { metrosCable: 40 } as any, 'u1')).resolves.toBeTruthy();
    expect(prisma.instalacion.update).toHaveBeenCalled();
  });

  it('cerrar la visita de una GRÚA sin altura ni manlift se rechaza, y dice cuál falta', async () => {
    const prisma = prismaFalso();
    prisma.instalacion.findUnique.mockResolvedValue(BASE);
    const s = new InstalacionService(prisma, auditFalso());

    await expect(s.evaluar('i1', { hayEnergia: true, cerrarEvaluacion: true } as any, 'u1'))
      .rejects.toThrow(/Altura del punto/);
  });

  it('cerrar la visita de una OFICINA no pide manlift', async () => {
    // El mismo dato que en la grúa es obligatorio, aquí ni se pregunta.
    const prisma = prismaFalso();
    prisma.instalacion.findUnique.mockResolvedValue({ ...BASE, tipoSitio: 'OFICINA' });
    const s = new InstalacionService(prisma, auditFalso());
    s.detalle = jest.fn().mockResolvedValue({ ok: true }) as any;

    await expect(s.evaluar('i1', {
      hayEnergia: true, hayPuntoRed: true, metrosCable: 25, cerrarEvaluacion: true,
    } as any, 'u1')).resolves.toBeTruthy();
    expect(prisma.instalacion.update.mock.calls[0][0].data.estado).toBe('EVALUADA');
  });

  it('un false cuenta como respondido; un vacío no', async () => {
    // "No necesita manlift" ES una respuesta. Si se tratara como vacío, el
    // técnico no podría cerrar nunca una instalación a ras de suelo.
    const prisma = prismaFalso();
    prisma.instalacion.findUnique.mockResolvedValue({ ...BASE, tipoSitio: 'GRUA' });
    const s = new InstalacionService(prisma, auditFalso());
    s.detalle = jest.fn().mockResolvedValue({ ok: true }) as any;

    await expect(s.evaluar('i1', {
      alturaMetros: 0, necesitaManlift: false, gruaSeDetiene: false,
      hayEnergia: false, cerrarEvaluacion: true,
    } as any, 'u1')).resolves.toBeTruthy();
  });

  it('una instalada ya no se edita', async () => {
    const prisma = prismaFalso();
    prisma.instalacion.findUnique.mockResolvedValue({ ...BASE, estado: 'INSTALADA' });
    const s = new InstalacionService(prisma, auditFalso());
    await expect(s.evaluar('i1', { metrosCable: 1 } as any, 'u1')).rejects.toThrow(/INSTALADA/);
  });
});

describe('instalaciones · no se aprueba sin haber ido al sitio', () => {
  it('aprobar una SOLICITADA se rechaza', async () => {
    const prisma = prismaFalso();
    prisma.instalacion.findUnique.mockResolvedValue({ ...BASE, estado: 'SOLICITADA' });
    const s = new InstalacionService(prisma, auditFalso());
    await expect(s.decidir('i1', { aprobar: true }, 'u1')).rejects.toThrow(/EVALUADA/);
  });

  it('rechazar exige motivo', async () => {
    const prisma = prismaFalso();
    prisma.instalacion.findUnique.mockResolvedValue({ ...BASE, estado: 'EVALUADA' });
    const s = new InstalacionService(prisma, auditFalso());
    await expect(s.decidir('i1', { aprobar: false }, 'u1')).rejects.toThrow(/por qué/i);
  });
});

describe('instalaciones · el remate: nace el activo', () => {
  it('al cerrar se crea el activo y se marca la instalación EN LA MISMA transacción', async () => {
    // Si el activo se crea y la instalación no se marca, mañana alguien la
    // vuelve a ejecutar y el equipo aparece duplicado en el inventario.
    const prisma = prismaFalso();
    prisma.instalacion.findUnique.mockResolvedValue({
      ...BASE, estado: 'APROBADA', referenciaSitio: 'Puente 3, viga norte', ambiente: 'POLVO_METALICO',
    });
    prisma.$transaction.mockResolvedValue([{ id: 'a1', assetCode: 'AA-CAM-T2-GR-003' }, {}]);
    const s = new InstalacionService(prisma, auditFalso());

    const r = await s.marcarInstalada('i1', { assetCode: ' aa-cam-t2-gr-003 ' } as any, 'u1');
    expect(r.activo.assetCode).toBe('AA-CAM-T2-GR-003');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(2);
  });

  it('lo medido en la visita viaja a la ficha del equipo', async () => {
    // Ese conocimiento se pierde si sólo vive en la instalación.
    const prisma = prismaFalso();
    prisma.instalacion.findUnique.mockResolvedValue({
      ...BASE, estado: 'APROBADA', referenciaSitio: 'Puente 3, viga norte', ambiente: 'POLVO_METALICO',
    });
    prisma.$transaction.mockResolvedValue([{ id: 'a1', assetCode: 'X' }, {}]);
    const s = new InstalacionService(prisma, auditFalso());
    await s.marcarInstalada('i1', { assetCode: 'AA-CAM-1' } as any, 'u1');

    const datos = prisma.asset.create.mock.calls[0][0].data;
    expect(datos.referencePlace).toBe('Puente 3, viga norte');
    // El AMBIENTE no se copia: `Asset` no lo tiene, se deduce del árbol de
    // ubicaciones. Copiarlo crearía una segunda verdad que se desincroniza.
    expect(datos.environment).toBeUndefined();
    // Nace incompleta a propósito: se termina de llenar desde Activos.
    expect(datos.isDraft).toBe(true);
  });

  it('un código de activo repetido se rechaza en vez de duplicar', async () => {
    const prisma = prismaFalso();
    prisma.instalacion.findUnique.mockResolvedValue({ ...BASE, estado: 'APROBADA' });
    prisma.asset.findUnique.mockResolvedValue({ id: 'ya-existe' });
    const s = new InstalacionService(prisma, auditFalso());
    await expect(s.marcarInstalada('i1', { assetCode: 'AA-CAM-1' } as any, 'u1'))
      .rejects.toThrow(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('no se cierra dos veces', async () => {
    const prisma = prismaFalso();
    prisma.instalacion.findUnique.mockResolvedValue({ ...BASE, estado: 'APROBADA', assetCreadoId: 'a1' });
    const s = new InstalacionService(prisma, auditFalso());
    await expect(s.marcarInstalada('i1', { assetCode: 'AA-CAM-9' } as any, 'u1'))
      .rejects.toThrow(/ya creó su activo/);
  });

  it('cancelar una INSTALADA no tiene sentido y se dice por qué', async () => {
    const prisma = prismaFalso();
    prisma.instalacion.findUnique.mockResolvedValue({ ...BASE, estado: 'INSTALADA' });
    const s = new InstalacionService(prisma, auditFalso());
    await expect(s.cancelar('i1', 'ya no la quiero', 'u1')).rejects.toThrow(/no desinstala/);
  });
});

describe('instalaciones · el código correlativo', () => {
  it('empieza en 0001 cuando no hay ninguna del año', async () => {
    const prisma = prismaFalso();
    prisma.instalacion.create.mockImplementation(({ data }: any) => Promise.resolve({ ...data, id: 'i1' }));
    const s = new InstalacionService(prisma, auditFalso());
    const r = await s.crear({ tipoSitio: 'OFICINA', tipoEquipo: 'CAMERA', justificacion: 'hace falta ver la puerta' } as any, 'u1');
    expect(r.codigo).toMatch(/^INS-\d{4}-0001$/);
  });

  it('sigue del último', async () => {
    const anio = new Date().getFullYear();
    const prisma = prismaFalso();
    prisma.instalacion.findFirst.mockResolvedValue({ codigo: `INS-${anio}-0041` });
    prisma.instalacion.create.mockImplementation(({ data }: any) => Promise.resolve({ ...data, id: 'i1' }));
    const s = new InstalacionService(prisma, auditFalso());
    const r = await s.crear({ tipoSitio: 'PATIO', tipoEquipo: 'CAMERA', justificacion: 'zona sin cobertura' } as any, 'u1');
    expect(r.codigo).toBe(`INS-${anio}-0042`);
  });

  it('una ubicación que no existe se rechaza antes de crear', async () => {
    const prisma = prismaFalso();
    prisma.location.findUnique.mockResolvedValue(null);
    const s = new InstalacionService(prisma, auditFalso());
    await expect(s.crear({ tipoSitio: 'NAVE', tipoEquipo: 'CAMERA', justificacion: 'zona ciega del tren', locationId: 'noexiste' } as any, 'u1'))
      .rejects.toThrow(BadRequestException);
    expect(prisma.instalacion.create).not.toHaveBeenCalled();
  });
});
