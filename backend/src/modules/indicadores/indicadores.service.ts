import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  HORA, OrdenParaCalculo, backlog, cumplimientoPreventivo, disponibilidad, mtbf, mttr, peoresEquipos, repartoDeTrabajo,
} from './calculo';
import {
  FallaParaCalculo, disponibilidadReal, mtbfReal, nivelDeServicio,
  peoresPorFallas, tiempoDeDeteccion, tiempoDeRespuesta, tiempoDeReparacion,
  tiempoSinServicio,
} from '../../common/fiabilidad';
import { cumplimientoNormativo } from '../../common/cumplimiento';
import { CriticidadService } from '../criticidad/criticidad.service';

/**
 * INDICADORES DE GESTIÓN DEL MANTENIMIENTO
 * =============================================================================
 *
 *  QUÉ CAMBIA ESTE MÓDULO
 *  --------------------------------------------------------------------------
 *  Hasta aquí el sistema era una herramienta OPERATIVA: sirve para trabajar.
 *  Esto lo convierte además en una herramienta de GESTIÓN: sirve para decidir.
 *
 *  Son los cuatro números con los que un jefe de mantenimiento defiende su
 *  presupuesto y responde en un comité. No hay que cargar nada nuevo: salen
 *  de las órdenes que ya se registran.
 *
 *  LA REGLA QUE ATRAVIESA TODO EL MÓDULO
 *  --------------------------------------------------------------------------
 *  **Sin datos suficientes se devuelve `null`, nunca un cero.**
 *
 *  Un cero se lee como «tardamos cero horas en reparar» o «disponibilidad del
 *  0 %». Los dos son mentira, y los dos se van a una diapositiva. `null` se
 *  pinta como «sin datos todavía», que es la verdad y además dice qué hay que
 *  hacer: registrar más.
 *
 *  Y por eso el MTBF exige DOS fallos: con uno no hay intervalo entre fallos,
 *  hay un fallo suelto.
 */
@Injectable()
export class IndicadoresService {
  constructor(
    private readonly prisma: PrismaService,
    // Bloque 78: la letra A/B/C es una de las seis reglas de cumplimiento.
    private readonly criticidad: CriticidadService,
  ) {}

