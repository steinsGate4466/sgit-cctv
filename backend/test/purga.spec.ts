import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PurgaService } from '../src/modules/purga/purga.service';

/**
 * PRUEBAS DEL BORRADO DEFINITIVO
 *
 * Se prueban los FRENOS, no el borrado. Que Prisma sepa borrar una fila no
 * hace falta comprobarlo; lo que hay que comprobar es que NO borra cuando no
 * debe, porque ese es el fallo que no se puede deshacer.
 *
 * Cada `it` de aquí es un día malo concreto:
 *   · alguien con el permiso amplio pero sin la segunda llave,
 *   · un clic en la fila de al lado,
 *   · un equipo real confundido con basura,
 *   · el único jefe borrándose a sí mismo,
 *   · la auditoría de esta semana desapareciendo.
 */

/* Bloque 34: la segunda llave dejó de ser el NOMBRE del rol y pasó a ser el
   permiso `purga.definitiva`. El servicio ya no lee `role.name`, lee la lista
   de permisos del rol, así que el doble de Prisma tiene que devolver esa
   forma. Se deja este ayudante para que la intención se lea de un vistazo:
   `conPermisos('purga.definitiva')` es «alguien que sí puede». */
const conPermisos = (...codes: string[]) => ({
  active: true,
  role: { permissions: codes.map((code) => ({ permission: { code } })) },
});
const LLAVE = 'purga.definitiva';

// Prisma de mentira: sólo lo que toca el servicio.
function prismaFalso(over: any = {}) {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue(conPermisos(LLAVE, 'user.manage')),
      count: jest.fn().mockResolvedValue(2),
      delete: jest.fn().mockResolvedValue({}),
    },
    asset: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue({}),
    },
    workOrder: {
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    workOrderMaterial: { count: jest.fn().mockResolvedValue(0) },
    accessRequest: { count: jest.fn().mockResolvedValue(0) },
    auditLog: {
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    ...over,
  } as any;
}

const auditFalso = () => ({ record: jest.fn().mockResolvedValue(undefined) } as any);

const ACTIVO_LIMPIO = {
  id: 'a1', assetCode: 'ewaeweaw', type: 'CAMERA', status: 'OPERATIVO',
  deletedAt: null, createdAt: new Date(), referencePlace: null,
  _count: {
    workOrders: 0, incidents: 0, documents: 0, photos: 0, history: 0,
    credentials: 0, portsOnSwitch: 0, linksA: 0, linksB: 0,
    accessRequests: 0, inspeccionesGrua: 0,
  },
};

describe('purga · las dos llaves de la puerta sin vuelta', () => {
  it('con asset.delete pero SIN la llave de purga, no se borra nada', async () => {
    // Este es el caso real: alguien crea un rol nuevo, le marca asset.delete
    // sin pensarlo, y esa persona entra a Activos. El guard la deja pasar.
    // `purga.definitiva` es el segundo cerrojo, y hay que darlo aparte.
    const prisma = prismaFalso();
    prisma.user.findUnique.mockResolvedValue(conPermisos('asset.delete'));
    const s = new PurgaService(prisma, auditFalso());

    await expect(s.purgarActivo('a1', 'ewaeweaw', 'u1', null)).rejects.toThrow(ForbiddenException);
    expect(prisma.asset.delete).not.toHaveBeenCalled();
  });

  it('un usuario DESACTIVADO tampoco borra, aunque tenga la llave', async () => {
    const prisma = prismaFalso();
    prisma.user.findUnique.mockResolvedValue({ ...conPermisos(LLAVE), active: false });
    const s = new PurgaService(prisma, auditFalso());
    await expect(s.purgarActivo('a1', 'ewaeweaw', 'u1', null)).rejects.toThrow(ForbiddenException);
  });

  it('sin sesión, no se borra', async () => {
    const s = new PurgaService(prismaFalso(), auditFalso());
    await expect(s.purgarActivo('a1', 'ewaeweaw', null, null)).rejects.toThrow(ForbiddenException);
  });
});

