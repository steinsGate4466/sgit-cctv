import { Injectable } from '@nestjs/common';
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
    const abiertas: any = { in: ['ABIERTA', 'EN_PROCESO', 'EN_ESPERA'] };

    const [
      sinDetallar, vencidas, materialesPendientes, accesos,
      incidenciasCriticas, bajoMinimo, sinDevolver,
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

    return {
      sinDetallar,
      vencidas,
      firmasPendientes,
      accesos,
      incidenciasCriticas,
      bajoMinimo,
      sobrantes,
      resumen: {
        sinDetallar: sinDetallar.length,
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
