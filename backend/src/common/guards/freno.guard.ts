import {
  CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Cupo, EstadoFreno, barrer, clave, estadoInicial, evaluar } from '../freno';

export const FRENO = 'freno_cupo';

/**
 * Marca una ruta con su cupo de peticiones.
 *   @Freno(CUPO_PIN)
 */
export const Freno = (cupo: Cupo) => SetMetadata(FRENO, cupo);

/**
 * FRENO POR ORIGEN — se aplica sólo donde se pone @Freno.
 *
 * Se decidió NO ponerlo global. Un freno en todas las rutas suena más
 * seguro, pero el técnico que está mapeando gabinetes hace decenas de
 * peticiones seguidas de forma perfectamente legítima, y acabaría bloqueado
 * haciendo su trabajo. Se frena donde se ADIVINAN secretos: entrar y el PIN.
 *
 * Devuelve 429 con `Retry-After`, que es lo que la pantalla necesita para
 * decir cuánto falta en lugar de un error genérico.
 */
@Injectable()
export class FrenoGuard implements CanActivate {
  private readonly mapa = new Map<string, EstadoFreno>();
  private ultimoBarrido = 0;

  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const cupo = this.reflector.getAllAndOverride<Cupo>(FRENO, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!cupo) return true;

    const req = ctx.switchToHttp().getRequest();
    const ahora = Date.now();

    // Barrido periódico: sin esto, cada IP que toque el login deja una
    // entrada para siempre y el propio freno sería la fuga de memoria.
    if (ahora - this.ultimoBarrido > 60_000) {
      barrer(this.mapa, cupo, ahora);
      this.ultimoBarrido = ahora;
    }

    const k = clave(req.route?.path || req.url, this.origen(req));
    const v = evaluar(this.mapa.get(k) || estadoInicial(), cupo, ahora);
    this.mapa.set(k, v.estado);

    if (!v.permitido) {
      const res = ctx.switchToHttp().getResponse();
      res?.setHeader?.('Retry-After', String(v.esperaSeg));
      const min = Math.ceil(v.esperaSeg / 60);
      throw new HttpException(
        `Demasiados intentos. Espera ${min} minuto(s) y vuelve a probar.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  /**
   * IP real detrás del proxy de Railway.
   *
   * `x-forwarded-for` LA PUEDE PONER EL CLIENTE, así que se coge el PRIMER
   * valor sólo porque delante hay un proxy de confianza que la reescribe.
   * Si algún día se sirve sin ese proxy, esta línea deja de ser fiable y hay
   * que volver a req.ip a secas. Queda escrito para que no se olvide.
   */
  private origen(req: any): string {
    const ff = req.headers?.['x-forwarded-for'];
    if (typeof ff === 'string' && ff.trim()) return ff.split(',')[0].trim();
    return req.ip || req.socket?.remoteAddress || 'desconocido';
  }
}
