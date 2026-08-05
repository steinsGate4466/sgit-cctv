import {
  CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  CupoRitmo, EstadoRitmo, RITMO_GENERAL, claveRitmo, estadoRitmoInicial, evaluarRitmo,
} from '../ritmo';

export const RITMO = 'ritmo_cupo';

/**
 * Aprieta el tope en una ruta concreta:
 *   @Ritmo(RITMO_PESADO)
 */
export const Ritmo = (cupo: CupoRitmo) => SetMetadata(RITMO, cupo);

/**
 * LÍMITE DE PETICIONES GENERAL (bloque 12.2).
 *
 * Va como guard global: se aplica a TODO sin tener que acordarse de marcar
 * cada ruta — que es justo el error que dejó 214 endpoints sin freno.
 *
 * Convive con `FrenoGuard` sin pisarlo: aquel cuenta intentos de ADIVINAR un
 * secreto (login, PIN) y castiga fuerte; éste cuenta VOLUMEN y es generoso.
 * Son dos preguntas distintas y por eso son dos guardas distintas.
 *
 * Devuelve 429 con `Retry-After`, para que la pantalla pueda decir cuánto
 * falta en vez de un error genérico.
 */
@Injectable()
export class RitmoGuard implements CanActivate {
  private readonly mapa = new Map<string, EstadoRitmo>();
  private ultimaLimpieza = 0;

  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    // Sólo peticiones HTTP. Un temporizador interno o un evento no pasan por
    // aquí, pero si algún día llegan, que no revienten.
    if (ctx.getType() !== 'http') return true;

    const especifico = this.reflector.getAllAndOverride<CupoRitmo>(RITMO, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const cupo = especifico || RITMO_GENERAL;

    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();
    const ahora = Date.now();

    this.limpiar(ahora);

    // Por usuario cuando hay sesión; por IP cuando no la hay. En planta todos
    // salen por la misma IP, así que contar por IP castigaría al equipo entero
    // por culpa de uno.
    const quien = req.user?.userId || this.origen(req);
    // La familia separa los contadores: gastar el cupo del Excel no debe
    // dejar sin cupo al técnico que está trabajando.
    const familia = especifico ? (req.route?.path || req.url) : 'general';
    const k = claveRitmo(quien, familia);

    const estado = this.mapa.get(k) || estadoRitmoInicial();
    const v = evaluarRitmo(estado, cupo, ahora);
    this.mapa.set(k, v.estado);

    if (!v.permitido) {
      res?.setHeader?.('Retry-After', String(v.esperaSeg));
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message:
            `Demasiadas peticiones seguidas. Espera ${v.esperaSeg} segundo(s) y vuelve a intentarlo. ` +
            `Si no estabas haciendo nada raro, avisa: puede ser una pantalla repitiendo una llamada.`,
          esperaSeg: v.esperaSeg,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    res?.setHeader?.('X-RateLimit-Remaining', String(v.restantes));
    return true;
  }

  /** IP real detrás del proxy de Railway. */
  private origen(req: any): string {
    const cab = req.headers?.['x-forwarded-for'];
    const primera = Array.isArray(cab) ? cab[0] : (cab || '').split(',')[0];
    return (primera || req.ip || 'desconocido').trim();
  }

  /**
   * Barrido cada 5 minutos. Sin esto el mapa crece para siempre: cada IP y
   * cada usuario que pase una vez deja su entrada. Es el clásico goteo de
   * memoria de los frenos escritos con prisa.
   */
  private limpiar(ahora: number) {
    if (ahora - this.ultimaLimpieza < 5 * 60_000) return;
    this.ultimaLimpieza = ahora;
    const corte = ahora - 10 * 60_000;
    for (const [k, e] of this.mapa) {
      if (!e.golpes.length || e.golpes[e.golpes.length - 1] < corte) this.mapa.delete(k);
    }
  }
}
