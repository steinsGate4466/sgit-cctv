import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';

/**
 * PRUEBAS DEL CONTROL DE ACCESO.
 *
 * Hasta hoy el sistema NO TENÍA NI UNA. Es la parte que más se da por
 * supuesta —"si pone @RequirePermissions ya está"— y la única cuyo fallo no
 * se nota: nadie llama para avisar de que ve cosas de más.
 *
 * Lo que se comprueba aquí es el guard en sí. Lo que se comprueba en
 * cobertura-permisos.spec.ts es que ningún endpoint se quede sin declararlo.
 */

function contexto(user: any, requeridos: string[] | undefined) {
  const reflector = { getAllAndOverride: () => requeridos } as unknown as Reflector;
  const ctx = {
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  return { guard: new PermissionsGuard(reflector), ctx };
}

describe('PermissionsGuard', () => {
  it('deja pasar si el endpoint no exige nada', () => {
    const { guard, ctx } = contexto({ permissions: [] }, undefined);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('deja pasar con el permiso exacto', () => {
    const { guard, ctx } = contexto({ permissions: ['wo.read'] }, ['wo.read']);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('RECHAZA sin el permiso', () => {
    const { guard, ctx } = contexto({ permissions: ['wo.read'] }, ['wo.approve']);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('exige TODOS los permisos, no basta con uno', () => {
    // Si bastara con uno, un rol de sólo lectura con 'wo.read' entraría a un
    // endpoint que pide ['wo.read', 'wo.approve'].
    const { guard, ctx } = contexto({ permissions: ['wo.read'] }, ['wo.read', 'wo.approve']);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('RECHAZA si no hay usuario en la petición', () => {
    // Nunca debería llegar aquí sin usuario —el guard del token va antes—
    // pero si algún día alguien reordena los guards, esto tiene que cerrarse,
    // no abrirse. Un fallo de seguridad no puede depender del orden.
    const { guard, ctx } = contexto(undefined, ['wo.read']);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('RECHAZA si el usuario no trae lista de permisos', () => {
    const { guard, ctx } = contexto({ email: 'x@y.z' }, ['wo.read']);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('distingue mayúsculas: WO.READ no es wo.read', () => {
    // Documenta el comportamiento a propósito. Los códigos se escriben en
    // minúscula en todo el sistema; si alguien inventa uno en mayúsculas, es
    // mejor que no funcione a que funcione a medias.
    const { guard, ctx } = contexto({ permissions: ['WO.READ'] }, ['wo.read']);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('un permiso PARECIDO no vale', () => {
    // 'wo.read' no debe abrir 'wo.readAll' ni al revés: nada de prefijos.
    const { guard, ctx } = contexto({ permissions: ['wo.rea'] }, ['wo.read']);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('el mensaje no dice QUÉ permiso falta', () => {
    // A quien ataca, la lista de permisos del sistema le ahorra trabajo.
    // A quien trabaja no le sirve de nada: no puede dárselo él mismo.
    const { guard, ctx } = contexto({ permissions: [] }, ['credential.read']);
    try {
      guard.canActivate(ctx);
      fail('debía rechazar');
    } catch (e: any) {
      expect(e.message).not.toMatch(/credential/);
    }
  });
});
