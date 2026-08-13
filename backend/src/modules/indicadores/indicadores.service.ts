import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  mttr, mtbf, disponibilidad, cumplimientoPreventivo, backlog, peoresEquipos,
  HORA, OrdenParaCalculo,
} from './calculo';

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
  constructor(private readonly prisma: PrismaService) {}

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
      backlog: backlog(ordenes),
      peores: peores.map((p) => ({
        ...p,
        assetCode: porId.get(p.assetId)?.assetCode ?? '(borrado)',
        tipo: porId.get(p.assetId)?.type ?? null,
        lugar: porId.get(p.assetId)?.location?.name ?? null,
      })),
      totalOrdenes: ordenes.length,
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
