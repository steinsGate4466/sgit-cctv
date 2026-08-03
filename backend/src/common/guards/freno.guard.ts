import {
  CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Cupo, EstadoFreno, clave, estadoInicial, evaluar } from '../freno';
import { PrismaService } from '../../prisma/prisma.service';

export const FRENO = 'freno_cupo';

/**
 * Marca una ruta con su cupo de peticiones.
 *   @Freno(CUPO_PIN)
 */
export const Freno = (cupo: Cupo) => SetMetadata(FRENO, cupo);

/**
 * FRENO POR ORIGEN — se aplica sólo donde se pone @Freno.
 *
 * AHORA EN BASE DE DATOS, NO EN MEMORIA.
 *
 * Vivía en un Map del proceso, y eso tenía dos agujeros:
 *   · se borraba en CADA DESPLIEGUE — bastaba esperar a uno para empezar de
 *     cero, y desplegamos varias veces al día;
 *   · no se compartía entre instancias: con dos, el límite efectivo era el
 *     doble, y bastaba con que las peticiones cayeran alternadas.
 *
 * Se paga una consulta por intento. Sólo se aplica en las rutas donde se
 * ADIVINAN secretos —entrar y el PIN—, que son pocas y poco frecuentes: es
 * un precio ridículo por un freno que de verdad frena.
 *
 * La lógica de decidir sigue en freno.ts, sin tocar y con sus 10 pruebas.
 * Lo único que cambia es DÓNDE se guarda el contador.
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
  private ultimaLimpieza = 0;

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const cupo = this.reflector.getAllAndOverride<Cupo>(FRENO, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!cupo) return true;

    const req = ctx.switchToHttp().getRequest();
    const ahora = Date.now();
    const k = clave(req.route?.path || req.url, this.origen(req));

    // Limpieza de lo caducado, de vez en cuando. Sin esto la tabla crece con
    // una fila por cada IP que haya tocado el login alguna vez.
    if (ahora - this.ultimaLimpieza > 10 * 60_000) {
      this.ultimaLimpieza = ahora;
      this.prisma.intentoAcceso.deleteMany({
        where: {
          actualizadoEn: { lt: new Date(ahora - 24 * 3600_000) },
          OR: [{ bloqueadoHasta: null }, { bloqueadoHasta: { lt: new Date(ahora) } }],
        },
      }).catch(() => null);
    }

    const fila = await this.prisma.intentoAcceso
      .findUnique({ where: { clave: k } })
      .catch(() => null);

    // Se reconstruye el estado que espera `evaluar`. Los golpes no se guardan
    // uno a uno —serían miles de filas— sino como CONTADOR + inicio de
    // ventana, que ocupa una fila.
    //
    // CONSECUENCIA, dicha para que nadie la descubra depurando: la ventana
    // pasa de DESLIZANTE a FIJA. En memoria, cada golpe caducaba por su
    // cuenta; aquí caducan todos juntos al pasar la ventana desde el primero.
    //
    // Para lo que hace falta —frenar a quien prueba contraseñas— da igual, y
    // en un caso es incluso mejor: quien se pasó del cupo empieza limpio en
    // vez de arrastrar golpes viejos de uno en uno.
    const previo: EstadoFreno = fila
      ? {
          golpes: Array(Math.min(fila.golpes, cupo.maximo + 1)).fill(fila.ventanaDesde.getTime()),
          bloqueadoHasta: fila.bloqueadoHasta?.getTime() ?? 0,
        }
      : estadoInicial();

    const v = evaluar(previo, cupo, ahora);

    // Se guarda el estado nuevo. Si esto fallara —base caída— NO se bloquea
    // al usuario: un fallo de la base no puede dejar a la planta sin poder
    // entrar. Se pierde la cuenta de ese intento y ya está.
    await this.prisma.intentoAcceso.upsert({
      where: { clave: k },
      create: {
        clave: k,
        golpes: v.estado.golpes.length,
        ventanaDesde: new Date(v.estado.golpes[0] ?? ahora),
        bloqueadoHasta: v.estado.bloqueadoHasta ? new Date(v.estado.bloqueadoHasta) : null,
      },
      update: {
        golpes: v.estado.golpes.length,
        ventanaDesde: new Date(v.estado.golpes[0] ?? ahora),
        bloqueadoHasta: v.estado.bloqueadoHasta ? new Date(v.estado.bloqueadoHasta) : null,
        actualizadoEn: new Date(ahora),
      },
    }).catch(() => null);

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
