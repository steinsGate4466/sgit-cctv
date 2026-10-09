import { Injectable } from '@nestjs/common';
import { IncidentStatus, WorkOrderStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { filtroConAmbito } from '../../common/ambito-usuario';
import { corteDeVencidas } from '../../common/dia-de-planta';

/* =============================================================================
   LO QUE ESPERA EN CADA MÓDULO, DE UN VISTAZO — bloque 170
   -----------------------------------------------------------------------------
   Petición del usuario: «los módulos más amigables visualmente, con todo lo
   que tenga que ver con la visibilidad».

   El menú decía DÓNDE están las cosas, pero no DÓNDE HAY ALGO QUE HACER. Para
   saber si había incidencias vivas o órdenes vencidas había que entrar a cada
   pantalla. Ahora el menú lleva un número al lado del módulo y de la pestaña.

   REGLAS
   · Sólo cuentas BARATAS (`count`), en una sola llamada: esto se pide al abrir
     la aplicación y cada pocos minutos; no puede costar lo que la bandeja.
   · Cada número sólo se calcula si la persona puede abrir esa pantalla. Un
     número que no se puede pulsar es ruido, y además dice algo que no le toca.
   · Respeta el ÁMBITO: el jefe del Tren 2 ve lo de su tren. Si el menú dijera
     9 y la lista enseñara 3, el número dejaría de creerse el primer día.
   · Cero no se devuelve: un «0» en cada entrada es ruido que tapa al que no
     es cero.
============================================================================= */

const VIVAS: IncidentStatus[] = ['ABIERTA', 'EN_DIAGNOSTICO', 'EN_PROCESO', 'EN_ESPERA'];
const ABIERTAS: WorkOrderStatus[] = ['ABIERTA', 'EN_PROCESO', 'EN_ESPERA'];

export interface Contador {
  n: number;
  /** Lo que se lee al pasar el ratón: qué se está contando. */
  que: string;
  /** `alerta` = hay algo vencido o grave; `aviso` = pendiente normal. */
  tono: 'alerta' | 'aviso';
}

@Injectable()
export class ContadoresService {
  constructor(private readonly prisma: PrismaService) {}

  async contadores(user: { userId?: string; permissions?: string[] } | null): Promise<Record<string, Contador>> {
    const can = (p: string) => (user?.permissions ?? []).includes(p);
    const ambito = await filtroConAmbito(this.prisma, user?.userId ?? null, {});
    const enAmbitoActivo = ambito ? { asset: { locationId: ambito } } : {};
    const enAmbitoOrden = ambito ? { OR: [{ asset: { locationId: ambito } }, { locationId: ambito }] } : {};
    const ahora = new Date();

    const tareas: Record<string, Promise<Contador | null>> = {};

    if (can('incident.read')) {
      tareas['/incidents'] = Promise.all([
        this.prisma.incident.count({ where: { status: { in: VIVAS }, ...enAmbitoActivo } }),
        this.prisma.incident.count({ where: { status: { in: VIVAS }, priority: { in: ['ALTA', 'CRITICA'] }, ...enAmbitoActivo } }),
      ]).then(([n, graves]) => ({
        n,
        que: graves ? `${n} incidencias vivas · ${graves} graves` : `${n} incidencias vivas`,
        tono: graves ? 'alerta' : 'aviso',
      }));
    }

    if (can('wo.read') || can('om.mirar')) {
      tareas['/maintenance'] = this.prisma.workOrder
        .count({ where: { status: { in: ABIERTAS }, scheduledDate: { lt: corteDeVencidas(ahora) }, ...enAmbitoOrden } })
        .then((n) => ({ n, que: `${n} órdenes fuera de plazo`, tono: 'alerta' as const }));
    }

    if (can('dashboard.read')) {
      tareas['/bandeja'] = this.prisma.workOrder
        .count({ where: { status: { in: ABIERTAS }, detailedAt: null, ...enAmbitoOrden } })
        .then((n) => ({ n, que: `${n} órdenes asignadas sin detallar`, tono: 'aviso' as const }));
    }

    if (can('access.read')) {
      tareas['/access'] = this.prisma.accessRequest
        .count({ where: { status: { in: ['SOLICITADO', 'EN_REVISION'] as any }, ...enAmbitoActivo } })
        .then((n) => ({ n, que: `${n} permisos de acceso por revisar`, tono: 'aviso' as const }));
    }

    if (can('asset.read')) {
      tareas['/instalaciones'] = this.prisma.instalacion
        .count({
          where: {
            estado: { in: ['SOLICITADA', 'EN_EVALUACION', 'EVALUADA', 'APROBADA', 'EN_EJECUCION'] },
            ...(ambito ? { locationId: ambito } : {}),
          },
        })
        .then((n) => ({ n, que: `${n} instalaciones en marcha`, tono: 'aviso' as const }));
    }

    if (can('inventory.read')) {
      tareas['/inventory'] = this.prisma.$queryRaw<{ n: bigint }[]>`
          SELECT COUNT(*)::bigint AS n FROM spare_parts WHERE "currentStock" <= "minStock"
        `
        .then((r) => {
          const n = Number(r?.[0]?.n ?? 0);
          return { n, que: `${n} repuestos en o bajo el mínimo`, tono: 'alerta' as const };
        });
    }

    /* Cada cuenta va por su lado: si una falla (tabla en migración, permiso
       raro), las demás salen igual. Un menú sin números es mejor que sin menú. */
    const claves = Object.keys(tareas);
    const res = await Promise.allSettled(claves.map((k) => tareas[k]));
    const salida: Record<string, Contador> = {};
    res.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value && r.value.n > 0) salida[claves[i]] = r.value;
    });
    return salida;
  }
}
