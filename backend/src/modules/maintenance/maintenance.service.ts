import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import { QueryWorkOrderDto } from './dto/query-work-order.dto';
import { CloseWorkOrderDto } from './dto/close-work-order.dto';
// PDF: se carga con require para no depender de @types en el build.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument = require('pdfkit');

const inc = {
  asset: { select: { assetCode: true, type: true } },
  technician: { select: { id: true, fullName: true } },
  incident: { select: { id: true, code: true, title: true } },
};

@Injectable()
export class MaintenanceService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private storage: StorageService,
  ) {}

  private async nextCode(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.workOrder.count();
    return `OM-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  async create(dto: CreateWorkOrderDto) {
    return this.prisma.workOrder.create({
      data: {
        code: dto.code || (await this.nextCode()),
        type: dto.type,
        assetId: dto.assetId,
        activity: dto.activity,
        responsible: dto.responsible,
        materials: dto.materials,
        zone: dto.zone,
        incidentId: dto.incidentId || undefined,
        scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : undefined,
        technicianId: dto.technicianId,
      },
      include: inc,
    });
  }

  async findAll(q: QueryWorkOrderDto) {
    const page = q.page && q.page > 0 ? q.page : 1;
    const pageSize = q.pageSize && q.pageSize > 0 && q.pageSize <= 200 ? q.pageSize : 50;
    const where: any = { status: q.status, type: q.type, assetId: q.assetId };
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
    return { page, pageSize, total, data };
  }

  async findOne(id: string) {
    const wo = await this.prisma.workOrder.findUnique({ where: { id }, include: { ...inc, evidences: true } });
    if (!wo) throw new NotFoundException('Orden de mantenimiento no encontrada');
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

    const updated = await this.prisma.workOrder.update({
      where: { id },
      data: {
        status: 'CERRADA',
        executedDate: wo.executedDate || new Date(),
        diagnosis: dto.diagnosis ?? wo.diagnosis,
        technicianId: wo.technicianId || signer!.id,
      },
      include: inc,
    });
    await this.audit.record({
      userId: signer!.id,
      action: 'CLOSE_WO',
      entity: 'work_orders',
      entityId: id,
      ip,
      after: { firmadoPor: signer!.email, om: wo.code },
    });
    return updated;
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
}