  /**
   * Todo el tablero de una vez.
   *
   * Una sola consulta a órdenes y otra a activos: el ingeniero abre esto
   * desde una tablet con la wifi de la nave, y seis peticiones encadenadas
   * ahí se notan.
   */
  async tablero(dias = 90, tren?: string) {
    const desde = new Date(Date.now() - dias * 24 * HORA);
    const horasDelPeriodo = dias * 24;

    // El filtro por tren se resuelve por las ubicaciones del árbol, igual que
    // en el resto del sistema: el tren no es un campo de la orden.
    let idsUbicacion: string[] | null = null;
    if (tren) {
      const nodos = await this.prisma.location.findMany({
        select: { id: true, parentId: true, type: true, code: true },
      });
      const raiz = nodos.filter((n) => n.type === 'TREN' && n.code === tren).map((n) => n.id);
      const hijos = new Map<string, string[]>();
      for (const n of nodos) {
        if (!n.parentId) continue;
        hijos.set(n.parentId, [...(hijos.get(n.parentId) ?? []), n.id]);
      }
      const dentro = new Set<string>();
      const pila = [...raiz];
      while (pila.length) {
        const x = pila.pop()!;
        if (dentro.has(x)) continue;
        dentro.add(x);
        (hijos.get(x) ?? []).forEach((h) => pila.push(h));
      }
      idsUbicacion = [...dentro];
    }

    const where: any = { createdAt: { gte: desde } };
    if (idsUbicacion) {
      where.OR = [
        { locationId: { in: idsUbicacion } },
        { asset: { locationId: { in: idsUbicacion } } },
      ];
    }

    const filas = await this.prisma.workOrder.findMany({
      where,
      select: {
        id: true, type: true, status: true, assetId: true,
        createdAt: true, executedDate: true, endedAt: true, scheduledDate: true,
      },
    });

    /* CUÁNDO SE DA POR CERRADA UNA ORDEN.
       Se prefiere `endedAt` —la hora real que puso el técnico en campo— y si
       no la hay, `executedDate`. Sólo se considera cerrada si el ESTADO lo
       dice: una orden con fecha de ejecución pero abierta sigue abierta, y
       contarla cerrada mejoraría el MTTR con trabajo que no terminó. */
    const ordenes: OrdenParaCalculo[] = filas.map((o) => ({
      id: o.id,
      tipo: o.type as string,
      estado: o.status as string,
      assetId: o.assetId,
      creada: o.createdAt,
      cerrada: o.status === 'CERRADA' ? (o.endedAt ?? o.executedDate ?? null) : null,
      programada: o.scheduledDate,
    }));

    const r = mttr(ordenes);
    const fallos = ordenes.filter((o) => o.tipo === 'CORRECTIVO').length;
    const tiempoEntre = mtbf(fallos, horasDelPeriodo);

    const peores = peoresEquipos(ordenes, 10);
    const codigos = peores.length
      ? await this.prisma.asset.findMany({
          where: { id: { in: peores.map((p) => p.assetId) } },
          select: { id: true, assetCode: true, type: true, location: { select: { name: true } } },
        })
      : [];
    const porId = new Map(codigos.map((a) => [a.id, a]));

    return {
      periodo: { dias, desde, tren: tren ?? null },
      mttr: {
        horas: r.horas,
        muestra: r.muestra,
        // Se explica el número en la respuesta para que la pantalla no tenga
        // que inventarse el texto y las dos digan lo mismo.
        significa: 'Horas medias desde que se abre la orden hasta que se cierra. Incluye la espera de repuestos.',
      },
      mtbf: {
        horas: tiempoEntre,
        fallos,
        significa: 'Horas medias entre una avería y la siguiente. Sube cuando el mantenimiento funciona.',
        sinDatos: tiempoEntre === null ? 'Hacen falta al menos dos averías en el periodo para poder calcularlo.' : null,
      },
      disponibilidad: {
        pct: disponibilidad(r.horas, tiempoEntre),
        significa: 'Porcentaje del tiempo que los equipos están sirviendo.',
      },
      preventivo: cumplimientoPreventivo(ordenes),
      /* EL REPARTO DEL TRABAJO — bloque 65.
         El indicador que el ingeniero dibujó en el centro de su hoja: cuánto
         del trabajo es apagar incendios y cuánto es adelantarse. El MTTR dice
         cómo de rápido se repara; éste dice si hace falta reparar tanto. */
      reparto: repartoDeTrabajo(ordenes),
      backlog: backlog(ordenes),
      peores: peores.map((p) => ({
        ...p,
        assetCode: porId.get(p.assetId)?.assetCode ?? '(borrado)',
        tipo: porId.get(p.assetId)?.type ?? null,
        lugar: porId.get(p.assetId)?.location?.name ?? null,
      })),
      totalOrdenes: ordenes.length,

      /* ---------------------------------------------------------------------
         FIABILIDAD MEDIDA SOBRE AVERÍAS, NO SOBRE ÓRDENES (bloque 78).
         ---------------------------------------------------------------------
         Los cuatro números de arriba se quedan: son la serie histórica y
         quitarlos rompería la comparación con los meses anteriores. Pero el
         MTTR de arriba mide de «orden abierta» a «orden cerrada», que mezcla
         detección, organización y reparación en un solo número y le carga a
         mantenimiento horas que no son suyas.

         Esto de abajo los separa. Convive con lo de arriba a propósito:
         mientras la serie de eventos sea corta, tirar la vieja dejaría al
         ingeniero sin nada que mirar. */
      fiabilidad: await this.fiabilidad(desde, horasDelPeriodo, idsUbicacion),
      /* INDICADOR ⑤ DEL INGENIERO (bloque 78). */
      cumplimiento: await this.cumplimiento(desde, idsUbicacion),
    };
  }

