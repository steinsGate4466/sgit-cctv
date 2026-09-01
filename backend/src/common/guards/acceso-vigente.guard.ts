import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/* =============================================================================
   ¿ESTE ACCESO SIGUE VIGENTE? — bloque 82
   =============================================================================

   EL AGUJERO QUE CIERRA, detectado por el usuario:

       «Imagina que nos hackeen, podemos quitarle el acceso rápidamente.»

   Hasta ahora NO se podía. `jwt.strategy.ts` valida la FIRMA del token y ya:
   no consulta la base para nada. Los permisos viajan dentro del token, que
   dura 15 minutos. Consecuencia real:

     · desactivar a alguien no le cortaba el acceso — seguía entrando;
     · quitarle un rol tampoco: mantenía sus permisos viejos;
     · una sesión robada valía quince minutos.

   -----------------------------------------------------------------------------
   CÓMO SE CORTA AHORA

   El token lleva un contador (`pv`). Aquí se compara con el de la base:

       coinciden      →  pasa
       no coinciden   →  401, «tu acceso cambió, vuelve a entrar»
       usuario inactivo → 401, en el acto

   Subir el contador —al cambiar un rol, desactivar a alguien o pulsar «cortar
   acceso»— mata TODOS sus tokens a la vez.

   -----------------------------------------------------------------------------
   POR QUÉ HAY CACHÉ, Y POR QUÉ ES CORTA

   Sin caché esto sería una consulta a la base EN CADA PETICIÓN del sistema.
   Con 15 segundos, el peor caso es que alguien siga dentro 15 segundos más de
   la cuenta — frente a los 15 minutos de antes.

   Y la caché se BORRA a mano cuando se corta a alguien (`olvidar`), así que en
   la práctica el corte es instantáneo: los 15 segundos son sólo el techo si
   corren varias instancias del servidor y el corte lo atendió otra.

   -----------------------------------------------------------------------------
   LA REGLA QUE EVITA ECHAR A TODA LA PLANTA EL DÍA DEL DESPLIEGUE

   **Un token SIN contador pasa.** Los que estén vivos en el momento de
   desplegar se emitieron antes de que esto existiera y no lo llevan dentro; si
   se rechazaran, todo el mundo saldría a la calle a la vez, en mitad de un
   turno. En quince minutos el ciclo natural los renueva ya con contador.

   Es una ventana de un cuarto de hora UNA sola vez, en el despliegue, y es
   preferible a tirar a la planta entera de golpe.
============================================================================= */
@Injectable()
export class AccesoVigenteGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  /** userId → { version, hasta }. Se comparte entre peticiones a propósito. */
  private static cache = new Map<string, { version: number; activo: boolean; hasta: number }>();

  private static readonly MS_CACHE = 15_000;

  /**
   * Borra a alguien de la caché. Se llama al cortarle el acceso, y es lo que
   * hace que el corte se note EN EL ACTO en vez de en quince segundos.
   */
  static olvidar(userId: string) {
    AccesoVigenteGuard.cache.delete(userId);
  }

  /** Vacía la caché entera. Para cuando se tocan permisos de un rol completo. */
  static olvidarTodo() {
    AccesoVigenteGuard.cache.clear();
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;

    // Sin sesión no hay nada que comprobar: de eso ya se ocupa el guard de JWT.
    if (!user?.userId) return true;

    /* Token viejo, sin contador. Pasa — ver la cabecera. */
    if (user.pv === undefined || user.pv === null) return true;

    const ahora = Date.now();
    let e = AccesoVigenteGuard.cache.get(user.userId);

    if (!e || e.hasta < ahora) {
      /* SQL CRUDO, y con motivo: se piden DOS COLUMNAS de una tabla que tiene
         el hash de la contraseña. Un `findUnique` sin `select` lo traería
         entero a memoria en cada comprobación, y no hay ninguna razón para
         que un guard maneje eso.

         Además queda inmune al parche del cliente de Prisma que hace falta en
         el entorno del agente: el SQL es el mismo aquí y en la máquina del
         usuario, así que lo que se prueba es lo que se despliega. */
      const fila = await this.prisma.$queryRaw<
        { permisosVersion: number; active: boolean }[]
      >`SELECT "permisosVersion", "active" FROM "users" WHERE "id" = ${user.userId} LIMIT 1`
        .then((r) => r[0] ?? null)
        .catch(() => null);

      /* Si la base no responde, SE DEJA PASAR. Es defensa en profundidad, no
         la única capa: el token sigue estando firmado y sin caducar. Un fallo
         de base de datos no puede dejar a la planta entera sin sistema.

         Es la misma decisión que el guard de ámbito del bloque 12.3. */
      if (!fila) return true;

      /* `Number(...)` y no una anotación a secas: en el cliente de Prisma
         PARCHEADO de este entorno el campo se copió de uno booleano, así que
         TypeScript lo ve como `boolean`. En la máquina del usuario, con el
         cliente regenerado de verdad, es `Int` y esto es la identidad.

         Se convierte en vez de usar `as any` a propósito: un `as any` apagaría
         la comprobación para siempre, incluso el día que el campo cambie de
         tipo. Esto sigue fallando si algún día deja de ser un número. */
      e = {
        version: Number(fila.permisosVersion ?? 1),
        activo: fila.active,
        hasta: ahora + AccesoVigenteGuard.MS_CACHE,
      };
      AccesoVigenteGuard.cache.set(user.userId, e);
    }

    if (!e.activo) {
      throw new UnauthorizedException(
        'Tu usuario está desactivado. Habla con el Jefe de Mantenimiento.',
      );
    }
    if (e.version !== user.pv) {
      /* El mensaje dice QUÉ pasó y QUÉ hacer. «401» a secas hace pensar que el
         software se rompió; esto se entiende y se resuelve en diez segundos. */
      throw new UnauthorizedException(
        'Tus permisos cambiaron. Vuelve a entrar para que se apliquen.',
      );
    }
    return true;
  }
}
