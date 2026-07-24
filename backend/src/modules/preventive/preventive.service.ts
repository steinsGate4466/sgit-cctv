import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UpsertPreventivePlanDto } from './dto/upsert-plan.dto';

// OM preventivas que cuentan como "ya en curso" (no se duplica la generación).
const OPEN_WO = ['ABIERTA', 'EN_PROCESO', 'EN_ESPERA'];

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

  /** Código correlativo de OM que no colisione con códigos manuales ya existentes. */
  private async nextCode(): Promise<string> {
    const year = new Date().getFullYear();
    let n = await this.prisma.workOrder.count();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      n++;
      const code = `OM-${year}-${String(n).padStart(4, '0')}`;
      const exists = await this.prisma.workOrder.findUnique({ where: { code } });
      if (!exists) return code;
    }
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
   * Genera OM preventivas para los planes vencidos que no tengan ya una OM preventiva
   * abierta. Pensado para un botón del Jefe o una tarea programada diaria.
   */
  async generateDue(userId?: string | null, ip?: string | null) {
    const now = new Date();
    const due = await this.prisma.preventivePlan.findMany({
      where: { active: true, nextDueAt: { lte: now } },
      include: { asset: { select: { assetCode: true } } },
    });
    let created = 0;
    const codes: string[] = [];
    for (const plan of due) {
      const openWo = await this.prisma.workOrder.findFirst({
        where: { assetId: plan.assetId, type: 'PREVENTIVO', status: { in: OPEN_WO as any } },
      });
      if (openWo) continue;
      const code = await this.nextCode();
      await this.prisma.workOrder.create({
        data: {
          code,
          type: 'PREVENTIVO',
          status: 'ABIERTA',
          assetId: plan.assetId,
          activity: `Mantenimiento preventivo programado (cada ${plan.intervalDays} días).`,
          scheduledDate: now,
        },
      });
      codes.push(code);
      created++;
    }
    await this.audit.record({
      userId: userId || null, action: 'PREVENTIVE_GENERATE', entity: 'work_orders', ip,
      after: { generadas: created, codigos: codes },
    });
    return { generated: created, codes };
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