describe('purga de activos · qué se salva y qué no', () => {
  it('un equipo con una orden CERRADA no se borra, y se dice por qué', async () => {
    // Una orden cerrada lleva firma y materiales retirados del almacén.
    // Eso es un equipo real, aunque a alguien le estorbe en la lista.
    const prisma = prismaFalso();
    prisma.asset.findUnique.mockResolvedValue({ ...ACTIVO_LIMPIO, assetCode: 'AA-CAM-014' });
    prisma.workOrder.count.mockResolvedValue(3);
    const s = new PurgaService(prisma, auditFalso());

    const previa = await s.vistaPreviaActivo('a1');
    expect(previa.sePuedePurgar).toBe(false);
    expect(previa.motivoSiNo).toContain('Dar de baja');

    await expect(s.purgarActivo('a1', 'AA-CAM-014', 'u1', null)).rejects.toThrow(BadRequestException);
    expect(prisma.asset.delete).not.toHaveBeenCalled();
  });

  it('escribir mal el código NO borra', async () => {
    // El clic en la fila de al lado. La confirmación escrita es lo único
    // que separa "quería borrar ewaeweaw" de "borré AA-CAM-014".
    const prisma = prismaFalso();
    prisma.asset.findUnique.mockResolvedValue(ACTIVO_LIMPIO);
    const s = new PurgaService(prisma, auditFalso());

    await expect(s.purgarActivo('a1', 'ewaewea', 'u1', null)).rejects.toThrow(/código exacto/);
    expect(prisma.asset.delete).not.toHaveBeenCalled();
  });

  it('con el código bien escrito, se borra y se audita ANTES', async () => {
    const prisma = prismaFalso();
    prisma.asset.findUnique.mockResolvedValue(ACTIVO_LIMPIO);
    const audit = auditFalso();
    const orden: string[] = [];
    audit.record.mockImplementation(async () => { orden.push('audit'); });
    prisma.asset.delete.mockImplementation(async () => { orden.push('delete'); return {}; });

    const s = new PurgaService(prisma, audit);
    const r = await s.purgarActivo('a1', 'ewaeweaw', 'u1', '10.20.3.14');

    expect(r.ok).toBe(true);
    // El orden importa: si se anotara después y el borrado fallara a medias,
    // quedaría un registro diciendo que se borró algo que sigue ahí.
    expect(orden).toEqual(['audit', 'delete']);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'PURGE_ASSET' }));
  });

  it('el código se compara sin distinguir mayúsculas', async () => {
    const prisma = prismaFalso();
    prisma.asset.findUnique.mockResolvedValue({ ...ACTIVO_LIMPIO, assetCode: 'AA-TEST-1' });
    const s = new PurgaService(prisma, auditFalso());
    await expect(s.purgarActivo('a1', '  aa-test-1 ', 'u1', null)).resolves.toMatchObject({ ok: true });
  });

  it('la vista previa enumera todo lo que se lleva por delante', async () => {
    const prisma = prismaFalso();
    prisma.asset.findUnique.mockResolvedValue({
      ...ACTIVO_LIMPIO,
      _count: { ...ACTIVO_LIMPIO._count, photos: 4, history: 2, linksA: 1, linksB: 2 },
    });
    const s = new PurgaService(prisma, auditFalso());
    const p = await s.vistaPreviaActivo('a1');

    expect(p.totalArrastrado).toBe(9);
    // Los dos sentidos del enlace se suman en una sola línea: al usuario le da
    // igual si el activo era el extremo A o el B.
    expect(p.arrastra).toContainEqual({ que: 'enlaces de red', n: 3 });
    // Y lo que está a cero no se enseña: una lista de diez ceros no informa.
    expect(p.arrastra.every((x: any) => x.n > 0)).toBe(true);
  });
});

