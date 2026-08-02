import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { filtroDeUbicaciones } from '../../common/ambito-planta';
import { fechaLimite, estadoDetalle, actividadDesdeIncidencia } from './asignacion.util';
import { resolverContexto } from '../../common/plant-context';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { PreventiveService } from '../preventive/preventive.service';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import { QueryWorkOrderDto } from './dto/query-work-order.dto';
import { CloseWorkOrderDto } from './dto/close-work-order.dto';
import { OpenWorkOrderDto } from './dto/open-work-order.dto';
import { ProgressWorkOrderDto } from './dto/progress-work-order.dto';
import { computeEffectiveStatuses } from '../../common/asset-status';
// PDF: se carga con require para no depender de @types en el build.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument = require('pdfkit');

const inc = {
  asset: { select: { id: true, assetCode: true, type: true, status: true } },
  location: { select: { id: true, code: true, name: true } },
  technician: { select: { id: true, fullName: true } },
  incident: { select: { id: true, code: true, title: true } },
  openedBy: { select: { id: true, fullName: true } },
  closedBy: { select: { id: true, fullName: true } },
  companion: { select: { id: true, fullName: true } },
};

/** Roles que pueden ejecutar una orden de MAPEO (levantamiento en campo). */
const PUEDE_MAPEAR = ['Jefe de Mantenimiento', 'Supervisor TI', 'Técnico de Red'];

