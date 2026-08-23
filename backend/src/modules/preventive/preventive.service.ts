import { Injectable, NotFoundException } from '@nestjs/common';
import { WorkOrderStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UpsertPreventivePlanDto } from './dto/upsert-plan.dto';
import {
  conReintentoDeCodigo, esChoqueDeUnicidad, siguienteCorrelativo,
} from '../../common/correlativo';

/* OM preventivas que cuentan como "ya en curso" (no se duplica la generación).

   VA ANOTADA CON EL ENUM, y antes no lo estaba: se usaba con `as any` para
   callar al compilador. Eso funcionaba y a la vez apagaba la única alarma que
   había — con `as any`, escribir 'EN_PROSESO' habría compilado igual y la
   comprobación de duplicados no habría encontrado nunca esa orden, generando
   preventivas repetidas en silencio. Lo encontró `verificar-constructores`. */
const OPEN_WO: WorkOrderStatus[] = ['ABIERTA', 'EN_PROCESO', 'EN_ESPERA'];

export type PlanStatus = 'AL_DIA' | 'PROXIMO' | 'VENCIDO' | 'SIN_PROGRAMAR' | 'INACTIVO';

@Injectable()
export class PreventiveService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private addDays(base: Date, days: number): Date {
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    return d;
  }

  /** Estado del plan según su próxima fecha de vencimiento. */
  private planStatus(nextDueAt: Date | null, active: boolean): PlanStatus {
    if (!active) return 'INACTIVO';
    if (!nextDueAt) return 'SIN_PROGRAMAR';
    const days = Math.round((new Date(nextDueAt).getTime() - Date.now()) / 86400000);
    if (days < 0) return 'VENCIDO';
    if (days <= 30) return 'PROXIMO';
    return 'AL_DIA';
  }

  /**
   * Código correlativo del año que no colisione con códigos manuales (SAP)
   * ya existentes. Parte del mayor correlativo del año, no del total de OM.
   *
   * ---------------------------------------------------------------------------
   * BLOQUE 37 — SE QUITÓ EL `while (true)`
   * ---------------------------------------------------------------------------
   * La versión anterior recorría números preguntando «¿existe ya?» hasta dar
   * con uno libre. Tenía dos problemas:
   *
   *  1. NO ARREGLABA LA CARRERA que decía arreglar. Entre el «¿existe?» y el
   *     `create` sigue habiendo un hueco, así que dos procesos podían recibir
   *     el mismo número libre y chocar igual. Comprobar antes de escribir da
   *     una sensación de seguridad que no se corresponde con nada.
   *
   *  2. ERA UN BUCLE SIN SALIDA. Si algo hacía que el `create` no llegara a
   *     ocurrir —una excepción río arriba, por ejemplo—, el bucle podía
   *     recorrer miles de números haciendo una consulta por cada uno. Un
   *     bucle infinito en el generador automático de preventivas es de las
   *     cosas que tumban un servidor un domingo por la noche.
   *
   * Ahora se calcula UNA vez y el choque lo absorbe `conReintentoDeCodigo`
   * alrededor del `create`, que es donde el choque de verdad ocurre.
   */
  private async nextCode(): Promise<string> {
    const prefijo = `OM-${new Date().getFullYear()}-`;
    const last = await this.prisma.workOrder.findFirst({
      where: { code: { startsWith: prefijo } },
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    return siguienteCorrelativo(last?.code, prefijo);
  }

  async listPlans() {
    const plans = await this.prisma.preventivePlan.findMany({
      include: {
        asset: {
          select: {
            id: true, assetCode: true, type: true, criticality: true,
            location: { select: { name: true } },
          },
        },
      },
      orderBy: [{ nextDueAt: 'asc' }],
    });
    return plans.map((p) => ({ ...p, statusPlan: this.planStatus(p.nextDueAt, p.active) }));
  }

  async summary() {
    const plans = await this.prisma.preventivePlan.findMany({ select: { nextDueAt: true, active: true } });
    const s = { total: plans.length, alDia: 0, proximos: 0, vencidos: 0, sinProgramar: 0, inactivos: 0 };
    for (const p of plans) {
      switch (this.planStatus(p.nextDueAt, p.active)) {
        case 'AL_DIA': s.alDia++; break;
        case 'PROXIMO': s.proximos++; break;
        case 'VENCIDO': s.vencidos++; break;
        case 'SIN_PROGRAMAR': s.sinProgramar++; break;
        default: s.inactivos++;
      }
    }
    return s;
  }

  /** Crea o actualiza el plan preventivo de un activo (intervalo por criticidad de zona). */
  async upsertPlan(dto: UpsertPreventivePlanDto, userId?: string | null, ip?: string | null) {
    const asset = await this.prisma.asset.findUnique({ where: { id: dto.assetId } });
    if (!asset || asset.deletedAt) throw new NotFoundException('Activo no encontrado');

    const interval = dto.intervalDays && dto.intervalDays > 0
      ? dto.intervalDays
      : (dto.zoneCritical ? 30 : 60);
    const last = dto.lastServiceAt ? new Date(dto.lastServiceAt) : null;
    const base = last || new Date();
    const nextDueAt = this.addDays(base, interval);

    const plan = await this.prisma.preventivePlan.upsert({
      where: { assetId: dto.assetId },
      update: {
        intervalDays: interval,
        zoneCritical: dto.zoneCritical ?? undefined,
        lastServiceAt: last ?? undefined,
        nextDueAt,
        active: dto.active ?? undefined,
      },
      create: {
        assetId: dto.assetId,
        intervalDays: interval,
        zoneCritical: !!dto.zoneCritical,
        lastServiceAt: last,
        nextDueAt,
        active: dto.active ?? true,
      },
    });
    await this.audit.record({
      userId: userId || null, action: 'PREVENTIVE_PLAN', entity: 'preventive_plans', entityId: plan.id, ip,
      after: { activo: asset.assetCode, intervaloDias: interval, zonaCritica: !!dto.zoneCritical },
    });
    return { ...plan, statusPlan: this.planStatus(plan.nextDueAt, plan.active) };
  }

  /**
   * Genera órdenes de mantenimiento **PREVENTIVAS** (y solo preventivas) para los planes
   * vencidos. Es la única generación automática del sistema: correctivo, mejora y
   * predictivo siempre nacen de una decisión humana (incidencia, análisis o mejora).
   *
   * Reglas de negocio aplicadas:
   *  1. Solo planes ACTIVOS y con vencimiento dentro de la ventana (vencidos + lookahead).
   *  2. Se excluyen activos dados de baja (deletedAt) o en estado BAJA / STOCK:
   *     no tiene sentido mantener un equipo que no está en operación.
   *  3. No se duplica: si el activo ya tiene una OM preventiva abierta, se omite.
   *  4. La OM hereda la ZONA del activo (ubicación) para ubicar el trabajo en planta.
   *  5. `scheduledDate` = fecha real de vencimiento del plan (no "hoy"), para que el
   *     indicador de OM vencidas refleje el atraso verdadero.
   *  6. Todo queda auditado con el detalle de lo generado.
   *
   * @param lookaheadDays  genera también las que vencen dentro de N días (0 = solo vencidas).
   */
  async generateDue(userId?: string | null, ip?: string | null, lookaheadDays = 0) {
    const now = new Date();
    const limit = lookaheadDays > 0 ? this.addDays(now, lookaheadDays) : now;

    const due = await this.prisma.preventivePlan.findMany({
      where: {
        active: true,
        nextDueAt: { lte: limit },
        // Solo activos vigentes y en operación.
        asset: { deletedAt: null, status: { notIn: ['BAJA', 'STOCK'] as any } },
      },
      include: {
        asset: {
          select: {
            id: true, assetCode: true, type: true,
            location: { select: { name: true } },
            cabinet: { select: { code: true } },
          },
        },
      },
      orderBy: { nextDueAt: 'asc' },
    });

    const created: { code: string; asset: string; dueAt: Date | null }[] = [];
    const skipped: { asset: string; motivo: string }[] = [];

    for (const plan of due) {
      // Regla 3: no duplicar si ya hay una preventiva en curso para ese activo.
      const openWo = await this.prisma.workOrder.findFirst({
        where: { assetId: plan.assetId, type: 'PREVENTIVO', status: { in: OPEN_WO } },
        select: { id: true },
      });
      if (openWo) {
        skipped.push({ asset: plan.asset.assetCode, motivo: 'ya tiene una OM preventiva abierta' });
        continue;
      }

      // Regla 4: zona = gabinete (si está montado) o ubicación del activo.
      const zone = plan.asset.cabinet?.code
        ? `${plan.asset.location?.name || 'Planta'} — ${plan.asset.cabinet.code}`
        : plan.asset.location?.name || undefined;

      /* BLOQUE 37 — SE REINTENTA EN VEZ DE OMITIR.
         --------------------------------------------------------------------
         Antes, un choque de código dejaba el plan fuera del lote con el
         motivo «código en uso, reintentar». Pero nadie reintentaba: el lote
         lo lanza el programador automático de madrugada y no lo mira nadie.
         Resultado: un preventivo que tocaba y no se generó, y el aviso
         enterrado en el resumen de una tarea nocturna.

         Ahora el choque se absorbe. Lo que SÍ se sigue omitiendo es
         cualquier otro fallo: eso no es concurrencia y el lote no puede
         pararse entero por un plan malo. */
      try {
        const code = await conReintentoDeCodigo(async () => {
          const c = await this.nextCode();
          await this.prisma.workOrder.create({
            data: {
              code: c,
              type: 'PREVENTIVO',
              status: 'ABIERTA',
              assetId: plan.assetId,
              zone,
              activity:
                `Mantenimiento preventivo programado del activo ${plan.asset.assetCode} ` +
                `(frecuencia: cada ${plan.intervalDays} días${plan.zoneCritical ? ', zona crítica' : ''}).`,
              scheduledDate: plan.nextDueAt || now, // Regla 5
            },
          });
          return c;
        });
        created.push({ code, asset: plan.asset.assetCode, dueAt: plan.nextDueAt });
      } catch (e: any) {
        skipped.push({
          asset: plan.asset.assetCode,
          motivo: esChoqueDeUnicidad(e)
            ? 'el código siguió ocupado tras tres intentos'
            : (e?.message || 'no se pudo crear la orden'),
        });
      }
    }

    await this.audit.record({
      userId: userId || null,
      action: 'PREVENTIVE_GENERATE',
      entity: 'work_orders',
      ip,
      after: {
        generadas: created.length,
        omitidas: skipped.length,
        ventanaDias: lookaheadDays,
        codigos: created.map((c) => c.code),
        detalleOmitidas: skipped.slice(0, 20),
      },
    });

    return { generated: created.length, codes: created.map((c) => c.code), created, skipped };
  }

  /**
   * Estado de la generación automática (para mostrarlo en el tablero de Preventivo):
   * si está activa, a qué hora corre y cuándo fue la última ejecución automática.
   */
  async autoGenStatus() {
    const enabled = (process.env.PREVENTIVE_AUTOGEN || 'on').toLowerCase() !== 'off';
    const hour = Number(process.env.PREVENTIVE_AUTOGEN_HOUR ?? 6);
    const lookaheadDays = Number(process.env.PREVENTIVE_LOOKAHEAD_DAYS ?? 0);
    const last = await this.prisma.auditLog.findFirst({
      where: { action: 'PREVENTIVE_GENERATE', ip: 'sistema (automático)' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, after: true },
    });
    return {
      enabled,
      hour,
      lookaheadDays,
      lastRunAt: last?.createdAt || null,
      lastRunGenerated: (last?.after as any)?.generadas ?? null,
    };
  }

  /**
   * Reprograma el plan cuando se completa un preventivo del activo:
   * último servicio = ahora, próximo = ahora + intervalo. Lo llama el cierre de OM.
   */
  async markServiced(assetId: string, when: Date = new Date()) {
    const plan = await this.prisma.preventivePlan.findUnique({ where: { assetId } });
    if (!plan || !plan.active) return null;
    const nextDueAt = this.addDays(when, plan.intervalDays);
    return this.prisma.preventivePlan.update({
      where: { assetId },
      data: { lastServiceAt: when, nextDueAt },
    });
  }
}