  /**
   * CUMPLIMIENTO NORMATIVO: qué NO podríamos enseñar en una auditoría.
   *
   * No mide si el trabajo se hizo —eso es el cumplimiento del preventivo—:
   * mide si está DOCUMENTADO como el propio sistema exige. Para una auditoría,
   * un trabajo hecho y sin firmar no se hizo.
   *
   * Las seis reglas salen de obligaciones que este proyecto ya declaró en su
   * día. No se inventa ninguna: un requisito que el sistema no pide daría un
   * indicador imposible de poner en verde, y eso se deja de mirar.
   */
  async cumplimiento(desde: Date, idsUbicacion: string[] | null) {
    const dondeActivo: any = { deletedAt: null, status: { notIn: ['BAJA', 'STOCK'] } };
    if (idsUbicacion) dondeActivo.locationId = { in: idsUbicacion };

    const [zonas, ordenes, activos, conteoPorZona, letras] = await Promise.all([
      this.prisma.location.findMany({
        where: idsUbicacion ? { id: { in: idsUbicacion } } : {},
        select: {
          id: true, name: true, criticidadProduccion: true, porQueEsVital: true,
          intervencionFirmada: true, revisarAntesDe: true,
        },
      }),
      this.prisma.workOrder.findMany({
        where: { status: 'CERRADA', createdAt: { gte: desde } },
        select: { code: true, type: true, rootCause: true },
      }),
      this.prisma.asset.findMany({
        where: dondeActivo,
        select: { id: true, assetCode: true, medioAcceso: true },
      }),
      this.prisma.asset.groupBy({
        by: ['locationId'],
        where: { deletedAt: null, locationId: { not: null } },
        _count: { _all: true },
      }),
      /* La letra viene del módulo de criticidad y no se recalcula aquí: dos
         formas de sacar el mismo dato acaban dando dos respuestas. */
      this.criticidad.resumen().then((r: any) => {
        const m: Record<string, string> = {};
        for (const e of r.equipos || []) m[e.id] = e.letra;
        return m;
      }).catch(() => ({} as Record<string, string>)),
    ]);

    const conActivos = new Set(
      conteoPorZona.filter((c) => ((c as any)._count?._all ?? 0) > 0).map((c) => c.locationId!),
    );

    return cumplimientoNormativo({
      zonas: zonas.map((z) => ({
        id: z.id,
        nombre: z.name,
        criticidadProduccion: z.criticidadProduccion as string | null,
        porQueEsVital: z.porQueEsVital,
        intervencionFirmada: z.intervencionFirmada as string | null,
        revisarAntesDe: z.revisarAntesDe,
        tieneActivos: conActivos.has(z.id),
      })),
      ordenesCerradas: ordenes.map((o) => ({
        code: o.code, tipo: o.type as string, rootCause: o.rootCause,
      })),
      activos: activos.map((a) => ({
        assetCode: a.assetCode,
        medioAcceso: a.medioAcceso as string | null,
        letraAbc: letras[a.id] ?? null,
      })),
    });
  }

