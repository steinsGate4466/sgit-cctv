import { NotFoundException } from '@nestjs/common';
import { AmbitoGuard } from '../src/common/guards/ambito.guard';

/**
 * ÁMBITO POR IDENTIFICADOR (12.3) — OWASP A01
 *
 * ===========================================================================
 *  POR QUÉ ESTE ARCHIVO PRUEBA LOS DOS CASOS EN CADA SITUACIÓN
 * ===========================================================================
 *  Cerrar de MENOS deja el agujero abierto: se nota tarde y mal.
 *  Cerrar de MÁS rompe trabajo legítimo: se nota cuando alguien está en
 *  planta, con casco, y no puede abrir la orden que tiene que ejecutar.
 *
 *  De los dos, el segundo es el que hace que la gente vuelva al cuaderno.
 *  Así que por cada regla hay dos pruebas: **el propio pasa** y **el ajeno
 *  no**. Una sola de las dos no demuestra nada.
 */

function contexto(handlerMeta: any, params: any, user: any = { userId: 'u1' }) {
  return {
    getHandler: () => 'h',
    getClass: () => 'c',
    switchToHttp: () => ({ getRequest: () => ({ params, user }) }),
  } as any;
}
const reflector = (meta: any) => ({ getAllAndOverride: () => meta } as any);

/** Prisma de mentira. `trenes` = ámbito del usuario. */
function prismaFalso(trenes: string[], entidad: any = {}, ubicacionesPorTren: Record<string, string[]> = {}) {
  return {
    user: { findUnique: jest.fn().mockResolvedValue({ ambitoTrenes: trenes }) },
    /* El árbol de ubicaciones, tal como lo lee `filtroDeUbicaciones`:
       un nodo TREN con su código, y los puntos colgando de él. */
    location: {
      findMany: jest.fn().mockImplementation(() =>
        Promise.resolve(
          Object.entries(ubicacionesPorTren).flatMap(([tren, ids]) => [
            { id: `TREN-${tren}`, parentId: null, type: 'TREN', code: tren, stageId: null },
            ...ids.map((id) => ({ id, parentId: `TREN-${tren}`, type: 'PUNTO', code: id, stageId: null })),
          ]),
        ),
      ),
    },
    processStage: { findMany: jest.fn().mockResolvedValue([]) },
    asset: { findUnique: jest.fn().mockResolvedValue(entidad.asset) },
    cabinet: { findUnique: jest.fn().mockResolvedValue(entidad.cabinet) },
    workOrder: { findUnique: jest.fn().mockResolvedValue(entidad.workOrder) },
    incident: { findUnique: jest.fn().mockResolvedValue(entidad.incident) },
    ventanaParada: { findUnique: jest.fn().mockResolvedValue(entidad.ventanaParada) },
    instalacion: { findUnique: jest.fn().mockResolvedValue(entidad.instalacion) },
  } as any;
}

describe('ámbito por id · el caso que hace que sea seguro desplegarlo hoy', () => {
  it('ÁMBITO VACÍO = todos los trenes: no se consulta ni la entidad', async () => {
    // TODOS los usuarios de hoy tienen el ámbito vacío. Este guard no cambia
    // el comportamiento de nadie hasta que el ingeniero restrinja a alguien.
    // Si esta prueba fallara, el despliegue dejaría a la planta sin ver nada.
    const prisma = prismaFalso([], { asset: { locationId: 'L-T1' } });
    const g = new AmbitoGuard(reflector({ recurso: 'asset', param: 'id' }), prisma);

    await expect(g.canActivate(contexto(null, { id: 'a1' }))).resolves.toBe(true);
    expect(prisma.asset.findUnique).not.toHaveBeenCalled();
  });

  it('sin decorador, no se comprueba nada', async () => {
    const prisma = prismaFalso(['T2']);
    const g = new AmbitoGuard(reflector(undefined), prisma);
    await expect(g.canActivate(contexto(null, { id: 'x' }))).resolves.toBe(true);
  });

  it('@SinAmbito tampoco comprueba', async () => {
    const prisma = prismaFalso(['T2']);
    const g = new AmbitoGuard(reflector({ recurso: null, param: null }), prisma);
    await expect(g.canActivate(contexto(null, { id: 'x' }))).resolves.toBe(true);
  });
});

