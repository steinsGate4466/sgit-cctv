import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { filtroDeUbicaciones } from '../../common/ambito-planta';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';
import { QueryIncidentDto } from './dto/query-incident.dto';
import { ResolveIncidentDto } from './dto/resolve-incident.dto';
import { computeEffectiveStatuses } from '../../common/asset-status';
// PDF: require para no depender de @types en el build.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument = require('pdfkit');

const assetSel = { asset: { select: { id: true, assetCode: true, type: true, status: true } } };

@Injectable()
export class IncidentsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private storage: StorageService,
  ) {}

  private async nextCode(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.incident.count();
    return `INC-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  async create(dto: CreateIncidentDto) {
    return this.prisma.incident.create({
      data: {
        code: await this.nextCode(),
        title: dto.title,
        description: dto.description,
        category: dto.category,
        priority: dto.priority,
        assetId: dto.assetId,
        zone: (dto as any).zone,
        concurrentSessions: dto.concurrentSessions,
        affectedCameras: dto.affectedCameras,
        visionDownMin: dto.visionDownMin,
      },
      include: assetSel,
    });
  }

  async findAll(q: QueryIncidentDto) {
    const page = q.page && q.page > 0 ? q.page : 1;
    const pageSize = q.pageSize && q.pageSize > 0 && q.pageSize <= 200 ? q.pageSize : 50;
    // Tipado con el WhereInput que genera Prisma: si se escribe mal el
    // nombre de un campo o se anida un filtro dentro de otro, lo dice al
    // compilar en lugar de devolver un 400 en producción.
    const where: Prisma.IncidentWhereInput = { status: q.status, category: q.category, priority: q.priority, assetId: q.assetId };

    // Ámbito de planta: la incidencia hereda el tren de su activo.
    const ambito = await filtroDeUbicaciones(this.prisma, { tren: q.tren, etapa: q.etapa });
    if (ambito) where.asset = { locationId: ambito };
    if (q.q && q.q.trim()) {
      const t = q.q.trim();
      where.OR = [
        { code: { contains: t, mode: 'insensitive' } },
        { title: { contains: t, mode: 'insensitive' } },
        { zone: { contains: t, mode: 'insensitive' } },
      ];
    }
    // El rango se arma ENTERO y se asigna una vez.
    //
    // Antes era `where.reportedAt = {}` y luego `.gte = ...`. Con el tipo real
    // de Prisma eso NO COMPILA: `reportedAt` puede ser una fecha o un filtro,
    // y a una unión no se le puede tocar una propiedad sin decidir cuál es.
    // Escribirlo así no es un rodeo para contentar al compilador: describe
    // mejor lo que pasa, que es "este es el filtro de fechas", no "creo un
    // objeto vacío y lo voy rellenando".
    if (q.from || q.to) {
      where.reportedAt = {
        ...(q.from ? { gte: new Date(q.from) } : {}),
        ...(q.to ? { lte: new Date(q.to) } : {}),
      };
    }
    const [total, data] = await this.prisma.$transaction([
      this.prisma.incident.count({ where }),
      this.prisma.incident.findMany({
        where,
        orderBy: { reportedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: assetSel,
      }),
    ]);
    // Estado operativo derivado del activo afectado (coherencia con la incidencia).
    const assetsForStatus = data.map((i: any) => i.asset).filter((a: any) => a && a.id);
    const eff = await computeEffectiveStatuses(this.prisma, assetsForStatus);
    for (const i of data as any[]) {
      if (i.asset && i.asset.id) i.asset.effectiveStatus = eff[i.asset.id] || i.asset.status;
    }
    return { page, pageSize, total, data };
  }

  async findOne(id: string) {
    const inc = await this.prisma.incident.findUnique({
      where: { id },
      include: {
        asset: true,
        responsible: { select: { id: true, fullName: true } },
        evidences: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!inc) throw new NotFoundException('Incidencia no encontrada');
    return inc;
  }

  async update(id: string, dto: UpdateIncidentDto) {
    const current = await this.prisma.incident.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Incidencia no encontrada');
    // El cierre/resolución NO se hace por esta vía: exige firma del Jefe (endpoint /resolve).
    // Aquí solo se permiten estados no terminales (Abierta, En diagnóstico, En proceso, En espera).
    if (dto.status === 'RESUELTA' || dto.status === 'CERRADA') {
      throw new ForbiddenException('El cierre de la incidencia lo firma el Jefe de Mantenimiento (usa “Resolver”).');
    }
    const data: any = { ...dto };
    return this.prisma.incident.update({ where: { id }, data, include: assetSel });
  }

  /**
   * Resuelve con FIRMA + retroalimentación de análisis (solución, causa, materiales,
   * técnicos, responsable, observaciones, jefe de línea, impacto).
   */
  async resolveSigned(id: string, dto: ResolveIncidentDto, ip?: string | null) {
    const inc = await this.prisma.incident.findUnique({ where: { id } });
    if (!inc) throw new NotFoundException('Incidencia no encontrada');

    const signer = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const valid = signer && signer.active
      ? await argon2.verify(signer.passwordHash, dto.password).catch(() => false)
      : false;
    if (!valid) {
      await this.audit.record({
        userId: signer?.id || null, action: 'FIRMA_FALLIDA', entity: 'incidents', entityId: id, ip,
        after: { intento: dto.email, motivo: 'contraseña incorrecta', accion: 'resolver incidencia' },
      });
      throw new BadRequestException('Firma inválida: contraseña incorrecta');
    }

    const resolvedAt = new Date();
    const updated = await this.prisma.incident.update({
      where: { id },
      data: {
        status: 'RESUELTA',
        solution: dto.solution ?? inc.solution,
        rootCause: dto.rootCause ?? inc.rootCause,
        materials: dto.materials ?? inc.materials,
        interveners: dto.interveners ?? inc.interveners,
        responsibleName: dto.responsibleName ?? inc.responsibleName,
        observations: dto.observations ?? inc.observations,
        lineManagerNotified: dto.lineManagerNotified ?? inc.lineManagerNotified,
        affectedCameras: dto.affectedCameras ?? inc.affectedCameras,
        visionDownMin: dto.visionDownMin ?? inc.visionDownMin,
        resolvedAt: inc.resolvedAt || resolvedAt,
        mttrMinutes: inc.mttrMinutes ?? Math.max(0, Math.round((resolvedAt.getTime() - inc.reportedAt.getTime()) / 60000)),
        responsibleId: signer!.id,
      },
      include: assetSel,
    });

    await this.audit.record({
      userId: signer!.id, action: 'RESOLVE', entity: 'incidents', entityId: id, ip,
      after: { firmadoPor: signer!.email, incidente: inc.code },
    });
    return updated;
  }

  // ---------- Fotografías de campo ----------
  async addEvidence(id: string, file: any, caption?: string) {
    const inc = await this.prisma.incident.findUnique({ where: { id } });
    if (!inc) throw new NotFoundException('Incidencia no encontrada');
    if (!file || !file.buffer) throw new BadRequestException('Archivo de imagen requerido');
    const ext = (file.originalname?.split('.').pop() || 'jpg').toLowerCase();
    const objectName = `inc/${id}/${Date.now()}-${randomUUID()}.${ext}`;
    await this.storage.put(objectName, file.buffer, file.mimetype || 'image/jpeg');
    return this.prisma.incidentEvidence.create({
      data: { incidentId: id, fileId: objectName, caption: caption || null },
    });
  }

  async listEvidence(id: string) {
    return this.prisma.incidentEvidence.findMany({ where: { incidentId: id }, orderBy: { createdAt: 'asc' } });
  }

  async getEvidenceFile(evidenceId: string): Promise<{ buffer: Buffer; contentType: string }> {
    const ev = await this.prisma.incidentEvidence.findUnique({ where: { id: evidenceId } });
    if (!ev) throw new NotFoundException('Evidencia no encontrada');
    const buffer = await this.storage.getBuffer(ev.fileId);
    const ext = ev.fileId.split('.').pop()?.toLowerCase();
    return { buffer, contentType: ext === 'png' ? 'image/png' : 'image/jpeg' };
  }

  // ---------- Informe PDF de la incidencia ----------
  async buildReport(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const inc = await this.prisma.incident.findUnique({
      where: { id },
      include: {
        asset: true,
        responsible: { select: { fullName: true } },
        evidences: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!inc) throw new NotFoundException('Incidencia no encontrada');

    const images: { buffer: Buffer; caption?: string | null }[] = [];
    for (const ev of inc.evidences) {
      try { images.push({ buffer: await this.storage.getBuffer(ev.fileId), caption: ev.caption }); } catch { /* omitir */ }
    }

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    const NAVY = '#1b2a4a', RED = '#c0392b', GREY = '#555555';
    const pageW = doc.page.width;
    const fmt = (d?: Date | null) => (d ? new Date(d).toLocaleString('es-PE') : '—');

    doc.rect(0, 0, pageW, 92).fill(NAVY);
    doc.fillColor('#ffffff').fontSize(17).text('ACEROS AREQUIPA — Planta Pisco', 50, 26);
    doc.fillColor('#cfd8e3').fontSize(10).text('SGIT-CCTV · Informe de Incidencia', 50, 50);
    doc.fillColor('#ffffff').fontSize(20).text(inc.code, 0, 34, { align: 'right', width: pageW - 50 });
    doc.fillColor('#000000');

    let y = 116;
    const heading = (t: string) => {
      doc.fontSize(13).fillColor(NAVY).text(t, 50, y); y = doc.y + 6;
      doc.moveTo(50, y).lineTo(pageW - 50, y).strokeColor('#dddddd').stroke(); y += 8;
    };
    const line = (label: string, value: string) => {
      doc.fontSize(10).fillColor(GREY).text(label, 50, y);
      doc.fontSize(11).fillColor('#000000').text(value || '—', 200, y, { width: pageW - 250 });
      y = doc.y + 6;
    };
    const block = (label: string, value: string) => {
      doc.fontSize(10).fillColor(GREY).text(label, 50, y); y = doc.y + 3;
      doc.fontSize(11).fillColor('#000000').text(value || '—', 50, y, { width: pageW - 100 }); y = doc.y + 8;
    };

    heading('Datos de la incidencia');
    line('Título', inc.title);
    line('Categoría', inc.category);
    line('Prioridad', inc.priority);
    line('Estado', inc.status);
    line('Zona / área', inc.zone || '—');
    line('Activo', inc.asset ? `${inc.asset.assetCode} (${inc.asset.type})` : '—');
    line('Reportada', fmt(inc.reportedAt));
    line('Resuelta', fmt(inc.resolvedAt));
    line('Tiempo de resolución (MTTR)', inc.mttrMinutes != null ? `${inc.mttrMinutes} min` : '—');
    line('Cámaras afectadas', inc.affectedCameras != null ? String(inc.affectedCameras) : '—');
    line('Minutos sin visión', inc.visionDownMin != null ? String(inc.visionDownMin) : '—');
    line('Firmado / responsable', inc.responsible ? inc.responsible.fullName : (inc.responsibleName || '—'));
    line('Jefe de línea enterado', inc.lineManagerNotified ? 'Sí' : 'No');

    y += 6;
    heading('Descripción del problema');
    doc.fontSize(11).fillColor('#000000').text(inc.description || '—', 50, y, { width: pageW - 100 }); y = doc.y + 10;

    // Propuesta técnica: qué se plantea hacer, qué demanda y qué riesgo hay si no se atiende.
    if (inc.proposal || inc.proposalCost || inc.proposalRisk || inc.requiresThirdParty) {
      heading('Propuesta técnica de solución');
      block('Propuesta planteada', inc.proposal || '—');
      block('Recursos / materiales requeridos', inc.proposalCost || '—');
      block('Riesgo si no se atiende', inc.proposalRisk || '—');
      line('Requiere apoyo de terceros', inc.requiresThirdParty ? 'Sí' : 'No');
      y += 4;
    }

    heading('Análisis y solución');
    block('¿Qué se hizo para resolverlo?', inc.solution || '—');
    block('Causa raíz', inc.rootCause || '—');
    block('Materiales utilizados', inc.materials || '—');
    block('Técnicos que intervinieron', inc.interveners || '—');
    block('Responsable de la solución', inc.responsibleName || (inc.responsible?.fullName || '—'));
    block('Observaciones / recomendaciones', inc.observations || '—');

    if (images.length) {
      doc.addPage();
      doc.fontSize(13).fillColor(NAVY).text('Evidencias fotográficas', 50, 50);
      let iy = 82; const maxW = pageW - 100;
      for (const img of images) {
        if (iy > doc.page.height - 240) { doc.addPage(); iy = 50; }
        try { doc.image(img.buffer, 50, iy, { fit: [maxW, 230], align: 'center' }); iy += 238; }
        catch { doc.fontSize(9).fillColor(RED).text('(imagen no renderizable)', 50, iy); iy += 20; }
        if (img.caption) { doc.fontSize(9).fillColor(GREY).text(img.caption, 50, iy, { width: maxW }); iy = doc.y + 12; }
      }
    }

    doc.fontSize(8).fillColor(GREY).text(
      `Documento generado por SGIT-CCTV el ${new Date().toLocaleString('es-PE')}. Registro documental — Aceros Arequipa.`,
      50, doc.page.height - 38, { width: pageW - 100, align: 'center' },
    );

    doc.end();
    const buffer = await done;
    return { buffer, filename: `informe-${inc.code}.pdf` };
  }
}