describe('candidatos a basura · es una pista, no un juicio', () => {
  it('el que tiene trabajo registrado no aparece nunca', async () => {
    const prisma = prismaFalso();
    prisma.asset.findMany.mockResolvedValue([
      { id: '1', assetCode: 'AA-CAM-001', type: 'CAMERA', status: 'OPERATIVO', createdAt: new Date(), referencePlace: 'T1', locationId: 'L1', deletedAt: null, _count: { workOrders: 2, incidents: 0, history: 5 } },
      { id: '2', assetCode: 'zzz', type: 'CAMERA', status: 'OPERATIVO', createdAt: new Date(), referencePlace: null, locationId: null, deletedAt: null, _count: { workOrders: 0, incidents: 0, history: 0 } },
    ]);
    const s = new PurgaService(prisma, auditFalso());
    const r = await s.candidatosBasura();

    expect(r.map((x: any) => x.code)).toEqual(['zzz']);
    expect(r[0].razones).toEqual(
      expect.arrayContaining(['sin ubicación', 'sin historial', 'código fuera de patrón']),
    );
  });

  it('ordena por número de señales, el más sospechoso arriba', async () => {
    const base = { type: 'CAMERA', status: 'OPERATIVO', createdAt: new Date(), deletedAt: null, _count: { workOrders: 0, incidents: 0, history: 3 } };
    const prisma = prismaFalso();
    prisma.asset.findMany.mockResolvedValue([
      { ...base, id: '1', assetCode: 'AA-CAM-050', referencePlace: 'T2', locationId: 'L1' },
      { ...base, id: '2', assetCode: 'prueba', referencePlace: null, locationId: null, _count: { workOrders: 0, incidents: 0, history: 0 } },
    ]);
    const s = new PurgaService(prisma, auditFalso());
    const r = await s.candidatosBasura();
    expect(r[0].code).toBe('prueba');
  });
});

