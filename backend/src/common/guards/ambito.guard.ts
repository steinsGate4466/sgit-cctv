import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { CLAVE_AMBITO, RecursoConAmbito } from '../ambito.decorator';
import { ambitoDelUsuario, noVeNada, veTodo } from '../ambito-usuario';
import { filtroDeUbicaciones } from '../ambito-planta';

/**
 * GUARD DE ÁMBITO POR IDENTIFICADOR (bloque 12.3)
 *
 * Antes de que el controlador toque nada, comprueba que el registro pedido
 * está dentro de los trenes que ese usuario puede mirar. Si no lo está,
 * responde 404 — ver la nota del decorador sobre por qué 404 y no 403.
 *
 * ===========================================================================
 *  LAS TRES REGLAS QUE EVITAN QUE ESTO ROMPA TRABAJO LEGÍTIMO
 * ===========================================================================
 *  Cerrar de más es peor que cerrar de menos, porque no se nota hasta que
 *  alguien no puede hacer su trabajo en planta y llama por radio.
 *
 *  1. ÁMBITO VACÍO = TODOS LOS TRENES. Es como funciona ya el resto del
 *     sistema. Hoy TODOS los usuarios tienen el ámbito vacío, así que este
 *     guard **no cambia el comportamiento de nadie** hasta que el ingeniero
 *     decida restringir a alguien. Se despliega sin riesgo.
 *
 *  2. UN REGISTRO SIN UBICACIÓN PASA. Un activo en STOCK, una orden de
 *     mapeo que todavía no tiene equipo, un permiso de altura sin activo:
 *     no pertenecen a ningún tren. Bloquearlos dejaría el almacén invisible
 *     para media planta.
 *
 *  3. SI LA COMPROBACIÓN FALLA, PASA. Si la base no responde, este guard no
 *     puede ser el que tumbe el sistema. Falla abriendo **a propósito**: es
 *     una capa de defensa en profundidad, no la única. El permiso ya se
 *     comprobó antes y el usuario ya está autenticado.
 */
@Injectable()
export class AmbitoGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * De cada recurso, cómo se llega a su ubicación.
   * `porTren` es para los que guardan el código de tren directamente.
   */
  private async ubicacionDelRecurso(
    recurso: RecursoConAmbito,
    id: string,
  ): Promise<{ existe: boolean; locationId?: string | null; tren?: string | null }> {
    const p: any = this.prisma;

    switch (recurso) {
      case 'asset': {
        const r = await p.asset.findUnique({ where: { id }, select: { locationId: true } });
        return { existe: !!r, locationId: r?.locationId };
      }
      case 'cabinet': {
        const r = await p.cabinet.findUnique({ where: { id }, select: { locationId: true } });
        return { existe: !!r, locationId: r?.locationId };
      }
      case 'location': {
        const r = await p.location.findUnique({ where: { id }, select: { id: true } });
        return { existe: !!r, locationId: r?.id };
      }
      case 'workOrder': {
        // La OM puede colgar de un activo o de una ubicación. Se mira la suya
        // primero; si no tiene, la del activo.
        const r = await p.workOrder.findUnique({
          where: { id },
          select: { locationId: true, asset: { select: { locationId: true } } },
        });
        return { existe: !!r, locationId: r?.locationId ?? r?.asset?.locationId };
      }
      case 'incident': {
        const r = await p.incident.findUnique({
          where: { id }, select: { asset: { select: { locationId: true } } },
        });
        return { existe: !!r, locationId: r?.asset?.locationId };
      }
      case 'accessRequest': {
        const r = await p.accessRequest.findUnique({
          where: { id }, select: { asset: { select: { locationId: true } } },
        });
        return { existe: !!r, locationId: r?.asset?.locationId };
      }
      case 'inspeccionGrua': {
        const r = await p.inspeccionGrua.findUnique({
          where: { id }, select: { asset: { select: { locationId: true } } },
        });
        return { existe: !!r, locationId: r?.asset?.locationId };
      }
      case 'instalacion': {
        const r = await p.instalacion.findUnique({
          where: { id }, select: { locationId: true, tren: true },
        });
        return { existe: !!r, locationId: r?.locationId, tren: r?.tren };
      }
      case 'ventanaParada': {
        const r = await p.ventanaParada.findUnique({ where: { id }, select: { tren: true } });
        return { existe: !!r, tren: r?.tren };
      }
      case 'assetCable': {
        const r = await p.assetCable.findUnique({
          where: { id }, select: { asset: { select: { locationId: true } } },
        });
        return { existe: !!r, locationId: r?.asset?.locationId };
      }
      default:
        return { existe: true }; // recurso desconocido: no se inventa un bloqueo
    }
  }

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<{ recurso: RecursoConAmbito | null; param: string }>(
      CLAVE_AMBITO,
      [contexto.getHandler(), contexto.getClass()],
    );
    if (!meta?.recurso) return true; // sin declarar, o declarado @SinAmbito

    const req = contexto.switchToHttp().getRequest();
    const id = req.params?.[meta.param];
    if (!id) return true;

    const userId = req.user?.userId;
    if (!userId) return true; // ya lo habría parado el guard de autenticación

    try {
      const ambito = await ambitoDelUsuario(this.prisma, userId);
      const { trenes } = ambito;

      /* BLOQUE 42. Rol sectorizado sin tren asignado: no alcanza a NINGÚN
         recurso. Se responde 404 y no 403 a propósito, igual que el resto del
         guard: un 403 confirma que el recurso existe, y a alguien que no puede
         verlo tampoco se le confirma que está ahí. */
      if (noVeNada(ambito)) throw new NotFoundException();

      // Rol sin sectorizar: camino rápido, ve todo.
      if (veTodo(ambito)) return true;

      const objetivo = await this.ubicacionDelRecurso(meta.recurso, id);

      // Que no exista lo dirá el servicio con su propio mensaje.
      if (!objetivo.existe) return true;

      // Recurso que guarda el tren a pelo (ventana de parada, instalación).
      if (objetivo.tren) {
        if (!trenes.includes(String(objetivo.tren).toUpperCase())) throw new NotFoundException();
        return true;
      }

      // REGLA 2: sin ubicación no pertenece a ningún tren.
      if (!objetivo.locationId) return true;

      // Ubicaciones alcanzables por este usuario, uniendo sus trenes.
      const partes = await Promise.all(
        trenes.map((t) => filtroDeUbicaciones(this.prisma, { tren: t })),
      );
      const permitidas = new Set<string>();
      for (const parte of partes) (parte?.in ?? []).forEach((x) => permitidas.add(x));

      // Si no se pudo resolver ninguna ubicación (árbol sin cargar todavía),
      // no se bloquea: sería cerrar por falta de datos, no por decisión.
      if (permitidas.size === 0) return true;

      if (!permitidas.has(objetivo.locationId)) {
        // 404, no 403: un 403 confirmaría que el registro existe.
        throw new NotFoundException();
      }
      return true;
    } catch (e) {
      // El NotFound es nuestro y tiene que salir.
      if (e instanceof NotFoundException) throw e;
      // REGLA 3: cualquier otro fallo (base caída, modelo raro) no puede
      // tumbar el sistema desde aquí. Defensa en profundidad, no única capa.
      return true;
    }
  }
}
