import { Injectable } from '@nestjs/common';
import { evaluarEspera, ordenarPorUrgencia } from '../maintenance/espera';
import { WorkOrderStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * LA BANDEJA: lo que espera una decisión, hoy.
 *
 * POR QUÉ EXISTE
 * Para saber qué le tocaba, el ingeniero tenía que abrir cuatro pantallas:
 * órdenes, materiales por firmar, accesos por aprobar y hallazgos. Y acordarse
 * de mirarlas. Lo que no se ve, no se hace.
 *
 * Esto no es un tablero de indicadores: un indicador se mira, una bandeja se
 * VACÍA. Cada línea de aquí es algo que alguien está esperando.
 *
 * TODO EN UNA SOLA LLAMADA. Cinco peticiones desde una tablet con la wifi de
 * planta es medio minuto mirando una pantalla vacía.
 */
@Injectable()
export class BandejaService {
  constructor(private prisma: PrismaService) {}

  async bandeja(userId?: string | null) {
    const ahora = new Date();
    // Tipado de verdad, no `any`. El `: any` apaga la comprobación que
    // habría cazado el filtro anidado que tumbó el tablero el 02/08.
    // Además, si mañana alguien añade un estado al enum y se olvida de esta
    // lista, TypeScript no dirá nada — pero si se escribe mal uno de estos
    // tres, lo dice al compilar.
    const ABIERTAS: WorkOrderStatus[] = ['ABIERTA', 'EN_PROCESO', 'EN_ESPERA'];
    const abiertas = { in: ABIERTAS };

    const [
      sinDetallar, vencidas, materialesPendientes, accesos,
      incidenciasCriticas, bajoMinimo, sinDevolver, paradas,
    ] = await Promise.all([
      // 1. Asignadas y sin detallar. Es trabajo que todavía no se puede hacer.
      this.prisma.workOrder.findMany({
        where: { detailedAt: null, status: abiertas },
        select: {
          id: true, code: true, type: true, activity: true, scheduledDate: true,
          asset: { select: { assetCode: true } },
          technician: { select: { fullName: true } },
          assignedBy: { select: { fullName: true } },
        },
        orderBy: { scheduledDate: 'asc' },
        take: 50,
      }),

      // 2. Vencidas: pasaron de fecha y siguen abiertas.
      this.prisma.workOrder.findMany({
        where: { status: abiertas, scheduledDate: { lt: ahora } },
        select: {
          id: true, code: true, type: true, activity: true, scheduledDate: true,
          progressPct: true, asset: { select: { assetCode: true } },
        },
        orderBy: { scheduledDate: 'asc' },
        take: 50,
      }),

      // 3. Materiales pedidos esperando la firma del ingeniero.
      this.prisma.workOrderMaterial.findMany({
        where: { status: 'SOLICITADO', workOrder: { status: abiertas } },
        select: {
          id: true, description: true, plannedQty: true, unit: true, sapCode: true,
          workOrder: { select: { id: true, code: true } },
          sparePart: { select: { currentStock: true } },
        },
        take: 100,
      }),

      // 4. Permisos de altura sin resolver. Sin esto nadie sube.
      this.prisma.accessRequest.findMany({
        where: { status: { in: ['SOLICITADO', 'EN_REVISION'] as any } },
        select: {
          id: true, code: true, status: true, heightMeters: true, means: true,
          asset: { select: { assetCode: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: 50,
      }),

      // 5. Incidencias de prioridad alta sin cerrar.
      this.prisma.incident.findMany({
        where: {
          status: { in: ['ABIERTA', 'EN_DIAGNOSTICO', 'EN_PROCESO', 'EN_ESPERA'] as any },
          priority: { in: ['ALTA', 'CRITICA'] as any },
        },
        select: {
          id: true, code: true, title: true, priority: true, reportedAt: true,
          asset: { select: { assetCode: true } },
        },
        orderBy: { reportedAt: 'asc' },
        take: 50,
      }),

      // 6. Repuestos por debajo del mínimo. Se pregunta con SQL porque
      // comparar dos columnas entre sí no se puede expresar en el filtro.
      this.prisma.$queryRaw<any[]>`
        SELECT "id", "name", "sapCode", "currentStock", "minStock"
        FROM spare_parts
        WHERE "currentStock" <= "minStock"
        ORDER BY ("currentStock" - "minStock") ASC
        LIMIT 30
      `.catch(() => []),

      // 7. Material retirado y no devuelto en órdenes YA CERRADAS. Es la fuga
      // silenciosa: el stock quedó descontado por algo que volvió al estante.
      this.prisma.workOrderMaterial.findMany({
        where: { status: 'RETIRADO', workOrder: { status: 'CERRADA' } },
        select: {
          id: true, description: true, withdrawnQty: true, usedQty: true, unit: true,
          workOrder: { select: { id: true, code: true } },
        },
        take: 50,
      }),

      // 8. ÓRDENES PARADAS. Es la fuga más callada del sistema.
      //
      // Una orden EN ESPERA no aparece en ninguna lista de problemas: no
      // tiene fecha que venza, y esperar no es un error. Así que el trabajo
      // no se pierde, se OLVIDA — que es peor, porque nadie lo echa en falta
      // hasta que alguien pregunta por ese equipo semanas después.
      //
      // Se trae también el ÚLTIMO avance, que es donde el técnico dejó dicho
      // qué está esperando. Sin eso sólo se sabría que está parada, no por qué.
      this.prisma.workOrder.findMany({
        where: { status: 'EN_ESPERA' },
        select: {
          id: true, code: true, activity: true, updatedAt: true,
          asset: { select: { assetCode: true, referencePlace: true } },
          technician: { select: { fullName: true } },
          progress: {
            select: { reasonCode: true, note: true, reportedAt: true },
            orderBy: { reportedAt: 'desc' },
            take: 1,
          },
        },
        take: 100,
      }),
    ]);

    const sobrantes = sinDevolver
      .map((m) => ({ ...m, porDevolver: (m.withdrawnQty ?? 0) - (m.usedQty ?? 0) }))
      .filter((m) => m.porDevolver > 0);

    // El material pendiente se agrupa POR ORDEN: el ingeniero firma órdenes
    // enteras, no líneas sueltas. Enseñarle 40 líneas cuando son 6 órdenes le
    // hace creer que tiene seis veces más trabajo del que tiene.
    const porOrden = new Map<string, any>();
    for (const m of materialesPendientes) {
      const k = m.workOrder.id;
      if (!porOrden.has(k)) {
        porOrden.set(k, { workOrderId: k, code: m.workOrder.code, lineas: [], sinStock: 0 });
      }
      const g = porOrden.get(k);
      const falta = m.sparePart != null && (m.plannedQty ?? 0) > m.sparePart.currentStock;
      if (falta) g.sinStock++;
      g.lineas.push({
        id: m.id, description: m.description, plannedQty: m.plannedQty,
        unit: m.unit, sapCode: m.sapCode, falta,
      });
    }
    const firmasPendientes = [...porOrden.values()];

    // Se evalúa con la lógica pura de espera.ts: cuántos días lleva, si eso
    // es mucho PARA LO QUE ESPERA (un repuesto tarda; un permiso no), y con
    // qué frase se cuenta. Ordenado por urgencia real, no por antigüedad:
    // lo primero es lo que se pasó de plazo.
    const enEspera = ordenarPorUrgencia(
      paradas.map((o) => {
        const ultimo = o.progress[0];
        return evaluarEspera(
          {
            id: o.id,
            code: o.code,
            activity: o.activity,
            // Cuándo empezó a esperar: el último avance si lo hay, y si no
            // la última modificación de la orden. No es exacto, pero es
            // mucho mejor que no decir nada — y se afina solo en cuanto el
            // técnico registre un avance.
            desde: ultimo?.reportedAt ?? o.updatedAt,
            motivo: ultimo?.reasonCode ?? null,
            motivoTexto: ultimo?.note ?? null,
            // Los datos del equipo van DENTRO del objeto, no se pegan
            // después por índice: ordenarPorUrgencia reordena la lista, y
            // casar por posición después de ordenar es cómo se acaba
            // enseñando el equipo de otra orden.
            equipo: o.asset?.assetCode ?? null,
            lugar: o.asset?.referencePlace ?? null,
            tecnico: o.technician?.fullName ?? null,
          } as any,
          ahora.getTime(),
        );
      }),
    );

    return {
      sinDetallar,
      enEspera,
      vencidas,
      firmasPendientes,
      accesos,
      incidenciasCriticas,
      bajoMinimo,
      sobrantes,
      resumen: {
        sinDetallar: sinDetallar.length,
        enEspera: enEspera.length,
        // Las que además se pasaron del plazo razonable. Es el número que
        // de verdad hay que mirar: que haya órdenes en espera es normal.
        esperaExcedida: enEspera.filter((e) => e.excedida).length,
        vencidas: vencidas.length,
        firmasPendientes: firmasPendientes.length,
        accesos: accesos.length,
        incidenciasCriticas: incidenciasCriticas.length,
        bajoMinimo: bajoMinimo.length,
        sobrantes: sobrantes.length,
        // Total de cosas que esperan a alguien. Si es cero, la bandeja está
        // vacía y eso es una buena noticia que merece decirse.
        total: sinDetallar.length + vencidas.length + firmasPendientes.length
          + accesos.length + incidenciasCriticas.length + bajoMinimo.length + sobrantes.length,
      },
      generado: ahora.toISOString(),
    };
  }
}
