import { BadRequestException } from '@nestjs/common';
import { ParadasService } from '../src/modules/paradas/paradas.service';

/**
 * VENTANAS DE PARADA
 *
 * Lo que se prueba aquí es lo que hace que el módulo sirva para algo:
 * que PREVISTO y REAL no se confundan, y que mover la hora deje rastro.
 * Si esas dos cosas fallan, el módulo se convierte en una agenda bonita
 * que no contesta la única pregunta que importa: ¿cuánto nos mueven las
 * paradas y cuánto trabajo nos cuesta eso?
 */

const h = (iso: string) => new Date(iso);

function prismaFalso(over: any = {}) {
  return {
    ventanaParada: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    cambioParada: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    workOrder: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(),
    ...over,
  } as any;
}
const auditFalso = () => ({ record: jest.fn().mockResolvedValue(undefined) } as any);

const PARADA = {
  id: 'p1', tren: 'T2', estado: 'ANUNCIADA', origen: 'PRODUCCION',
  inicioPrevisto: h('2026-08-12T23:00:00Z'),
  finPrevisto: h('2026-08-13T03:00:00Z'),
  duracionPrevMin: 240, inicioReal: null, finReal: null,
  _count: { ordenes: 0, cambios: 0 },
};

describe('paradas · previsto y real son dos cosas distintas', () => {
  it('la desviación sale de comparar lo prometido con lo que pasó', async () => {
    const prisma = prismaFalso();
    prisma.ventanaParada.findMany.mockResolvedValue([{
      ...PARADA, estado: 'TERMINADA',
      inicioReal: h('2026-08-13T01:00:00Z'),   // arrancó 2 h tarde
      finReal: h('2026-08-13T04:00:00Z'),      // duró 3 h en vez de 4
    }]);
    const s = new ParadasService(prisma, auditFalso());
    const [p] = await s.listar({});

    expect(p.duracionPrevistaMin).toBe(240);
    expect(p.duracionRealMin).toBe(180);
    expect(p.desviacionMin).toBe(-60);        // duró UNA HORA MENOS de lo prometido
    expect(p.arranqueDesviadoMin).toBe(120);  // y arrancó DOS HORAS tarde
  });

  it('sin hora real no se inventa la desviación: devuelve null', async () => {
    // Es la diferencia entre "no lo sabemos" y "fue cero". Poner cero haría
    // que la media mintiera hacia abajo.
    const prisma = prismaFalso();
    prisma.ventanaParada.findMany.mockResolvedValue([PARADA]);
    const s = new ParadasService(prisma, auditFalso());
    const [p] = await s.listar({});
    expect(p.duracionRealMin).toBeNull();
    expect(p.desviacionMin).toBeNull();
  });
});