@Injectable()
export class MaintenanceService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private storage: StorageService,
    private preventive: PreventiveService,
  ) {}

  /**
   * Correlativo POR AÑO.
   *
   * DEFECTO CORREGIDO: antes contaba TODAS las órdenes de la historia y le
   * sumaba uno, pero ponía el año actual en el código. Resultado: al empezar
   * 2027 la numeración habría seguido en OM-2027-0051 en vez de OM-2027-0001,
   * y si alguna orden se cancelaba, el conteo podía repetir un código ya usado
   * —que revienta contra la restricción de unicidad—.
   *
   * Ahora se toma el MAYOR correlativo del año en curso, no la cantidad.
   */
  private async nextCode(): Promise<string> {
    const year = new Date().getFullYear();
    const ultima = await this.prisma.workOrder.findFirst({
      where: { code: { startsWith: `OM-${year}-` } },
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const ultimo = ultima ? Number(ultima.code.split('-').pop()) || 0 : 0;
    return `OM-${year}-${String(ultimo + 1).padStart(4, '0')}`;
  }

  async create(dto: CreateWorkOrderDto) {
    // Una orden tiene que decir SOBRE QUÉ es: un equipo concreto o una zona.
    // Sin ninguno de los dos, el técnico no sabe a dónde ir.
    if (!dto.assetId && !dto.locationId) {
      throw new BadRequestException(
        'Indica el activo o la ubicación sobre la que se hará el trabajo.',
      );
    }

    return this.prisma.workOrder.create({
      data: {
        code: dto.code || (await this.nextCode()),
        type: dto.type,
        assetId: dto.assetId || undefined,
        locationId: dto.locationId || undefined,
        activity: dto.activity,
        responsible: dto.responsible,
        materials: dto.materials,
        zone: dto.zone,
        incidentId: dto.incidentId || undefined,
        scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : undefined,
        technicianId: dto.technicianId,
        // Recepción del pedido de Producción
        requestedBy: dto.requestedBy,
        requestChannel: dto.requestChannel,
        receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : undefined,
        externalRef: dto.externalRef,
        // Parada estimada (tentativa; la real la confirma el técnico por radio)
        plannedStopAt: dto.plannedStopAt ? new Date(dto.plannedStopAt) : undefined,
        plannedDurationMin: dto.plannedDurationMin,
      },
      include: inc,
    });
  }

  /**
   * APERTURA en campo — firmada.
   *
   * Marca el inicio real del trabajo. A partir de aquí, en una orden de MAPEO
   * todo activo que se registre queda ligado a esta orden y a quien firmó.
   */
  async openSigned(id: string, dto: OpenWorkOrderDto, ip?: string | null) {
    const wo = await this.prisma.workOrder.findUnique({ where: { id } });
    if (!wo) throw new NotFoundException('Orden de mantenimiento no encontrada');
    if (wo.status === 'CERRADA' || wo.status === 'CANCELADA') {
      throw new BadRequestException('Esta orden ya está cerrada.');
    }
    if (wo.startedAt) {
      throw new BadRequestException(
        `La orden ya fue abierta el ${wo.startedAt.toLocaleString('es-PE')}.`,
      );
    }

    const signer = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { role: { select: { name: true } } },
    });
    const valid = signer && signer.active
      ? await argon2.verify(signer.passwordHash, dto.password).catch(() => false)
      : false;
    if (!valid) {
      await this.audit.record({
        userId: signer?.id || null,
        action: 'FIRMA_FALLIDA',
        entity: 'work_orders',
        entityId: id,
        ip,
        after: { intento: dto.email, motivo: 'contraseña incorrecta', accion: 'abrir OM' },
      });
      throw new BadRequestException('Firma inválida: contraseña incorrecta');
    }

    // El levantamiento de activos exige criterio técnico de red: los datos que
    // se capturan (puerto PoE, canal del grabador, enlace) no los conoce un
    // técnico eléctrico. Él acompaña y queda declarado, pero no firma.
    if (wo.type === 'MAPEO' && !PUEDE_MAPEAR.includes(signer!.role?.name || '')) {
      throw new BadRequestException(
        'Solo el Técnico de Red, el Supervisor TI o el Jefe de Mantenimiento pueden abrir una orden de mapeo.',
      );
    }

    // El acompañante no puede ser el mismo que firma: si van dos a campo,
    // son dos personas distintas.
    if (dto.companionId && dto.companionId === signer!.id) {
      throw new BadRequestException('El acompañante debe ser una persona distinta.');
    }

    const updated = await this.prisma.workOrder.update({
      where: { id },
      data: {
        status: 'EN_PROCESO',
        startedAt: dto.startedAt ? new Date(dto.startedAt) : new Date(),
        openedById: signer!.id,
        companionId: dto.companionId || undefined,
        // Si nadie la tenía asignada, queda a nombre de quien la abre.
        technicianId: wo.technicianId || signer!.id,
      },
      include: inc,
    });

    await this.audit.record({
      userId: signer!.id,
      action: 'OPEN_WO',
      entity: 'work_orders',
      entityId: id,
      ip,
      after: {
        om: wo.code,
        tipo: wo.type,
        firmadoPor: signer!.email,
        inicioReal: updated.startedAt,
        acompanante: dto.companionId || null,
      },
    });
    return updated;
  }

  async findAll(q: QueryWorkOrderDto) {
    const page = q.page && q.page > 0 ? q.page : 1;
    const pageSize = q.pageSize && q.pageSize > 0 && q.pageSize <= 200 ? q.pageSize : 50;
    const where: any = { status: q.status, type: q.type, assetId: q.assetId };

    // Ámbito de planta. Una OM puede colgar de un ACTIVO o solo de una
    // UBICACIÓN (una campaña de barrido, por ejemplo), así que se aceptan las
    // dos vías. Si no, las campañas desaparecerían al filtrar por tren.
    const ambito = await filtroDeUbicaciones(this.prisma, { tren: q.tren, etapa: q.etapa });
    if (ambito) {
      where.AND = [
        ...(where.AND || []),
        { OR: [{ asset: { locationId: ambito } }, { locationId: ambito }] },
      ];
    }
    // Búsqueda documental: código de OM, código de incidencia, actividad o zona.
    if (q.q && q.q.trim()) {
      const term = q.q.trim();
      where.OR = [
        { code: { contains: term, mode: 'insensitive' } },
        { activity: { contains: term, mode: 'insensitive' } },
        { zone: { contains: term, mode: 'insensitive' } },
        { incident: { code: { contains: term, mode: 'insensitive' } } },
      ];
    }
    // Rango de fechas sobre la fecha programada (para volver a registros por periodo).
    if (q.from || q.to) {
      where.scheduledDate = {};
      if (q.from) where.scheduledDate.gte = new Date(q.from);
      if (q.to) where.scheduledDate.lte = new Date(q.to);
    }
    const [total, data] = await this.prisma.$transaction([
      this.prisma.workOrder.count({ where }),
      this.prisma.workOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: inc,
      }),
    ]);
    // Adjunta el estado operativo derivado del activo (coherencia con la OM/incidencia).
    const assetsForStatus = data
      .map((w: any) => w.asset)
      .filter((a: any) => a && a.id);
    const eff = await computeEffectiveStatuses(this.prisma, assetsForStatus);
    for (const w of data as any[]) {
      if (w.asset && w.asset.id) w.asset.effectiveStatus = eff[w.asset.id] || w.asset.status;
    }
    return { page, pageSize, total, data };
  }

  async findOne(id: string) {
    const wo: any = await this.prisma.workOrder.findUnique({
      where: { id },
      include: {
        ...inc,
        evidences: true,
        progress: {
          orderBy: { reportedAt: 'asc' },
          include: { reportedBy: { select: { id: true, fullName: true } } },
        },
      },
    });
    if (!wo) throw new NotFoundException('Orden de mantenimiento no encontrada');
    // Desviación de lo que estimó Producción, calculada al vuelo.
    wo.desviacion = MaintenanceService.calcularDesviacion(wo);
    return wo;
  }

  async update(id: string, dto: UpdateWorkOrderDto) {
    const cur = await this.prisma.workOrder.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('Orden de mantenimiento no encontrada');
    const data: any = { ...dto };
    if (dto.scheduledDate) data.scheduledDate = new Date(dto.scheduledDate);
    if (dto.status === 'CERRADA' && !cur.executedDate) data.executedDate = new Date();
    return this.prisma.workOrder.update({ where: { id }, data, include: inc });
  }

  // Cierre firmado: re-verifica credenciales del que cierra y audita la firma.
  async closeSigned(id: string, dto: CloseWorkOrderDto, ip?: string | null) {
    const wo = await this.prisma.workOrder.findUnique({ where: { id } });
    if (!wo) throw new NotFoundException('Orden de mantenimiento no encontrada');
    const signer = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const valid = signer && signer.active
      ? await argon2.verify(signer.passwordHash, dto.password).catch(() => false)
      : false;
    if (!valid) {
      await this.audit.record({
        userId: signer?.id || null,
        action: 'FIRMA_FALLIDA',
        entity: 'work_orders',
        entityId: id,
        ip,
        after: { intento: dto.email, motivo: 'contraseña incorrecta', accion: 'cerrar OM' },
      });
      throw new BadRequestException('Firma inválida: contraseña incorrecta');
    }

    const ahora = new Date();
    const fin = dto.endedAt ? new Date(dto.endedAt) : ahora;

    // El cierre no puede ser anterior al inicio: sería un dato imposible que
    // luego ensucia cualquier cálculo de duración.
    if (wo.startedAt && fin < wo.startedAt) {
      throw new BadRequestException(
        'La hora de cierre no puede ser anterior a la de inicio del trabajo.',
      );
    }

    const updated = await this.prisma.workOrder.update({
      where: { id },
      data: {
        status: 'CERRADA',
        executedDate: wo.executedDate || ahora,
        diagnosis: dto.diagnosis ?? wo.diagnosis,
        technicianId: wo.technicianId || signer!.id,
        // Cierre en campo (Bloque 1)
        endedAt: fin,
        closedById: signer!.id,
        rootCause: dto.rootCause ?? undefined,
        // Se escriben LAS DOS cuando el código elegido existe también en el
        // enum: así los informes viejos siguen funcionando y los nuevos leen
        // una sola columna. Una causa creada por el usuario solo cabe aquí.
        rootCauseCode: dto.rootCauseCode ?? dto.rootCause ?? undefined,
        symptomCode: dto.symptomCode ?? undefined,
        actionCode: dto.actionCode ?? undefined,
        rootCauseNote: dto.rootCauseNote ?? undefined,
        isRecurrent: dto.isRecurrent ?? undefined,
        // Si el técnico cerró sin haber abierto formalmente, se deja constancia
        // del inicio para que la duración no quede en blanco.
        startedAt: wo.startedAt || wo.executedDate || ahora,
      },
      include: inc,
    });

    // Duración real del trabajo, en minutos. Sirve para comparar contra la
    // parada que estimó Producción y saber si estiman bien.
    const minutos = updated.startedAt && updated.endedAt
      ? Math.round((updated.endedAt.getTime() - updated.startedAt.getTime()) / 60000)
      : null;

    await this.audit.record({
      userId: signer!.id,
      action: 'CLOSE_WO',
      entity: 'work_orders',
      entityId: id,
      ip,
      after: {
        firmadoPor: signer!.email,
        om: wo.code,
        causa: dto.rootCauseCode || dto.rootCause || null,
        sintoma: dto.symptomCode || null,
        accion: dto.actionCode || null,
        reincidente: dto.isRecurrent ?? false,
        duracionMinutos: minutos,
      },
    });
    // Si es una OM PREVENTIVA, reprograma el plan del activo (próximo = ahora + intervalo).
    if (wo.type === 'PREVENTIVO' && wo.assetId) {
      await this.preventive
        .markServiced(wo.assetId, updated.executedDate || new Date())
        .catch(() => null);
    }
    return updated;
  }

  /**
   * REPORTE DE AVANCE.
   *
   * No cierra la orden: la deja EN PROCESO con el porcentaje declarado. Se
   * guarda cada reporte en el historial para que el Jefe de Mantenimiento vea
   * la secuencia completa —"30% porque la parada se acortó", "60% porque faltó
   * manlift"— que es lo que explica por qué un trabajo tomó tres paradas.
   *
   * No exige firma: es un parte de avance, no una decisión con consecuencias.
   * Queda a nombre del usuario de la sesión y auditado.
   */
  async addProgress(
    id: string,
    dto: ProgressWorkOrderDto,
    userId?: string | null,
    ip?: string | null,
  ) {
    const wo = await this.prisma.workOrder.findUnique({ where: { id } });
    if (!wo) throw new NotFoundException('Orden de mantenimiento no encontrada');
    if (wo.status === 'CERRADA' || wo.status === 'CANCELADA') {
      throw new BadRequestException('No se puede reportar avance sobre una orden cerrada.');
    }

    const pct = Math.max(0, Math.min(100, Number(dto.pct)));
    // El avance no retrocede sin explicación: si alguien baja el porcentaje,
    // tiene que decir por qué (se encontró más trabajo del previsto, por ejemplo).
    // El avance no retrocede sin explicación. Vale con elegir un motivo de la
    // lista: no hay que escribir. Antes se exigía texto, y eso hacía que se
    // pusiera un punto para poder seguir.
    if (pct < wo.progressPct && !dto.reasonCode && !dto.note?.trim()) {
      throw new BadRequestException(
        `El avance baja de ${wo.progressPct}% a ${pct}%. Elige el motivo o explícalo.`,
      );
    }

    const [, updated] = await this.prisma.$transaction([
      this.prisma.workOrderProgress.create({
        data: {
          workOrderId: id,
          pct,
          reasonCode: dto.reasonCode || null,
          note: dto.note?.trim() || null,
          reportedById: userId || null,
        },
      }),
      this.prisma.workOrder.update({
        where: { id },
        data: {
          progressPct: pct,
          // Reportar avance implica que el trabajo está en marcha.
          status: wo.status === 'ABIERTA' ? 'EN_PROCESO' : wo.status,
        },
        include: inc,
      }),
    ]);

    await this.audit.record({
      userId: userId || null,
      action: 'PROGRESS_WO',
      entity: 'work_orders',
      entityId: id,
      ip,
      before: { avance: wo.progressPct },
      after: { om: wo.code, avance: pct, motivo: dto.note || null },
    });
    return updated;
  }

  /** Historial de avance de una orden, del más antiguo al más reciente. */
  async listProgress(id: string) {
    return this.prisma.workOrderProgress.findMany({
      where: { workOrderId: id },
      orderBy: { reportedAt: 'asc' },
      include: { reportedBy: { select: { id: true, fullName: true } } },
    });
  }

  /**
   * DESVIACIÓN de lo planificado por Producción.
   *
   * Compara lo que Producción estimó contra lo que realmente ocurrió.
   * Devuelve null cuando falta el dato en vez de inventar un cero: una
   * desviación de 0 y "no se sabe" no son lo mismo.
   */
  static calcularDesviacion(wo: any) {
    const inicioReal: Date | null = wo.startedAt || null;
    const finReal: Date | null = wo.endedAt || null;

    const duracionRealMin = inicioReal && finReal
      ? Math.round((new Date(finReal).getTime() - new Date(inicioReal).getTime()) / 60000)
      : null;

    // Retraso en arrancar: cuánto después de la hora estimada de parada
    // empezó realmente el trabajo. Positivo = arrancó tarde.
    const retrasoInicioMin = wo.plannedStopAt && inicioReal
      ? Math.round(
          (new Date(inicioReal).getTime() - new Date(wo.plannedStopAt).getTime()) / 60000,
        )
      : null;

    // Exceso sobre la duración estimada. Positivo = tomó más de lo previsto.
    const desviacionMin = wo.plannedDurationMin && duracionRealMin !== null
      ? duracionRealMin - wo.plannedDurationMin
      : null;

    const desviacionPct = wo.plannedDurationMin && duracionRealMin !== null
      ? Math.round(((duracionRealMin - wo.plannedDurationMin) / wo.plannedDurationMin) * 100)
      : null;

    return {
      duracionEstimadaMin: wo.plannedDurationMin ?? null,
      duracionRealMin,
      retrasoInicioMin,
      desviacionMin,
      desviacionPct,
    };
  }

  // ---------- Evidencias fotográficas ----------
  async addEvidence(id: string, file: any, caption?: string) {
    const wo = await this.prisma.workOrder.findUnique({ where: { id } });
    if (!wo) throw new NotFoundException('Orden de mantenimiento no encontrada');
    if (!file || !file.buffer) throw new BadRequestException('Archivo de imagen requerido');
    const ext = (file.originalname?.split('.').pop() || 'jpg').toLowerCase();
    const objectName = `wo/${id}/${Date.now()}-${randomUUID()}.${ext}`;
    await this.storage.put(objectName, file.buffer, file.mimetype || 'image/jpeg');
    return this.prisma.workOrderEvidence.create({
      data: { workOrderId: id, fileId: objectName, caption: caption || null },
    });
  }

  async listEvidence(id: string) {
    return this.prisma.workOrderEvidence.findMany({
      where: { workOrderId: id },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getEvidenceFile(evidenceId: string): Promise<{ buffer: Buffer; contentType: string }> {
    const ev = await this.prisma.workOrderEvidence.findUnique({ where: { id: evidenceId } });
    if (!ev) throw new NotFoundException('Evidencia no encontrada');
    const buffer = await this.storage.getBuffer(ev.fileId);
    const ext = ev.fileId.split('.').pop()?.toLowerCase();
    const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
    return { buffer, contentType };
  }

  // ---------- Informe PDF de la OM (bajo demanda) ----------
  async buildReport(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const wo = await this.prisma.workOrder.findUnique({
      where: { id },
      include: {
        asset: true,
        technician: true,
        incident: true,
        evidences: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!wo) throw new NotFoundException('Orden de mantenimiento no encontrada');

    // Descarga las imágenes; si alguna falla, se omite sin romper el informe.
    const images: { buffer: Buffer; caption?: string | null }[] = [];
    for (const ev of wo.evidences) {
      try {
        images.push({ buffer: await this.storage.getBuffer(ev.fileId), caption: ev.caption });
      } catch {
        /* imagen no disponible: se omite */
      }
    }

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    const NAVY = '#1b2a4a';
    const RED = '#c0392b';
    const GREY = '#555555';
    const fmt = (d?: Date | null) => (d ? new Date(d).toLocaleString('es-PE') : '—');
    const pageW = doc.page.width;

    // Encabezado
    doc.rect(0, 0, pageW, 92).fill(NAVY);
    doc.fillColor('#ffffff').fontSize(17).text('ACEROS AREQUIPA — Planta Pisco', 50, 26);
    doc.fillColor('#cfd8e3').fontSize(10).text('SGIT-CCTV · Informe de Orden de Mantenimiento', 50, 50);
    doc.fillColor('#ffffff').fontSize(20).text(wo.code, 0, 34, { align: 'right', width: pageW - 50 });
    doc.fillColor('#000000');

    let y = 116;
    const heading = (t: string) => {
      doc.fontSize(13).fillColor(NAVY).text(t, 50, y);
      y = doc.y + 6;
      doc.moveTo(50, y).lineTo(pageW - 50, y).strokeColor('#dddddd').stroke();
      y += 8;
    };
    const line = (label: string, value: string) => {
      doc.fontSize(10).fillColor(GREY).text(label, 50, y);
      doc.fontSize(11).fillColor('#000000').text(value || '—', 190, y, { width: pageW - 240 });
      y = doc.y + 6;
    };

    heading('Datos de la orden');
    line('Tipo', wo.type);
    line('Estado', wo.status);
    line('Activo', wo.asset ? `${wo.asset.assetCode} (${wo.asset.type})` : '—');
    line('Zona de intervención', wo.zone || '—');
    line('Incidencia relacionada', wo.incident ? `${wo.incident.code} — ${wo.incident.title}` : '—');
    line('Técnico asignado', wo.technician ? wo.technician.fullName : '—');
    line('Responsable', wo.responsible || '—');
    line('Fecha programada', fmt(wo.scheduledDate));
    line('Fecha de ejecución', fmt(wo.executedDate));

    y += 6;
    heading('Actividad realizada');
    doc.fontSize(11).fillColor('#000000').text(wo.activity || '—', 50, y, { width: pageW - 100 });
    y = doc.y + 10;
    doc.fontSize(10).fillColor(GREY).text('Diagnóstico / detalle de la intervención:', 50, y);
    y = doc.y + 4;
    doc.fontSize(11).fillColor('#000000').text(wo.diagnosis || '—', 50, y, { width: pageW - 100 });
    y = doc.y + 12;

    // Materiales utilizados / a utilizar
    heading('Materiales');
    const mats = (wo.materials || '').split('\n').map((m: string) => m.trim()).filter(Boolean);
    if (mats.length) {
      for (const m of mats) {
        doc.fontSize(11).fillColor('#000000').text('•  ' + m, 60, y, { width: pageW - 110 });
        y = doc.y + 3;
      }
    } else {
      doc.fontSize(11).fillColor(GREY).text('Sin materiales registrados', 60, y);
      y = doc.y + 3;
    }

    // Condición del equipo (checklist llenado por el técnico)
    y += 6;
    heading('Condición del equipo (revisión del técnico)');
    const cond: any = (wo as any).condition;
    if (cond && typeof cond === 'object' && Object.keys(cond).length) {
      for (const [k, v] of Object.entries(cond)) {
        const color = v === 'Cambiar' ? RED : v === 'Observado' ? '#b45309' : '#000000';
        doc.fontSize(11).fillColor(GREY).text('•  ' + k + ': ', 60, y, { continued: true });
        doc.fillColor(color).text(String(v));
        y = doc.y + 3;
      }
    } else {
      doc.fontSize(11).fillColor(GREY).text('Sin checklist de condición registrado', 60, y);
      y = doc.y + 3;
    }

    // Evidencias fotográficas (páginas siguientes)
    if (images.length) {
      doc.addPage();
      doc.fontSize(13).fillColor(NAVY).text('Evidencias fotográficas', 50, 50);
      let iy = 82;
      const maxW = pageW - 100;
      for (const img of images) {
        if (iy > doc.page.height - 240) { doc.addPage(); iy = 50; }
        try {
          doc.image(img.buffer, 50, iy, { fit: [maxW, 230], align: 'center' });
          iy += 238;
        } catch {
          doc.fontSize(9).fillColor(RED).text('(imagen no renderizable)', 50, iy);
          iy += 20;
        }
        if (img.caption) {
          doc.fontSize(9).fillColor(GREY).text(img.caption, 50, iy, { width: maxW });
          iy = doc.y + 12;
        }
      }
    }

    // Pie
    doc.fontSize(8).fillColor(GREY).text(
      `Documento generado por SGIT-CCTV el ${new Date().toLocaleString('es-PE')}. Registro documental — Mantenimiento, Aceros Arequipa.`,
      50, doc.page.height - 38, { width: pageW - 100, align: 'center' },
    );

    doc.end();
    const buffer = await done;
    return { buffer, filename: `informe-${wo.code}.pdf` };
  }

  // ==========================================================================
  //  ASIGNAR Y DETALLAR  (bloque 4A)
  // ==========================================================================

  /**
   * ASIGNACIÓN — lo que hace el ingeniero. Cuatro cosas.
   *
   * No se le piden materiales, ni herramientas, ni duración: no los sabe, y
   * pedírselos le hace inventarlos. El técnico de red los pone al detallar.
   *
   * SI NO PONE FECHA, se calcula por la criticidad del equipo. Sin plazo, el
   * indicador de vencidas deja de funcionar y las órdenes se quedan ahí para
   * siempre sin que nadie las eche de menos.
   */
  async asignar(dto: any, userId?: string | null, ip?: string | null) {
    const actividad = (dto?.activity || '').trim();
    if (!actividad) throw new BadRequestException('Escribe qué hay que hacer.');
    if (!dto?.assetId && !dto?.locationId) {
      throw new BadRequestException('Indica el equipo, o al menos la zona.');
    }

    // Criticidad EFECTIVA del equipo: la que impone la etapa del proceso, no
    // la que alguien marcó a mano.
    let criticidad: string | null = null;
    if (dto.assetId) {
      const activo = await this.prisma.asset.findUnique({
        where: { id: dto.assetId },
        select: { id: true, locationId: true, criticality: true },
      });
      if (activo) {
        const ctx = await resolverContexto(this.prisma, activo as any);
        criticidad = ctx?.criticidad || activo.criticality;
      }
    }

    const programada = dto.scheduledDate
      ? new Date(dto.scheduledDate)
      : fechaLimite(criticidad, new Date());

    // AVISO DE DUPLICADO: no se impide, porque a veces hacen falta dos
    // trabajos distintos sobre el mismo equipo. Pero abrir la segunda sin
    // saber que existe la primera es como se duplica el trabajo en campo.
    let avisoDuplicado: string | null = null;
    if (dto.assetId) {
      const abierta = await this.prisma.workOrder.findFirst({
        where: {
          assetId: dto.assetId,
          status: { in: ['ABIERTA', 'EN_PROCESO', 'EN_ESPERA'] as any },
        },
        select: { code: true, activity: true },
      });
      if (abierta) {
        avisoDuplicado = `Este equipo ya tiene la orden ${abierta.code} abierta`
          + (abierta.activity ? `: "${abierta.activity}"` : '') + '.';
      }
    }

    const wo = await this.prisma.workOrder.create({
      data: {
        code: await this.nextCode(),
        type: dto.type || 'CORRECTIVO',
        activity: actividad,
        assetId: dto.assetId || null,
        // Se guarda aparte para poder comparar después qué se pidió y qué se hizo.
        assignedAssetId: dto.assetId || null,
        locationId: dto.locationId || null,
        incidentId: dto.incidentId || null,
        technicianId: dto.technicianId || null,
        scheduledDate: programada,
        assignedById: userId || null,
        // Nace SIN detallar: eso es lo que la distingue del trabajo listo.
        detailedAt: null,
      },
      include: inc,
    });

    await this.audit.record({
      userId: userId || null,
      action: 'WO_ASIGNAR',
      entity: 'work_orders',
      entityId: wo.id,
      ip,
      after: {
        om: wo.code, actividad, activo: dto.assetId || null,
        para: programada.toISOString(), plazoAutomatico: !dto.scheduledDate,
      },
    });

    return { ...wo, avisoDuplicado };
  }

  /**
   * DETALLADO — lo que hace el técnico de red, que es quien tiene el contexto.
   *
   * Puede cambiar el equipo: si llega y ve que el problema es el switch,
   * arreglar la cámara no sirve de nada. No se le impide, pero queda MARCADO
   * y se le pide el motivo, para que el ingeniero vea qué se pidió frente a
   * qué se hizo.
   */
  async detallar(id: string, dto: any, userId?: string | null, ip?: string | null) {
    const wo = await this.prisma.workOrder.findUnique({ where: { id } });
    if (!wo) throw new NotFoundException('Orden de mantenimiento no encontrada');
    if (wo.status === 'CERRADA' || wo.status === 'CANCELADA') {
      throw new BadRequestException('Esta orden ya está cerrada.');
    }

    const assetId = dto.assetId !== undefined ? (dto.assetId || null) : wo.assetId;
    const cambiaAlcance = !!wo.assignedAssetId && !!assetId && wo.assignedAssetId !== assetId;

    if (cambiaAlcance && !dto.scopeNote?.trim()) {
      throw new BadRequestException(
        'Estás cambiando el equipo respecto a lo asignado. Explica por qué: el '
        + 'ingeniero tiene que poder ver qué se pidió y qué se hizo.',
      );
    }

    const estado = estadoDetalle({
      assetId,
      locationId: dto.locationId !== undefined ? dto.locationId : wo.locationId,
      activity: dto.activity !== undefined ? dto.activity : wo.activity,
      assignedAssetId: wo.assignedAssetId,
      detailedAt: new Date(),
    });
    if (estado.faltan.length) {
      throw new BadRequestException(`Falta ${estado.faltan.join(' y ')}.`);
    }

    const actualizada = await this.prisma.workOrder.update({
      where: { id },
      data: {
        assetId,
        locationId: dto.locationId !== undefined ? (dto.locationId || null) : undefined,
        activity: dto.activity?.trim() || undefined,
        plannedDurationMin: dto.plannedDurationMin !== undefined
          ? Number(dto.plannedDurationMin) || null : undefined,
        plannedStopAt: dto.plannedStopAt ? new Date(dto.plannedStopAt) : undefined,
        technicianId: dto.technicianId !== undefined ? (dto.technicianId || null) : undefined,
        detailedAt: new Date(),
        detailedById: userId || null,
        scopeChanged: cambiaAlcance || wo.scopeChanged,
        scopeNote: cambiaAlcance ? dto.scopeNote.trim() : undefined,
      },
      include: inc,
    });

    await this.audit.record({
      userId: userId || null,
      action: cambiaAlcance ? 'WO_DETALLAR_CAMBIO_ALCANCE' : 'WO_DETALLAR',
      entity: 'work_orders',
      entityId: id,
      ip,
      before: { activoAsignado: wo.assignedAssetId },
      after: {
        om: wo.code, activoFinal: assetId,
        motivo: cambiaAlcance ? dto.scopeNote.trim() : null,
      },
    });

    return actualizada;
  }

  /**
   * Duración típica de este tipo de trabajo sobre este equipo, sacada de lo ya
   * ejecutado. Es la información que el técnico necesita para estimar sin
   * adivinar, y el dato ya estaba guardado sin que nadie lo mirara.
   */
  async duracionTipica(assetId: string | null, tipo: string) {
    if (!assetId) return null;
    const cerradas = await this.prisma.workOrder.findMany({
      where: {
        assetId, type: tipo as any, status: 'CERRADA',
        startedAt: { not: null }, endedAt: { not: null },
      },
      select: { startedAt: true, endedAt: true },
      orderBy: { endedAt: 'desc' },
      take: 5,
    });
    if (!cerradas.length) return null;

    const minutos = cerradas.map(
      (o) => Math.round((new Date(o.endedAt!).getTime() - new Date(o.startedAt!).getTime()) / 60000),
    );
    const media = Math.round(minutos.reduce((a, b) => a + b, 0) / minutos.length);
    return { muestras: minutos.length, mediaMin: media, minutos };
  }

  /**
   * Convierte una incidencia en orden asignada, con todo lo que la incidencia
   * ya sabe. El ingeniero deja de reescribir a mano el equipo, la zona y la
   * descripción que están escritos justo al lado.
   */
  async desdeIncidencia(incidentId: string, dto: any, userId?: string | null, ip?: string | null) {
    // OJO con el nombre: en este archivo `inc` ya es el objeto de inclusión de
    // Prisma que usan todas las consultas. Llamar `inc` a la incidencia lo
    // taparía dentro de esta función, y el día que alguien añada aquí un
    // include se encontraría con un error incomprensible.
    const incidencia = await this.prisma.incident.findUnique({
      where: { id: incidentId },
      select: { id: true, code: true, title: true, description: true, assetId: true, priority: true },
    });
    if (!incidencia) throw new NotFoundException('Incidencia no encontrada');

    return this.asignar({
      type: dto?.type || 'CORRECTIVO',
      activity: dto?.activity?.trim() || actividadDesdeIncidencia(incidencia),
      assetId: dto?.assetId ?? incidencia.assetId,
      technicianId: dto?.technicianId,
      scheduledDate: dto?.scheduledDate,
      incidentId: incidencia.id,
    }, userId, ip);
  }

}