  /**
   * Los tres tramos con su dueño, la disponibilidad real y los dos indicadores
   * que faltaban de los cuatro del ingeniero.
   *
   * Va en su propio método y no dentro de `tablero` para poder probarlo y para
   * que se pueda pedir suelto desde la pantalla de fiabilidad.
   */
  async fiabilidad(desde: Date, horasDelPeriodo: number, idsUbicacion: string[] | null) {
    const dondeFalla: any = { occurredAt: { gte: desde } };
    if (idsUbicacion) dondeFalla.asset = { locationId: { in: idsUbicacion } };

    const [filas, equiposEnServicio] = await Promise.all([
      this.prisma.failureEvent.findMany({
        where: dondeFalla,
        select: {
          assetId: true, occurredAt: true, detectedAt: true,
          repairStartedAt: true, restoredAt: true,
          ocurrioEsEstimado: true, esFalsaAlarma: true,
        },
      }),
      /* El parque en servicio, para el nivel de servicio. Los de BAJA y los de
         almacén no vigilan nada: contarlos subiría el indicador sin que nadie
         viera más. */
      this.prisma.asset.count({
        where: {
          deletedAt: null,
          status: { notIn: ['BAJA', 'STOCK'] },
          type: 'CAMERA',
          ...(idsUbicacion ? { locationId: { in: idsUbicacion } } : {}),
        },
      }),
    ]);

    const fallas = filas as unknown as FallaParaCalculo[];
    const deteccion = tiempoDeDeteccion(fallas);
    const respuesta = tiempoDeRespuesta(fallas);
    const reparacion = tiempoDeReparacion(fallas);
    const sinServicio = tiempoSinServicio(fallas);

    const peores = peoresPorFallas(fallas, 10);
    const codigos = peores.length
      ? await this.prisma.asset.findMany({
          where: { id: { in: peores.map((p) => p.assetId) } },
          select: { id: true, assetCode: true, type: true },
        })
      : [];
    const porId = new Map(codigos.map((a) => [a.id, a]));

    return {
      /* Cuántas averías hay medidas. Va PRIMERO en la respuesta porque es lo
         que dice si el resto se puede mirar: con cuatro eventos ningún
         indicador significa nada, y la pantalla tiene que poder decirlo antes
         de pintar un número grande. */
      muestra: {
        total: fallas.filter((f) => !f.esFalsaAlarma).length,
        falsasAlarmas: fallas.filter((f) => f.esFalsaAlarma).length,
        sinHoraRealDeCaida: fallas.filter((f) => !f.esFalsaAlarma && f.ocurrioEsEstimado).length,
        aviso: fallas.length < 5
          ? 'Con menos de cinco averías registradas estos números son orientativos.'
          : null,
      },
      deteccion: {
        ...deteccion,
        dueno: 'Monitoreo y púlpito',
        significa: 'Horas desde que el equipo se cae hasta que alguien se entera.',
      },
      respuesta: {
        ...respuesta,
        dueno: 'Reparto del trabajo',
        significa: 'Horas desde que se sabe hasta que alguien se pone a arreglarlo.',
      },
      reparacion: {
        ...reparacion,
        dueno: 'Mantenimiento',
        significa: 'Horas de trabajo real. ESTE es el MTTR que le corresponde a mantenimiento.',
      },
      sinServicio: {
        ...sinServicio,
        dueno: 'Lo que ve Producción',
        significa: 'Horas totales que el equipo estuvo sin ver, de principio a fin.',
      },
      mtbf: {
        horas: mtbfReal(fallas, horasDelPeriodo),
        significa: 'Horas medias entre una avería y la siguiente, contadas sobre averías reales.',
      },
      disponibilidad: disponibilidadReal(fallas, horasDelPeriodo),
      /* INDICADOR ④ DEL INGENIERO. */
      nivelDeServicio: {
        ...nivelDeServicio(fallas, equiposEnServicio, horasDelPeriodo),
        significa: 'Qué porcentaje de la vigilancia estuvo disponible, contando cada cámara y cada hora.',
      },
      peores: peores.map((p) => ({
        ...p,
        assetCode: porId.get(p.assetId)?.assetCode ?? '(borrado)',
        tipo: porId.get(p.assetId)?.type ?? null,
      })),
    };
  }

  /**
   * La misma foto, mes a mes. Un número suelto no dice nada; lo que decide
   * si el mantenimiento está mejorando o empeorando es la tendencia.
   */
  async tendencia(meses = 6) {
    const desde = new Date();
    desde.setMonth(desde.getMonth() - meses);
    desde.setDate(1); desde.setHours(0, 0, 0, 0);

    const filas = await this.prisma.workOrder.findMany({
      where: { createdAt: { gte: desde } },
      select: {
        id: true, type: true, status: true, assetId: true,
        createdAt: true, executedDate: true, endedAt: true, scheduledDate: true,
      },
    });

    const porMes = new Map<string, OrdenParaCalculo[]>();
    for (const o of filas) {
      const clave = `${o.createdAt.getFullYear()}-${String(o.createdAt.getMonth() + 1).padStart(2, '0')}`;
      const item: OrdenParaCalculo = {
        id: o.id, tipo: o.type as string, estado: o.status as string, assetId: o.assetId,
        creada: o.createdAt,
        cerrada: o.status === 'CERRADA' ? (o.endedAt ?? o.executedDate ?? null) : null,
        programada: o.scheduledDate,
      };
      porMes.set(clave, [...(porMes.get(clave) ?? []), item]);
    }

    return [...porMes.entries()]
      .sort(([a], [b]) => (a > b ? 1 : -1))
      .map(([mes, lista]) => {
        const r = mttr(lista);
        const fallos = lista.filter((o) => o.tipo === 'CORRECTIVO').length;
        const tEntre = mtbf(fallos, 30 * 24);
        return {
          mes,
          mttrHoras: r.horas,
          correctivas: fallos,
          preventivas: lista.filter((o) => o.tipo === 'PREVENTIVO').length,
          cumplimientoPct: cumplimientoPreventivo(lista).pct,
          disponibilidadPct: disponibilidad(r.horas, tEntre),
        };
      });
  }
}
