import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { WorkOrderStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UpsertPreventivePlanDto } from './dto/upsert-plan.dto';
import { conReintentoDeCodigo, siguienteCorrelativo } from '../../common/correlativo';
import { motivoNumeroSapInvalido, normalizarNumeroSap } from '../../common/aviso-sap';
import {
  PlanParaProgramar, VentanaParaProgramar, actividadDeLaOrden, programar,
} from '../../common/programacion-preventiva';
import { resolverContextoDePlanta, intervaloParaAmbiente } from '../../common/plant-context';
import { CriticidadService } from '../criticidad/criticidad.service';
import { diaDePlanta } from '../../common/dia-de-planta';

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
    /* Bloque 78. La frecuencia del preventivo la manda la letra A/B/C, no sólo
       el intervalo que se escribió a mano en el plan. */
    private criticidad: CriticidadService,
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

    /* Bloque 168: lo que el sistema ya sabe no se teclea. Sin intervalo, el
       del AMBIENTE de su etapa (bloque 24); sin «último mantenimiento», el
       último preventivo CERRADO de ese equipo. */
    let interval = dto.intervalDays && dto.intervalDays > 0 ? dto.intervalDays : 0;
    if (!interval) {
      const ctx = await resolverContextoDePlanta(this.prisma, [{ id: asset.id, locationId: asset.locationId, criticality: asset.criticality }]).catch(() => ({} as any));
      interval = dto.zoneCritical ? 30 : ((ctx as any)?.[asset.id]?.intervaloDias ?? 60);
    }
    let last = dto.lastServiceAt ? diaDePlanta(dto.lastServiceAt) : null;
    if (!last) {
      const ultimo = await this.prisma.workOrder.findFirst({
        where: { assetId: asset.id, type: 'PREVENTIVO', status: 'CERRADA' },
        orderBy: { executedDate: 'desc' }, select: { executedDate: true, endedAt: true },
      });
      last = ultimo?.endedAt ?? ultimo?.executedDate ?? null;
    }
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

  /* ===========================================================================
     BLOQUE 180 · EL PREVENTIVO PROGRAMA Y VINCULA. NO CREA ÓRDENES SOLO.
     ---------------------------------------------------------------------------
     Decisión 3 de Cristhian (22/10/2026): «solo programa y vincula». La OM de
     una rutina la genera SAP —plan de mantenimiento + hoja de ruta— y aquí se
     VINCULA a su rutina. Hasta el bloque 179 este servicio creaba órdenes
     preventivas cada madrugada con número propio: dos órdenes para el mismo
     trabajo, una en SAP y otra aquí, y el reparto del comité contando las que
     nadie pidió.

     Lo que SÍ sigue haciendo, y es lo que vale: decir QUÉ rutina toca y CUÁNDO
     (vencimiento, letra A/B/C, ambiente, ventana de parada) y, al vincular,
     poner en la orden los pasos de su hoja de ruta y la fecha programada.
     =========================================================================== */

  /** Lo que hace falta para programar, UNA vez para todo el lote (bloque 78). */
  private async contextoDeProgramacion(
    planes: Array<{ assetId: string; asset: any }>,
    now: Date,
  ) {
    const activos = planes.map((d) => ({ id: d.assetId, locationId: d.asset?.locationId ?? null }));
    /* Si algo de esto falla, se programa con lo que haya: una rutina sin sus
       pasos vale más que no saber que toca. */
    const [ventanas, hojas, letras, ctx] = await Promise.all([
      this.prisma.ventanaParada.findMany({
        where: { estado: { in: ['ANUNCIADA', 'CONFIRMADA'] as any }, inicioPrevisto: { gte: now } },
        select: { id: true, tren: true, estado: true, inicioPrevisto: true },
      }).catch(() => [] as any[]),
      this.prisma.hojaDeRuta.findMany({
        where: { activa: true },
        select: {
          tipoEquipo: true,
          operaciones: { select: { operacion: true, subOperacion: true, descripcion: true } },
        },
      }).catch(() => [] as any[]),
      this.criticidad.resumen().then((r: any) => {
        const m: Record<string, any> = {};
        for (const e of r.equipos || []) m[e.id] = e;
        return m;
      }).catch(() => ({} as Record<string, any>)),
      resolverContextoDePlanta(this.prisma, activos).catch(() => ({} as any)),
    ]);
    const pasosPorTipo = new Map<string, { op: number; sub: number | null; texto: string }[]>();
    for (const h of hojas as any[]) {
      pasosPorTipo.set(h.tipoEquipo, (h.operaciones || []).map((o: any) => ({
        op: o.operacion, sub: o.subOperacion, texto: o.descripcion,
      })));
    }
    return {
      ventanas: ventanas as VentanaParaProgramar[],
      pasosPorTipo,
      letras: letras as Record<string, any>,
      ctx: ctx as Record<string, any>,
    };
  }

  /**
   * Programa UNA rutina: fecha, si espera parada y la actividad con los pasos
   * de su hoja de ruta (bloque 78). La fecha casa tres cosas —cuándo vence,
   * qué frecuencia manda y cuándo se puede entrar—.
   */
  private programarRutina(
    plan: { assetId: string; nextDueAt: Date | null; intervalDays: number; asset: any },
    contexto: Awaited<ReturnType<PreventiveService['contextoDeProgramacion']>>,
    now: Date,
  ) {
    // Zona = gabinete (si está montado) o ubicación del activo.
    const zone: string | undefined = plan.asset?.cabinet?.code
      ? `${plan.asset?.location?.name || 'Planta'} — ${plan.asset.cabinet.code}`
      : plan.asset?.location?.name || undefined;
    const c = contexto.ctx?.[plan.assetId];
    const paraProgramar: PlanParaProgramar = {
      assetId: plan.assetId,
      assetCode: plan.asset?.assetCode,
      tipoEquipo: plan.asset?.type as string,
      trenCode: c?.trenCode ?? null,
      vencePlan: plan.nextDueAt,
      diasDelPlan: plan.intervalDays,
      diasPorLetra: contexto.letras?.[plan.assetId]?.diasEntreRevisiones ?? null,
      diasPorAmbiente: c?.intervaloDias ?? intervaloParaAmbiente(c?.ambiente ?? null),
      /* Lo FIRMADO, no la propuesta. Sin firma vale EXIGE_PARADA: un equipo
         sin declarar espera ventana, que es fallar hacia el lado seguro. */
      intervencionAplica: c?.intervencionAplica ?? 'EXIGE_PARADA',
    };
    const pr = programar(paraProgramar, contexto.ventanas, now);
    const actividad = actividadDeLaOrden(pr, contexto.pasosPorTipo.get(plan.asset?.type as string) ?? []);
    return { zone, pr, actividad, trenCode: paraProgramar.trenCode };
  }

  /** Las rutinas activas de equipos en operación: ni dados de baja ni en almacén. */
  private planesQueTocan(hasta: Date) {
    return this.prisma.preventivePlan.findMany({
      where: {
        active: true,
        nextDueAt: { lte: hasta },
        asset: { deletedAt: null, status: { notIn: ['BAJA', 'STOCK'] as any } },
      },
      include: {
        asset: {
          select: {
            id: true, assetCode: true, type: true, locationId: true,
            location: { select: { name: true } },
            cabinet: { select: { code: true } },
          },
        },
      },
      orderBy: { nextDueAt: 'asc' },
    });
  }

  /**
   * BLOQUE 180 · EL PROGRAMA: qué rutina toca y cuándo. NO crea nada.
   *
   * Por rutina dice si ya tiene su OM —y si esa OM tiene ya su N° de SAP—. Lo
   * que queda «sin OM» es trabajo que SAP todavía no ha generado o que nadie
   * ha vinculado: es la lista con la que el Jefe va a SAP.
   */
  async programa(diasAdelante = 30) {
    const now = new Date();
    const dias = Math.max(0, Math.min(90, Math.round(Number(diasAdelante) || 0)));
    const planes = await this.planesQueTocan(this.addDays(now, dias));
    const ids = planes.map((p) => p.assetId);
    /* Una consulta para todas, no una por rutina (lección del bloque 105). Se
       queda la MÁS ANTIGUA de cada equipo: es la que lleva más esperando. */
    const abiertas = ids.length
      ? await this.prisma.workOrder.findMany({
          where: { assetId: { in: ids }, type: 'PREVENTIVO', status: { in: OPEN_WO } },
          orderBy: { createdAt: 'asc' },
          select: { id: true, code: true, externalRef: true, assetId: true, status: true },
        })
      : [];
    const ordenDe = new Map<string, (typeof abiertas)[number]>();
    for (const o of abiertas) if (o.assetId && !ordenDe.has(o.assetId)) ordenDe.set(o.assetId, o);

    const contexto = await this.contextoDeProgramacion(planes, now);
    const filas = planes.map((p) => {
      const { zone, pr, actividad, trenCode } = this.programarRutina(p, contexto, now);
      const orden = ordenDe.get(p.assetId) ?? null;
      return {
        planId: p.id,
        assetId: p.assetId,
        assetCode: p.asset.assetCode,
        tipo: p.asset.type,
        zona: zone ?? null,
        tren: trenCode,
        vence: p.nextDueAt,
        vencida: !!p.nextDueAt && p.nextDueAt.getTime() < now.getTime(),
        programada: pr.fecha,
        esperandoParada: pr.esperandoVentana,
        actividad,
        orden: orden ? { id: orden.id, code: orden.code, externalRef: orden.externalRef, status: orden.status } : null,
      };
    });
    return {
      generadoEn: now.toISOString(),
      diasAdelante: dias,
      resumen: {
        tocan: filas.length,
        sinOm: filas.filter((f) => !f.orden).length,
        omSinSap: filas.filter((f) => f.orden && !f.orden.externalRef).length,
        vinculadas: filas.filter((f) => f.orden?.externalRef).length,
        esperandoParada: filas.filter((f) => f.esperandoParada).length,
      },
      filas,
    };
  }

  /**
   * BLOQUE 180 · VINCULAR LA OM DE SAP A SU RUTINA.
   *
   * SAP generó la orden de la rutina (plan + hoja de ruta) y aquí se apunta.
   * La orden de SGIT nace con lo que el programa ya sabe: fecha programada,
   * zona y los pasos de su hoja de ruta, COPIADOS (bloque 78: si mañana cambia
   * la hoja, una orden emitida no cambia sola).
   *
   * Reglas:
   *   1. Sólo PREVENTIVO. Correctivo, mejora e instalación nacen de un aviso.
   *   2. Si el equipo ya tiene una preventiva viva SIN N° SAP (las que creaba
   *      este servicio hasta el bloque 179), se le pone el número a ESA: dos
   *      órdenes para la misma rutina son dos cuadrillas al mismo poste.
   *   3. Si ya tiene una con OTRO N° SAP, no se crea otra: se dice cuál es.
   *   4. Si el N° SAP ya está en otra orden, se avisa (no se impide).
   *   5. Queda auditado con quién lo vinculó.
   */
  async vincularSap(assetId: string, texto: string | null | undefined, userId: string | null, ip?: string | null) {
    const numero = normalizarNumeroSap(texto);
    if (!numero) throw new BadRequestException('Escribe el N° de la OM preventiva que generó SAP.');
    const malo = motivoNumeroSapInvalido(numero);
    if (malo) throw new BadRequestException(malo);

    const plan = await this.prisma.preventivePlan.findUnique({
      where: { assetId },
      include: {
        asset: {
          select: {
            id: true, assetCode: true, type: true, locationId: true, deletedAt: true, status: true,
            location: { select: { name: true } },
            cabinet: { select: { code: true } },
          },
        },
      },
    });
    if (!plan) throw new NotFoundException('Este equipo no tiene rutina preventiva: créala en «+ Nuevo plan».');
    if (!plan.active) throw new BadRequestException('La rutina de este equipo está desactivada.');
    if (plan.asset.deletedAt || ['BAJA', 'STOCK'].includes(plan.asset.status as string)) {
      throw new BadRequestException('El equipo no está en operación (baja o almacén): su rutina no se ejecuta.');
    }

    const viva = await this.prisma.workOrder.findFirst({
      where: { assetId, type: 'PREVENTIVO', status: { in: OPEN_WO } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, code: true, externalRef: true },
    });
    if (viva?.externalRef && viva.externalRef !== numero) {
      throw new ConflictException(
        `${plan.asset.assetCode} ya tiene la preventiva ${viva.code} con la OM SAP ${viva.externalRef}. `
        + 'Si la de SAP es otra, cierra o corrige esa primero.',
      );
    }
    const otra = await this.prisma.workOrder.findFirst({
      where: { externalRef: numero, ...(viva ? { id: { not: viva.id } } : {}) },
      select: { code: true },
    });
    const aviso = otra
      ? `La OM SAP ${numero} también está en la orden ${otra.code}. Si es un error de tecleo, corrígelo con «N° SAP».`
      : null;
    if (viva?.externalRef === numero) {
      return { orden: viva, creada: false, aviso };
    }
    if (viva) {
      const orden = await this.prisma.workOrder.update({
        where: { id: viva.id }, data: { externalRef: numero }, select: { id: true, code: true, externalRef: true },
      });
      await this.audit.record({
        userId, action: 'PREVENTIVE_VINCULAR_SAP', entity: 'work_orders', entityId: viva.id, ip,
        after: { activo: plan.asset.assetCode, om: viva.code, externalRef: numero, creada: false },
      });
      return { orden, creada: false, aviso };
    }

    const now = new Date();
    const contexto = await this.contextoDeProgramacion([plan], now);
    const { zone, pr, actividad } = this.programarRutina(plan, contexto, now);
    const orden = await conReintentoDeCodigo(async () => this.prisma.workOrder.create({
      data: {
        code: await this.nextCode(),
        type: 'PREVENTIVO',
        status: 'ABIERTA',
        assetId: plan.assetId,
        zone,
        activity: actividad,
        // La fecha la pone el programa: vencimiento real, o la ventana de parada.
        scheduledDate: pr.fecha,
        externalRef: numero,
        requestChannel: 'SAP',
        receivedAt: now,
        createdById: userId || undefined,
      },
      select: { id: true, code: true, externalRef: true },
    }));
    await this.audit.record({
      userId, action: 'PREVENTIVE_VINCULAR_SAP', entity: 'work_orders', entityId: orden.id, ip,
      after: {
        activo: plan.asset.assetCode, om: orden.code, externalRef: numero, creada: true,
        programada: pr.fecha.toISOString(), esperandoParada: pr.esperandoVentana,
      },
    });
    return { orden, creada: true, aviso, esperandoParada: pr.esperandoVentana };
  }

  /**
   * BLOQUE 180 · LO QUE TOCA HOY, DOCUMENTADO.
   *
   * Lo llama el planificador UNA vez al día (bloque 100: con candado). No crea
   * nada: deja en la auditoría qué rutinas tocaban hoy y cuántas seguían sin su
   * OM de SAP. «Lo que no está documentado, no ocurrió»: en una auditoría, esto
   * es lo que demuestra que el programa avisó a tiempo.
   */
  async programaDelDia(ip = 'sistema (automático)') {
    const p = await this.programa(0);
    const pendientes = p.filas.filter((f) => !f.orden || !f.orden.externalRef);
    await this.audit.record({
      userId: null, action: 'PREVENTIVE_PROGRAMA', entity: 'preventive_plans', ip,
      after: {
        tocan: p.resumen.tocan,
        sinOm: p.resumen.sinOm,
        omSinSap: p.resumen.omSinSap,
        esperandoParada: p.resumen.esperandoParada,
        equipos: pendientes.slice(0, 40).map((f) => f.assetCode),
      },
    });
    return p.resumen;
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
