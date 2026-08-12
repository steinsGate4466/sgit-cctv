import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccesoService } from './acceso.service';
import { origenDe } from '../../common/origen';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';

/**
 * EL GUARD QUE DECIDE SI ESTE APARATO PUEDE ENTRAR.
 *
 * Lee `src/modules/acceso/acceso.service.ts` para el porqué del diseño y para
 * lo que la MAC y la IP pueden y NO pueden hacer.
 *
 * ===========================================================================
 *  ESTE GUARD ESTÁ ESCRITO PARA NO DEJARTE FUERA
 * ===========================================================================
 *  Un control de acceso mal puesto no se nota como un fallo: se nota como
 *  "el sistema no funciona" un lunes a las seis, con la planta parada y sin
 *  nadie que pueda entrar a arreglarlo. Por eso:
 *
 *   · Las rutas PÚBLICAS (login, salud) **no se bloquean nunca**. Si no,
 *     no habría por dónde entrar a desactivarlo.
 *   · Sin ningún dispositivo aprobado, **no bloquea**. Una lista blanca
 *     vacía es una puerta cerrada con la llave dentro.
 *   · Un aparato **sin identificador** (navegador viejo, almacenamiento
 *     bloqueado, modo privado) **pasa**, y se anota. Bloquearlo dejaría
 *     fuera a alguien por una configuración de su navegador, no por una
 *     decisión de nadie.
 *   · Si algo falla al comprobar, **pasa**.
 *   · `ACCESO_DISPOSITIVO_OFF=1` lo apaga entero sin tocar la base.
 *
 *  Todo lo anterior significa que este guard falla ABRIENDO. Es correcto:
 *  es una capa sobre la contraseña y el token, no la puerta principal.
 */
@Injectable()
export class AccesoDispositivoGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly acceso: AccesoService,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    // Las rutas públicas —login incluido— nunca se tocan.
    const publica = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      contexto.getHandler(), contexto.getClass(),
    ]);
    if (publica) return true;

    try {
      const modo = await this.acceso.modo();
      if (modo === 'LIBRE') return true;

      const req = contexto.switchToHttp().getRequest();
      const o = origenDe(req);

      // Sin identificador no se bloquea: sería castigar una configuración
      // del navegador, no una decisión de seguridad.
      if (!o.dispositivoId) return true;

      const estado = await this.acceso.registrarVisto(o.dispositivoId, {
        ip: o.ip, userAgent: req.headers?.['user-agent'], usuarioId: req.user?.userId,
      });

      if (modo === 'AVISAR') return true;  // se apunta y ya está

      if (estado === 'BLOQUEADO') {
        throw new ForbiddenException(
          'Este equipo está bloqueado para entrar al sistema. Habla con el Jefe de Mantenimiento.',
        );
      }
      if (estado === 'PENDIENTE') {
        // SEGURO: si no hay ninguno aprobado, no se bloquea a nadie.
        const r = await this.acceso.resumen();
        if (!r.estrictoEfectivo) return true;
        throw new ForbiddenException(
          'Este equipo todavía no está autorizado para entrar al sistema. ' +
          'Ya quedó registrado: pídele al Jefe de Mantenimiento que lo apruebe ' +
          'desde Equipos conocidos → Dispositivos.',
        );
      }
      return true;
    } catch (e) {
      if (e instanceof ForbiddenException) throw e;
      // Cualquier otro fallo no puede tumbar el sistema desde aquí.
      return true;
    }
  }
}