describe('ámbito por id · el propio pasa, el ajeno no', () => {
  const ubicaciones = { T1: ['L-T1'], T2: ['L-T2'] };

  it('EL PROPIO PASA: usuario del T2 pide un activo del T2', async () => {
    const prisma = prismaFalso(['T2'], { asset: { locationId: 'L-T2' } }, ubicaciones);
    const g = new AmbitoGuard(reflector({ recurso: 'asset', param: 'id' }), prisma);
    await expect(g.canActivate(contexto(null, { id: 'a1' }))).resolves.toBe(true);
  });

  it('EL AJENO NO: usuario del T2 pide un activo del T1', async () => {
    // Este es el agujero. Copiar un id de un enlace y cambiarlo en la barra
    // de direcciones era todo lo que hacía falta.
    const prisma = prismaFalso(['T2'], { asset: { locationId: 'L-T1' } }, ubicaciones);
    const g = new AmbitoGuard(reflector({ recurso: 'asset', param: 'id' }), prisma);
    await expect(g.canActivate(contexto(null, { id: 'a1' }))).rejects.toThrow(NotFoundException);
  });

  it('devuelve 404 y NO 403: un 403 confirmaría que el activo existe', async () => {
    // Con 403 se pueden recorrer identificadores y dibujar el inventario del
    // vecino sin llegar a leer un solo campo.
    const prisma = prismaFalso(['T2'], { asset: { locationId: 'L-T1' } }, ubicaciones);
    const g = new AmbitoGuard(reflector({ recurso: 'asset', param: 'id' }), prisma);
    await expect(g.canActivate(contexto(null, { id: 'a1' }))).rejects.toMatchObject({ status: 404 });
  });

  it('con varios trenes permitidos, pasan los suyos', async () => {
    const prisma = prismaFalso(['T1', 'T2'], { asset: { locationId: 'L-T1' } }, ubicaciones);
    const g = new AmbitoGuard(reflector({ recurso: 'asset', param: 'id' }), prisma);
    await expect(g.canActivate(contexto(null, { id: 'a1' }))).resolves.toBe(true);
  });

  it('con varios trenes permitidos, el tercero sigue sin pasar', async () => {
    const prisma = prismaFalso(['T1', 'T2'], { asset: { locationId: 'L-T3' } },
      { T1: ['L-T1'], T2: ['L-T2'] });
    const g = new AmbitoGuard(reflector({ recurso: 'asset', param: 'id' }), prisma);
    await expect(g.canActivate(contexto(null, { id: 'a1' }))).rejects.toThrow(NotFoundException);
  });
});

describe('ámbito por id · lo que NO se puede bloquear', () => {
  const ubicaciones = { T2: ['L-T2'] };

  it('un activo SIN ubicación pasa: está en STOCK, no es de ningún tren', async () => {
    // Bloquearlo dejaría el almacén invisible para media planta.
    const prisma = prismaFalso(['T2'], { asset: { locationId: null } }, ubicaciones);
    const g = new AmbitoGuard(reflector({ recurso: 'asset', param: 'id' }), prisma);
    await expect(g.canActivate(contexto(null, { id: 'a1' }))).resolves.toBe(true);
  });

  it('un registro que no existe pasa: el 404 lo da el servicio con su mensaje', async () => {
    const prisma = prismaFalso(['T2'], { asset: null }, ubicaciones);
    const g = new AmbitoGuard(reflector({ recurso: 'asset', param: 'id' }), prisma);
    await expect(g.canActivate(contexto(null, { id: 'noexiste' }))).resolves.toBe(true);
  });

  it('si la base falla, PASA: este guard no puede tumbar el sistema', async () => {
    // Defensa en profundidad, no única capa. El permiso ya se comprobó antes.
    const prisma = prismaFalso(['T2']);
    prisma.user.findUnique.mockRejectedValue(new Error('base caída'));
    const g = new AmbitoGuard(reflector({ recurso: 'asset', param: 'id' }), prisma);
    await expect(g.canActivate(contexto(null, { id: 'a1' }))).resolves.toBe(true);
  });

  it('si el árbol de ubicaciones no resuelve nada, PASA', async () => {
    // Cerrar por falta de datos no es cerrar por decisión.
    const prisma = prismaFalso(['T2'], { asset: { locationId: 'L-T1' } }, {});
    const g = new AmbitoGuard(reflector({ recurso: 'asset', param: 'id' }), prisma);
    await expect(g.canActivate(contexto(null, { id: 'a1' }))).resolves.toBe(true);
  });

  it('sin sesión pasa: eso ya lo paró el guard de autenticación', async () => {
    const prisma = prismaFalso(['T2']);
    const g = new AmbitoGuard(reflector({ recurso: 'asset', param: 'id' }), prisma);
    await expect(g.canActivate(contexto(null, { id: 'a1' }, {}))).resolves.toBe(true);
  });

  it('sin el parámetro en la ruta pasa', async () => {
    const prisma = prismaFalso(['T2']);
    const g = new AmbitoGuard(reflector({ recurso: 'asset', param: 'id' }), prisma);
    await expect(g.canActivate(contexto(null, {}))).resolves.toBe(true);
  });
});