describe('purga de usuarios · nadie firma en nombre de un fantasma', () => {
  const USUARIO = {
    id: 'u9', email: 'prueba@aasa.com.pe', fullName: 'Cuenta de prueba',
    active: true, role: { name: 'Técnico' }, _count: { auditLogs: 3, sesiones: 1 },
  };

  it('quien cerró una orden NO se borra: se desactiva', async () => {
    const prisma = prismaFalso();
    prisma.user.findUnique.mockImplementation(({ select }: any) =>
      select?.role && select?.email ? USUARIO : conPermisos(LLAVE, 'user.manage'));
    prisma.workOrder.count.mockImplementation(({ where }: any) =>
      Promise.resolve(where.closedById ? 7 : 0));
    const s = new PurgaService(prisma, auditFalso());

    const p = await s.vistaPreviaUsuario('u9');
    expect(p.sePuedePurgar).toBe(false);
    expect(p.motivoSiNo).toContain('Desactívala');
  });

  it('no puedes borrarte a ti mismo', async () => {
    const s = new PurgaService(prismaFalso(), auditFalso());
    await expect(s.purgarUsuario('u1', 'x@y.z', 'u1', null)).rejects.toThrow(/a ti mismo/);
  });

  /* Bloque 34: esta regla se preguntaba «¿cuántos Jefes de Mantenimiento
     activos quedan?». La pregunta correcta nunca fue cuánta gente tiene ESE
     ROL, sino cuánta gente puede DAR DE ALTA A OTRA — un rol nuevo llamado
     «Administrador TI» con user.manage administra igual y el conteo viejo no
     lo veía. Ahora se cuenta por el permiso, no por el nombre. */
  it('no se borra al último que puede administrar usuarios', async () => {
    // Sin esto, el sistema se queda sin nadie que pueda crear cuentas y sólo
    // se sale entrando a la base de datos a mano.
    const prisma = prismaFalso();
    prisma.user.findUnique.mockImplementation(({ select }: any) =>
      select?.email ? { ...USUARIO, id: 'u9' } : conPermisos(LLAVE, 'user.manage'));
    // El que se va SÍ es administrador (1) y no queda ningún otro (0).
    prisma.user.count.mockImplementation(({ where }: any) =>
      Promise.resolve(where?.id === 'u9' ? 1 : 0));
    const s = new PurgaService(prisma, auditFalso());

    await expect(s.purgarUsuario('u9', 'prueba@aasa.com.pe', 'u1', null))
      .rejects.toThrow(/último usuario activo que puede administrar/);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('si queda otro administrador, sí se borra', async () => {
    // La otra mitad de la regla. Sin esta prueba, un freno demasiado celoso
    // —que no dejara borrar nunca— pasaría igual de desapercibido.
    const prisma = prismaFalso();
    prisma.user.findUnique.mockImplementation(({ select }: any) =>
      select?.email ? { ...USUARIO, id: 'u9' } : conPermisos(LLAVE, 'user.manage'));
    prisma.user.count.mockImplementation(({ where }: any) =>
      Promise.resolve(where?.id === 'u9' ? 1 : 3));
    const s = new PurgaService(prisma, auditFalso());

    await s.purgarUsuario('u9', 'prueba@aasa.com.pe', 'u1', null);
    expect(prisma.user.delete).toHaveBeenCalled();
  });

  it('el correo se compara sin distinguir mayúsculas', async () => {
    const prisma = prismaFalso();
    prisma.user.findUnique.mockImplementation(({ select }: any) =>
      select?.email ? USUARIO : conPermisos(LLAVE, 'user.manage'));
    const s = new PurgaService(prisma, auditFalso());
    await expect(s.purgarUsuario('u9', 'PRUEBA@AASA.COM.PE', 'u1', null))
      .resolves.toMatchObject({ ok: true });
  });
});

describe('purga de auditoría · el freno de los 90 días', () => {
  const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString();

  it('no deja tocar lo reciente', async () => {
    const s = new PurgaService(prismaFalso(), auditFalso());
    // Ayer, hace un mes y hace 89 días: todo rechazado.
    await expect(s.vistaPreviaAuditoria(hace(1))).rejects.toThrow(/90 días/);
    await expect(s.vistaPreviaAuditoria(hace(30))).rejects.toThrow(/90 días/);
    await expect(s.vistaPreviaAuditoria(hace(89))).rejects.toThrow(/90 días/);
  });

  it('acepta lo de hace más de 90 días', async () => {
    const prisma = prismaFalso();
    prisma.auditLog.count.mockResolvedValue(412);
    const s = new PurgaService(prisma, auditFalso());
    const p = await s.vistaPreviaAuditoria(hace(200));
    expect(p.total).toBe(412);
  });

  it('una fecha inventada se rechaza', async () => {
    const s = new PurgaService(prismaFalso(), auditFalso());
    await expect(s.vistaPreviaAuditoria('no soy una fecha')).rejects.toThrow(/no válida/i);
  });

  it('los registros de purgas anteriores nunca se borran', async () => {
    const prisma = prismaFalso();
    prisma.auditLog.count.mockResolvedValue(10);
    const s = new PurgaService(prisma, auditFalso());
    await s.vistaPreviaAuditoria(hace(200));

    // La consulta que cuenta ya excluye los PURGE_*: si no, el primer borrado
    // se llevaría por delante la prueba del borrado anterior.
    const where = prisma.auditLog.count.mock.calls[0][0].where;
    expect(where.action.notIn).toEqual(
      expect.arrayContaining(['PURGE_ASSET', 'PURGE_USER', 'PURGE_AUDIT']),
    );
  });
});


/* =========================================================================
   ÓRDENES DE MANTENIMIENTO
   ========================================================================= */

const OM_LIMPIA = {
  id: 'w1', code: 'OT-2026-0099', type: 'CORRECTIVO', status: 'ABIERTA',
  createdAt: new Date(), activity: null, closedById: null, executedDate: null,
  asset: null,
  _count: {
    progress: 0, evidences: 0, materialItems: 0, tools: 0,
    checklist: 0, swaps: 0, mappedAssets: 0, inspeccionesGrua: 0,
  },
};

describe('purga de OM · los avisos y la segunda llave', () => {
  /* CAMBIÓ EL DISEÑO A MITAD DE CAMINO, Y LAS PRUEBAS LO REFLEJAN.
     Al principio una orden CERRADA no se podía borrar nunca. Estaba pensado
     para el sistema EN OPERACIÓN. Pero el sistema todavía no ha estrenado y
     lo que hay dentro son pruebas: una regla que impide vaciar datos de
     prueba obliga a estrenar con basura. Ahora el freno es un AVISO con
     segunda llave, y forzarlo queda escrito en la auditoría. */

  it('una orden CERRADA avisa y exige la segunda llave', async () => {
    const prisma = prismaFalso();
    prisma.workOrder.findUnique.mockResolvedValue({ ...OM_LIMPIA, status: 'CERRADA', closedById: 'u3' });
    const s = new PurgaService(prisma, auditFalso());

    const p = await s.vistaPreviaOm('w1');
    expect(p.sePuedePurgar).toBe(true);
    expect(p.exigeForzar).toBe(true);
    expect(p.avisos[0]).toContain('CERRADA');

    // Sin forzar: se rechaza y NO se borra.
    await expect(s.purgarOm('w1', 'OT-2026-0099', 'u1', null)).rejects.toThrow(BadRequestException);
    expect(prisma.workOrder.delete).not.toHaveBeenCalled();

    // Con forzar: se borra.
    await expect(s.purgarOm('w1', 'OT-2026-0099', 'u1', null, true)).resolves.toMatchObject({ ok: true });
    expect(prisma.workOrder.delete).toHaveBeenCalled();
  });

  it('forzar queda MARCADO en la auditoría, con los avisos que se saltaron', async () => {
    // Es lo que hace que esto sea aceptable: no se impide la operación, se
    // deja rastro de quién la hizo y de qué se pasó por alto.
    const prisma = prismaFalso();
    prisma.workOrder.findUnique.mockResolvedValue({ ...OM_LIMPIA, status: 'CERRADA' });
    const audit = auditFalso();
    const s = new PurgaService(prisma, audit);

    await s.purgarOm('w1', 'OT-2026-0099', 'u1', null, true);
    const registro = audit.record.mock.calls[0][0];
    expect(registro.action).toBe('PURGE_WORKORDER');
    expect(registro.before.forzado).toBe(true);
    expect(registro.before.avisos[0]).toContain('CERRADA');
  });

  it('el material RETIRADO también avisa', async () => {
    const prisma = prismaFalso();
    prisma.workOrder.findUnique.mockResolvedValue({
      ...OM_LIMPIA, _count: { ...OM_LIMPIA._count, materialItems: 2 },
    });
    prisma.workOrderMaterial.count.mockResolvedValue(2);
    const s = new PurgaService(prisma, auditFalso());

    const p = await s.vistaPreviaOm('w1');
    expect(p.exigeForzar).toBe(true);
    expect(p.avisos.join(' ')).toContain('almacén');
  });

  it('material SOLICITADO pero nunca retirado NO avisa', async () => {
    // Pedir no es sacar. El almacén no se movió.
    const prisma = prismaFalso();
    prisma.workOrder.findUnique.mockResolvedValue({
      ...OM_LIMPIA, _count: { ...OM_LIMPIA._count, materialItems: 3 },
    });
    prisma.workOrderMaterial.count.mockResolvedValue(0);
    const s = new PurgaService(prisma, auditFalso());

    const p = await s.vistaPreviaOm('w1');
    expect(p.exigeForzar).toBe(false);
    expect(p.arrastra).toContainEqual({ que: 'líneas de material', n: 3 });
  });

  it('una orden limpia no pide segunda llave', async () => {
    const prisma = prismaFalso();
    prisma.workOrder.findUnique.mockResolvedValue(OM_LIMPIA);
    const s = new PurgaService(prisma, auditFalso());
    const p = await s.vistaPreviaOm('w1');
    expect(p.exigeForzar).toBe(false);
    await expect(s.purgarOm('w1', 'OT-2026-0099', 'u1', null)).resolves.toMatchObject({ ok: true });
  });

  it('forzar NO salta la confirmación escrita', async () => {
    // Las dos cosas son independientes: forzar dice "sé lo que hay dentro",
    // el código escrito dice "sé CUÁL estoy borrando".
    const prisma = prismaFalso();
    prisma.workOrder.findUnique.mockResolvedValue({ ...OM_LIMPIA, status: 'CERRADA' });
    const s = new PurgaService(prisma, auditFalso());
    await expect(s.purgarOm('w1', 'OT-2026-0098', 'u1', null, true)).rejects.toThrow(/código exacto/);
    expect(prisma.workOrder.delete).not.toHaveBeenCalled();
  });

  it('lo que NO se borra se declara aparte', async () => {
    const prisma = prismaFalso();
    prisma.workOrder.findUnique.mockResolvedValue({
      ...OM_LIMPIA, type: 'MAPEO',
      _count: { ...OM_LIMPIA._count, mappedAssets: 12, inspeccionesGrua: 1 },
    });
    const s = new PurgaService(prisma, auditFalso());
    const p = await s.vistaPreviaOm('w1');

    expect(p.totalArrastrado).toBe(0);
    expect(p.sobrevive).toEqual([
      { que: 'activos levantados en esta orden de mapeo', n: 12 },
      { que: 'inspecciones de grúa', n: 1 },
    ]);
  });

  it('sin la llave de purga no se borra, ni forzando', async () => {
    // `forzar: true` sirve para saltarse los AVISOS (está cerrada, salió
    // material), no el permiso. Si un día alguien confundiera las dos cosas,
    // el freno de la puerta sin vuelta se abriría con una casilla.
    const prisma = prismaFalso();
    prisma.user.findUnique.mockResolvedValue(conPermisos('wo.approve'));
    const s = new PurgaService(prisma, auditFalso());
    await expect(s.purgarOm('w1', 'OT-2026-0099', 'u1', null, true)).rejects.toThrow(ForbiddenException);
  });
});

describe('vaciar TODAS las órdenes · el botón de antes del estreno', () => {
  const TRES = [
    { id: '1', code: 'OT-1', status: 'ABIERTA' },
    { id: '2', code: 'OT-2', status: 'CERRADA' },
    { id: '3', code: 'OT-3', status: 'CANCELADA' },
  ];

  it('la frase tiene que estar completa', async () => {
    const prisma = prismaFalso();
    const s = new PurgaService(prisma, auditFalso());
    await expect(s.vaciarOrdenes('VACIAR', 'u1', null)).rejects.toThrow(/VACIAR TODAS LAS ORDENES/);
    await expect(s.vaciarOrdenes('vaciar todas', 'u1', null)).rejects.toThrow();
    expect(prisma.workOrder.deleteMany).not.toHaveBeenCalled();
  });

  it('acepta la frase en minúsculas y con espacios de más', async () => {
    const prisma = prismaFalso();
    prisma.workOrder.findMany.mockResolvedValue(TRES);
    prisma.workOrder.deleteMany.mockResolvedValue({ count: 3 });
    const s = new PurgaService(prisma, auditFalso());
    const r = await s.vaciarOrdenes('  vaciar   todas las ordenes ', 'u1', null);
    expect(r).toMatchObject({ ok: true, borradas: 3, cerradas: 1 });
  });

  it('guarda los CÓDIGOS en la auditoría antes de borrar', async () => {
    // Si mañana falta una orden, el registro dice quién vació y qué había.
    const prisma = prismaFalso();
    prisma.workOrder.findMany.mockResolvedValue(TRES);
    prisma.workOrder.deleteMany.mockResolvedValue({ count: 3 });
    const audit = auditFalso();
    const orden: string[] = [];
    audit.record.mockImplementation(async () => { orden.push('audit'); });
    prisma.workOrder.deleteMany.mockImplementation(async () => { orden.push('delete'); return { count: 3 }; });

    const s = new PurgaService(prisma, audit);
    await s.vaciarOrdenes('VACIAR TODAS LAS ORDENES', 'u1', null);

    expect(orden).toEqual(['audit', 'delete']);
    const reg = audit.record.mock.calls[0][0];
    expect(reg.action).toBe('PURGE_ALL_WORKORDERS');
    expect(reg.before.codigos).toEqual(['OT-1', 'OT-2', 'OT-3']);
    expect(reg.before.cerradas).toBe(1);
  });

  it('si no hay órdenes, lo dice en vez de fingir que hizo algo', async () => {
    const prisma = prismaFalso();
    prisma.workOrder.findMany.mockResolvedValue([]);
    const s = new PurgaService(prisma, auditFalso());
    await expect(s.vaciarOrdenes('VACIAR TODAS LAS ORDENES', 'u1', null)).rejects.toThrow(/No hay órdenes/);
  });

  it('sin el cargo de Jefe, no', async () => {
    const prisma = prismaFalso();
    prisma.user.findUnique.mockResolvedValue(conPermisos('asset.delete'));
    const s = new PurgaService(prisma, auditFalso());
    await expect(s.vaciarOrdenes('VACIAR TODAS LAS ORDENES', 'u1', null)).rejects.toThrow(ForbiddenException);
    expect(prisma.workOrder.deleteMany).not.toHaveBeenCalled();
  });
});

describe('candidatas a basura · una orden esperando parada NO es basura', () => {
  const base = {
    type: 'CORRECTIVO', status: 'ABIERTA', createdAt: new Date(),
    scheduledDate: null, progressPct: 0, asset: null,
    _count: { progress: 0, evidences: 0, materialItems: 0, checklist: 0 },
  };

  it('salen TODAS, pero se marca cuál está en blanco', async () => {
    // Antes se filtraban. Ahora no: para vaciar la sección antes del estreno
    // hay que poder ver y borrar también las que tienen cosas dentro.
    const prisma = prismaFalso();
    prisma.workOrder.findMany.mockResolvedValue([
      { ...base, id: '1', code: 'OT-1', activity: 'Cambio de cámara del lecho', technicianId: 't1', _count: { progress: 2, evidences: 0, materialItems: 0, checklist: 0 } },
      { ...base, id: '2', code: 'OT-2', activity: 'x', technicianId: null },
    ]);
    const s = new PurgaService(prisma, auditFalso());
    const r = await s.candidatosOm();

    expect(r.map((x: any) => x.code).sort()).toEqual(['OT-1', 'OT-2']);
    expect(r.find((x: any) => x.code === 'OT-1').enBlanco).toBe(false);
    expect(r.find((x: any) => x.code === 'OT-2').enBlanco).toBe(true);
  });

  it('una orden legítima esperando parada, sin nada aún, sale con POCAS señales', async () => {
    // Aparece —está en blanco— pero con una sola señal, así que queda abajo.
    // La decisión sigue siendo de la persona: esto ordena, no juzga.
    const prisma = prismaFalso();
    prisma.workOrder.findMany.mockResolvedValue([
      { ...base, id: '1', code: 'OT-10', activity: 'Reemplazo de switch del gabinete R-03', technicianId: 't1', asset: { assetCode: 'AA-SW-003' } },
      { ...base, id: '2', code: 'OT-11', activity: null, technicianId: null, createdAt: new Date(Date.now() - 60 * 86400000) },
    ]);
    const s = new PurgaService(prisma, auditFalso());
    const r = await s.candidatosOm();

    expect(r[0].code).toBe('OT-11');
    expect(r[0].razones.length).toBeGreaterThan(r[1].razones.length);
    // La legítima sólo trae la señal de estar en blanco; ninguna más.
    expect(r[1].razones).toEqual(['sin nada registrado']);
  });

  it('una CERRADA aparece marcada para pedir segunda llave', async () => {
    const prisma = prismaFalso();
    prisma.workOrder.findMany.mockResolvedValue([
      { ...base, id: '1', code: 'OT-9', status: 'CERRADA', activity: 'algo', technicianId: 't1' },
    ]);
    const s = new PurgaService(prisma, auditFalso());
    const r = await s.candidatosOm();
    expect(r[0].exigeForzar).toBe(true);
  });
});