describe('paradas · mover la hora deja rastro', () => {
  it('sin motivo NO se mueve', async () => {
    const prisma = prismaFalso();
    prisma.ventanaParada.findUnique.mockResolvedValue(PARADA);
    const s = new ParadasService(prisma, auditFalso());
    await expect(s.mover('p1', { inicioPrevisto: '2026-08-13T01:00:00Z', motivo: '' } as any, 'u1'))
      .rejects.toThrow(/por qué/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('con motivo, se escribe el cambio Y la parada en la MISMA transacción', async () => {
    // Un historial que se puede escribir a medias no vale nada: quedaría el
    // cambio sin registro, o el registro de un cambio que no ocurrió.
    const prisma = prismaFalso();
    prisma.ventanaParada.findUnique.mockResolvedValue(PARADA);
    prisma.$transaction.mockResolvedValue([{ count: 1 }, { ...PARADA, _count: { ordenes: 0, cambios: 1 } }]);
    const s = new ParadasService(prisma, auditFalso());

    const r = await s.mover('p1', { inicioPrevisto: '2026-08-13T02:00:00Z', motivo: 'Se alargó la colada' }, 'u1');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(2);
    expect(r.vecesMovida).toBe(1);

    const cambios = prisma.cambioParada.createMany.mock.calls[0][0].data;
    expect(cambios[0]).toMatchObject({ campo: 'inicioPrevisto', motivo: 'Se alargó la colada', porId: 'u1' });
    expect(cambios[0].valorAntes).toContain('2026-08-12T23:00');
  });

  it('no se anota lo que no cambió', async () => {
    // Reenviar el formulario con la misma hora no debe ensuciar el historial
    // con un "movimiento" que no existió.
    const prisma = prismaFalso();
    prisma.ventanaParada.findUnique.mockResolvedValue(PARADA);
    const s = new ParadasService(prisma, auditFalso());
    await expect(s.mover('p1', { inicioPrevisto: '2026-08-12T23:00:00Z', motivo: 'sin cambios' }, 'u1'))
      .rejects.toThrow(/No cambiaste/);
  });

  it('una parada TERMINADA ya no se reescribe', async () => {
    const prisma = prismaFalso();
    prisma.ventanaParada.findUnique.mockResolvedValue({ ...PARADA, estado: 'TERMINADA' });
    const s = new ParadasService(prisma, auditFalso());
    await expect(s.mover('p1', { inicioPrevisto: '2026-08-14T00:00:00Z', motivo: 'x' }, 'u1'))
      .rejects.toThrow(/ya terminó/);
  });

  it('el fin no puede quedar antes del inicio', async () => {
    const prisma = prismaFalso();
    prisma.ventanaParada.findUnique.mockResolvedValue(PARADA);
    const s = new ParadasService(prisma, auditFalso());
    await expect(s.mover('p1', { finPrevisto: '2026-08-12T20:00:00Z', motivo: 'error de dedo' }, 'u1'))
      .rejects.toThrow(BadRequestException);
  });
});

describe('paradas · registrar la realidad tal como es', () => {
  it('se acepta apuntar una parada que YA empezó', async () => {
    // Media planta se entera cuando ya arrancó. Un formulario que rechaza la
    // realidad se deja de usar y se vuelve al cuaderno.
    const prisma = prismaFalso();
    prisma.ventanaParada.create.mockResolvedValue({ ...PARADA, _count: { ordenes: 0, cambios: 0 } });
    const s = new ParadasService(prisma, auditFalso());
    const ayer = new Date(Date.now() - 86400000).toISOString();
    await expect(s.crear({ tren: 'T2', inicioPrevisto: ayer } as any, 'u1')).resolves.toBeTruthy();
  });

  it('al marcar TERMINADA sin hora de arranque, se toma la prevista', async () => {
    // Mejor una estimación declarada que un hueco que nadie sabe leer.
    const prisma = prismaFalso();
    prisma.ventanaParada.findUnique.mockResolvedValue(PARADA);
    prisma.ventanaParada.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ ...PARADA, ...data, _count: { ordenes: 0, cambios: 0 } }));
    const s = new ParadasService(prisma, auditFalso());

    await s.cambiarEstado('p1', { estado: 'TERMINADA', finReal: '2026-08-13T04:00:00Z' } as any, 'u1');
    const datos = prisma.ventanaParada.update.mock.calls[0][0].data;
    expect(datos.inicioReal).toEqual(PARADA.inicioPrevisto);
  });

  it('cancelar exige motivo: la gente ya se había movilizado', async () => {
    const prisma = prismaFalso();
    prisma.ventanaParada.findUnique.mockResolvedValue(PARADA);
    const s = new ParadasService(prisma, auditFalso());
    await expect(s.cambiarEstado('p1', { estado: 'CANCELADA' } as any, 'u1')).rejects.toThrow(/por qué/i);
  });

  it('no se cuelga una OM ya cerrada de una ventana futura', async () => {
    const prisma = prismaFalso();
    prisma.ventanaParada.findUnique.mockResolvedValue({ id: 'p1', estado: 'ANUNCIADA' });
    prisma.workOrder.findUnique.mockResolvedValue({ id: 'w1', code: 'OT-1', status: 'CERRADA' });
    const s = new ParadasService(prisma, auditFalso());
    await expect(s.ligarOrden('p1', 'w1', true, 'u1')).rejects.toThrow(/ya está cerrada/);
  });
});

describe('paradas · el número para la reunión', () => {
  it('mide cuántas se movieron y cuánto se desviaron', async () => {
    const prisma = prismaFalso();
    prisma.ventanaParada.findMany.mockResolvedValue([
      { tren: 'T2', estado: 'TERMINADA', inicioPrevisto: h('2026-08-01T23:00:00Z'), inicioReal: h('2026-08-02T00:00:00Z'),
        finPrevisto: null, finReal: h('2026-08-02T05:00:00Z'), duracionPrevMin: 240, _count: { cambios: 2, ordenes: 3 } },
      { tren: 'T2', estado: 'TERMINADA', inicioPrevisto: h('2026-08-05T23:00:00Z'), inicioReal: h('2026-08-05T23:00:00Z'),
        finPrevisto: null, finReal: h('2026-08-06T02:00:00Z'), duracionPrevMin: 240, _count: { cambios: 0, ordenes: 1 } },
      { tren: 'T1', estado: 'CANCELADA', inicioPrevisto: h('2026-08-06T23:00:00Z'), inicioReal: null,
        finPrevisto: null, finReal: null, duracionPrevMin: 120, _count: { cambios: 1, ordenes: 0 } },
    ]);
    const s = new ParadasService(prisma, auditFalso());
    const r = await s.fiabilidad(90);

    /* Se comprueba que el tren SALE antes de mirar sus cifras. Si no saliera,
       `find` devuelve undefined y sin esta línea el fallo sería un TypeError
       ilegible en vez de «esperaba encontrar T2». */
    const t2 = r.trenes.find((t: any) => t.tren === 'T2');
    expect(t2).toBeDefined();
    expect(t2!.total).toBe(2);
    expect(t2!.pctMovidas).toBe(50);
    // 300−240 = +60 y 180−240 = −60 → media 0. Duran lo prometido de media,
    // pero se mueven la mitad de las veces: son dos problemas distintos y por
    // eso se enseñan en columnas distintas.
    expect(t2!.desviacionMediaMin).toBe(0);
    expect(t2!.ordenesColgadas).toBe(4);

    const t1 = r.trenes.find((t: any) => t.tren === 'T1');
    expect(t1).toBeDefined();
    expect(t1!.canceladas).toBe(1);
    expect(t1!.desviacionMediaMin).toBeNull(); // sin cierre no se inventa
  });
});
