import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, PERMISSIONS_ANY_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const donde = [context.getHandler(), context.getClass()];
    const todos = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, donde);
    const alguno = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_ANY_KEY, donde);

    if ((!todos || !todos.length) && (!alguno || !alguno.length)) return true;

    const { user } = context.switchToHttp().getRequest();
    const granted: string[] = user?.permissions ?? [];

    // TODOS: el caso normal. La acción necesita esa llave, o esas llaves.
    if (todos && todos.length && !todos.every((p) => granted.includes(p))) {
      throw new ForbiddenException('Permisos insuficientes');
    }

    /* CUALQUIERA: sólo para listas de apoyo (bloque 66).
       -----------------------------------------------------------------------
       Un desplegable de equipos lo necesitan seis pantallas abiertas con seis
       permisos distintos. Exigir uno concreto dejaba el campo vacío a gente
       con derecho a rellenarlo; repartir ese permiso abría el módulo entero.
       Con «cualquiera de» basta con haber demostrado que tienes sitio en
       alguna de esas pantallas. El detalle de por qué está en el decorador. */
    if (alguno && alguno.length && !alguno.some((p) => granted.includes(p))) {
      throw new ForbiddenException('Permisos insuficientes');
    }

    return true;
  }
}