describe('ámbito por id · cada recurso llega a su tren por su camino', () => {
  const ubicaciones = { T2: ['L-T2'] };

  it('la OM usa su propia ubicación si la tiene', async () => {
    const prisma = prismaFalso(['T2'],
      { workOrder: { locationId: 'L-T2', asset: { locationId: 'L-T1' } } }, ubicaciones);
    const g = new AmbitoGuard(reflector({ recurso: 'workOrder', param: 'id' }), prisma);
    await expect(g.canActivate(contexto(null, { id: 'w1' }))).resolves.toBe(true);
  });

  it('la OM sin ubicación propia cae en la del activo', async () => {
    const prisma = prismaFalso(['T2'],
      { workOrder: { locationId: null, asset: { locationId: 'L-T1' } } }, ubicaciones);
    const g = new AmbitoGuard(reflector({ recurso: 'workOrder', param: 'id' }), prisma);
    await expect(g.canActivate(contexto(null, { id: 'w1' }))).rejects.toThrow(NotFoundException);
  });

  it('la incidencia llega por su activo', async () => {
    const prisma = prismaFalso(['T2'], { incident: { asset: { locationId: 'L-T2' } } }, ubicaciones);
    const g = new AmbitoGuard(reflector({ recurso: 'incident', param: 'id' }), prisma);
    await expect(g.canActivate(contexto(null, { id: 'i1' }))).resolves.toBe(true);
  });

  it('la ventana de parada guarda el tren a pelo: el ajeno no pasa', async () => {
    const prisma = prismaFalso(['T2'], { ventanaParada: { tren: 'T1' } }, ubicaciones);
    const g = new AmbitoGuard(reflector({ recurso: 'ventanaParada', param: 'id' }), prisma);
    await expect(g.canActivate(contexto(null, { id: 'p1' }))).rejects.toThrow(NotFoundException);
  });

  it('la ventana de parada del propio tren sí pasa', async () => {
    const prisma = prismaFalso(['T2'], { ventanaParada: { tren: 'T2' } }, ubicaciones);
    const g = new AmbitoGuard(reflector({ recurso: 'ventanaParada', param: 'id' }), prisma);
    await expect(g.canActivate(contexto(null, { id: 'p1' }))).resolves.toBe(true);
  });

  it('una instalación sin tren ni ubicación pasa: todavía no se sabe dónde va', async () => {
    const prisma = prismaFalso(['T2'], { instalacion: { locationId: null, tren: null } }, ubicaciones);
    const g = new AmbitoGuard(reflector({ recurso: 'instalacion', param: 'id' }), prisma);
    await expect(g.canActivate(contexto(null, { id: 'x1' }))).resolves.toBe(true);
  });

  it('el parámetro puede llamarse distinto de `id`', async () => {
    const prisma = prismaFalso(['T2'], { workOrder: { locationId: 'L-T1', asset: null } }, ubicaciones);
    const g = new AmbitoGuard(reflector({ recurso: 'workOrder', param: 'woId' }), prisma);
    await expect(g.canActivate(contexto(null, { woId: 'w1' }))).rejects.toThrow(NotFoundException);
  });
});
