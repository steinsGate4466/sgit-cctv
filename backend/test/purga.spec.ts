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
 *   · alguien con el permiso pero sin el cargo,
 *   · un clic en la fila de al lado,
 *   · un equipo real confundido con basura,
 *   · el único jefe borrándose a sí mismo,
 *   · la auditoría de esta semana desapareciendo.
 */

// Prisma de mentira: sólo lo que toca el servicio.
function prismaFalso(over: any = {}) {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue({ active: true, role: { name: 'Jefe de Mantenimiento' } }),
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
  it('con el permiso pero SIN el cargo, no se borra nada', async () => {
    // Este es el caso real: alguien crea un rol nuevo, le marca asset.delete
    // sin pensarlo, y esa persona entra a Activos. El guard la deja pasar.
    // El rol es el segundo cerrojo.
    const prisma = prismaFalso();
    prisma.user.findUnique.mockResolvedValue({ active: true, role: { name: 'Técnico' } });
    const s = new PurgaService(prisma, auditFalso());

    await expect(s.purgarActivo('a1', 'ewaeweaw', 'u1', null)).rejects.toThrow(ForbiddenException);
    expect(prisma.asset.delete).not.toHaveBeenCalled();
  });

  it('un jefe DESACTIVADO tampoco borra', async () => {
    const prisma = prismaFalso();
    prisma.user.findUnique.mockResolvedValue({ active: false, role: { name: 'Jefe de Mantenimiento' } });
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
      select?.role && select?.email ? USUARIO : { active: true, role: { name: 'Jefe de Mantenimiento' } });
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

  it('no se borra al único Jefe de Mantenimiento activo', async () => {
    // Sin esto, el sistema se queda sin nadie que pueda administrarlo y sólo
    // se sale entrando a la base de datos a mano.
    const prisma = prismaFalso();
    prisma.user.findUnique.mockImplementation(({ select }: any) =>
      select?.email
        ? { ...USUARIO, id: 'u9', role: { name: 'Jefe de Mantenimiento' } }
        : { active: true, role: { name: 'Jefe de Mantenimiento' } });
    prisma.user.count.mockResolvedValue(0);
    const s = new PurgaService(prisma, auditFalso());

    await expect(s.purgarUsuario('u9', 'prueba@aasa.com.pe', 'u1', null))
      .rejects.toThrow(/único Jefe de Mantenimiento/);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('el correo se compara sin distinguir mayúsculas', async () => {
    const prisma = prismaFalso();
    prisma.user.findUnique.mockImplementation(({ select }: any) =>
      select?.email ? USUARIO : { active: true, role: { name: 'Jefe de Mantenimiento' } });
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

describe('purga de OM · los tres frenos', () => {
  it('una orden CERRADA no se borra: lleva firma, causa y acción', async () => {
    const prisma = prismaFalso();
    prisma.workOrder.findUnique.mockResolvedValue({ ...OM_LIMPIA, status: 'CERRADA', closedById: 'u3' });
    const s = new PurgaService(prisma, auditFalso());

    const p = await s.vistaPreviaOm('w1');
    expect(p.sePuedePurgar).toBe(false);
    expect(p.motivoSiNo).toContain('CERRADA');

    await expect(s.purgarOm('w1', 'OT-2026-0099', 'u1', null)).rejects.toThrow(BadRequestException);
    expect(prisma.workOrder.delete).not.toHaveBeenCalled();
  });

  it('SI SALIÓ MATERIAL DEL ALMACÉN, no se borra', async () => {
    // El freno menos obvio y el más importante. El retiro escribió un
    // movimiento de stock que NO cuelga de la orden: borrar la orden deja el
    // almacén diciendo "salieron 3 conectores" sin que nadie sepa para qué.
    // Y sobre todo: borrar el papel no devuelve los repuestos a la estantería.
    const prisma = prismaFalso();
    prisma.workOrder.findUnique.mockResolvedValue({
      ...OM_LIMPIA,
      _count: { ...OM_LIMPIA._count, materialItems: 2 },
    });
    prisma.workOrderMaterial.count.mockResolvedValue(2);
    const s = new PurgaService(prisma, auditFalso());

    const p = await s.vistaPreviaOm('w1');
    expect(p.sePuedePurgar).toBe(false);
    expect(p.motivoSiNo).toContain('almacén');
    await expect(s.purgarOm('w1', 'OT-2026-0099', 'u1', null)).rejects.toThrow(BadRequestException);
  });

  it('material SOLICITADO pero nunca retirado NO bloquea', async () => {
    // Pedir no es sacar. Una orden con material pedido y sin retirar sigue
    // siendo un papel en blanco: el almacén no se movió.
    const prisma = prismaFalso();
    prisma.workOrder.findUnique.mockResolvedValue({
      ...OM_LIMPIA,
      _count: { ...OM_LIMPIA._count, materialItems: 3 },
    });
    prisma.workOrderMaterial.count.mockResolvedValue(0); // ninguno con movementId
    const s = new PurgaService(prisma, auditFalso());

    const p = await s.vistaPreviaOm('w1');
    expect(p.sePuedePurgar).toBe(true);
    expect(p.arrastra).toContainEqual({ que: 'líneas de material', n: 3 });
  });

  it('escribir mal el código no borra', async () => {
    const prisma = prismaFalso();
    prisma.workOrder.findUnique.mockResolvedValue(OM_LIMPIA);
    const s = new PurgaService(prisma, auditFalso());
    await expect(s.purgarOm('w1', 'OT-2026-0098', 'u1', null)).rejects.toThrow(/código exacto/);
    expect(prisma.workOrder.delete).not.toHaveBeenCalled();
  });

  it('lo que NO se borra se declara aparte', async () => {
    // Si nadie lo avisa, alguien va a creer que borró 12 cámaras.
    const prisma = prismaFalso();
    prisma.workOrder.findUnique.mockResolvedValue({
      ...OM_LIMPIA, type: 'MAPEO',
      _count: { ...OM_LIMPIA._count, mappedAssets: 12, inspeccionesGrua: 1 },
    });
    const s = new PurgaService(prisma, auditFalso());
    const p = await s.vistaPreviaOm('w1');

    // No cuentan como arrastrados: sobreviven.
    expect(p.totalArrastrado).toBe(0);
    expect(p.sobrevive).toEqual([
      { que: 'activos levantados en esta orden de mapeo', n: 12 },
      { que: 'inspecciones de grúa', n: 1 },
    ]);
    expect(p.sePuedePurgar).toBe(true);
  });

  it('con el código bien, se borra y se audita antes', async () => {
    const prisma = prismaFalso();
    prisma.workOrder.findUnique.mockResolvedValue(OM_LIMPIA);
    const audit = auditFalso();
    const orden: string[] = [];
    audit.record.mockImplementation(async () => { orden.push('audit'); });
    prisma.workOrder.delete.mockImplementation(async () => { orden.push('delete'); return {}; });

    const s = new PurgaService(prisma, audit);
    const r = await s.purgarOm('w1', 'ot-2026-0099', 'u1', null);

    expect(r.ok).toBe(true);
    expect(orden).toEqual(['audit', 'delete']);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'PURGE_WORKORDER' }));
  });

  it('sin el cargo de Jefe, tampoco', async () => {
    const prisma = prismaFalso();
    prisma.user.findUnique.mockResolvedValue({ active: true, role: { name: 'Supervisor TI' } });
    const s = new PurgaService(prisma, auditFalso());
    await expect(s.purgarOm('w1', 'OT-2026-0099', 'u1', null)).rejects.toThrow(ForbiddenException);
  });
});

describe('candidatas a basura · una orden esperando parada NO es basura', () => {
  const base = {
    type: 'CORRECTIVO', status: 'ABIERTA', createdAt: new Date(),
    scheduledDate: null, progressPct: 0, asset: null,
    _count: { progress: 0, evidences: 0, materialItems: 0, checklist: 0 },
  };

  it('la que tiene avance, material, fotos o checklist no aparece', async () => {
    const prisma = prismaFalso();
    prisma.workOrder.findMany.mockResolvedValue([
      { ...base, id: '1', code: 'OT-1', activity: 'Cambio de cámara del lecho', technicianId: 't1', _count: { progress: 2, evidences: 0, materialItems: 0, checklist: 0 } },
      { ...base, id: '2', code: 'OT-2', activity: 'x', technicianId: null },
    ]);
    const s = new PurgaService(prisma, auditFalso());
    const r = await s.candidatosOm();
    expect(r.map((x: any) => x.code)).toEqual(['OT-2']);
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

    expect(r[0].code).toBe('OT-11');           // 3 señales
    expect(r[0].razones.length).toBeGreaterThan(r[1].razones.length);
    expect(r[1].razones).toEqual([]);          // la legítima, sin señales
  });

  it('las CERRADAS nunca se consultan siquiera', async () => {
    const prisma = prismaFalso();
    const s = new PurgaService(prisma, auditFalso());
    await s.candidatosOm();
    expect(prisma.workOrder.findMany.mock.calls[0][0].where.status.notIn).toContain('CERRADA');
  });
});
