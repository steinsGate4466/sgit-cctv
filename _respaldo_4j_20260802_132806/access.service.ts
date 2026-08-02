import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { revisarImagen } from '../../common/archivos-seguros';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import {
  CreateAccessRequestDto, DecideAccessRequestDto, QueryAccessRequestDto, UpdateAccessRequestDto,
} from './dto/access.dto';
// PDF: require para no depender de @types en el build.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument = require('pdfkit');

const MEANS_ES: Record<string, string> = {
  MANLIFT: 'Manlift (plataforma elevadora)', GRUA: 'Grúa / izaje', ANDAMIO: 'Andamio',
  ESCALERA: 'Escalera', LINEA_VIDA: 'Línea de vida', OTRO: 'Otro',
};
const STATUS_ES: Record<string, string> = {
  SOLICITADO: 'Solicitado', EN_REVISION: 'En revisión', APROBADO: 'Aprobado', RECHAZADO: 'Rechazado',
};
// Umbral normativo de trabajo en altura (NTP 399.010 / Ley 29783): 1.80 m.
const ALTURA_TRABAJO_EN_ALTURA_M = 1.8;

const inc = {
  asset: { select: { id: true, assetCode: true, type: true, location: { select: { name: true } } } },
  requestedBy: { select: { fullName: true, email: true } },
  reviewedBy: { select: { fullName: true, email: true } },
};

@Injectable()
export class AccessService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private storage: StorageService,
  ) {}

  private async nextCode(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `ACC-${year}-`;
    const last = await this.prisma.accessRequest.findFirst({
      where: { code: { startsWith: prefix } },
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    let n = 0;
    if (last) {
      const parsed = parseInt(last.code.slice(prefix.length), 10);
      if (!Number.isNaN(parsed)) n = parsed;
    }
    return `${prefix}${String(n + 1).padStart(4, '0')}`;
  }

  async findAll(q: QueryAccessRequestDto) {
    const where: any = { status: q.status, assetId: q.assetId };
    if (q.q && q.q.trim()) {
      const t = q.q.trim();
      where.OR = [
        { code: { contains: t, mode: 'insensitive' } },
        { justification: { contains: t, mode: 'insensitive' } },
        { asset: { assetCode: { contains: t, mode: 'insensitive' } } },
      ];
    }
    const rows = await this.prisma.accessRequest.findMany({
      where,
      include: { ...inc, _count: { select: { photos: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r: any) => ({
      ...r,
      photoCount: r._count.photos,
      trabajoEnAltura: (r.heightMeters ?? 0) >= ALTURA_TRABAJO_EN_ALTURA_M,
    }));
  }

  async findOne(id: string) {
    const r = await this.prisma.accessRequest.findUnique({
      where: { id },
      include: { ...inc, photos: { orderBy: { createdAt: 'asc' } } },
    });
    if (!r) throw new NotFoundException('Solicitud de acceso no encontrada');
    return { ...r, trabajoEnAltura: (r.heightMeters ?? 0) >= ALTURA_TRABAJO_EN_ALTURA_M };
  }

  /** Resumen para el tablero: cuántas esperan aprobación y cuántos activos requieren manlift. */
  async summary() {
    const [solicitadas, enRevision, aprobadas, rechazadas] = await Promise.all([
      this.prisma.accessRequest.count({ where: { status: 'SOLICITADO' } }),
      this.prisma.accessRequest.count({ where: { status: 'EN_REVISION' } }),
      this.prisma.accessRequest.count({ where: { status: 'APROBADO' } }),
      this.prisma.accessRequest.count({ where: { status: 'RECHAZADO' } }),
    ]);
    // Activos con acceso especial aprobado: se agrupan para optimizar el alquiler del manlift.
    const conManlift = await this.prisma.accessRequest.findMany({
      where: { status: 'APROBADO', means: { in: ['MANLIFT', 'GRUA'] as any } },
      select: { assetId: true },
      distinct: ['assetId'],
    });
    return {
      solicitadas, enRevision, aprobadas, rechazadas,
      pendientes: solicitadas + enRevision,
      activosConAccesoEspecial: conManlift.length,
    };
  }

  async create(dto: CreateAccessRequestDto, userId?: string | null, ip?: string | null) {
    const asset = await this.prisma.asset.findUnique({ where: { id: dto.assetId } });
    if (!asset || asset.deletedAt) throw new NotFoundException('Activo no encontrado');

    const code = await this.nextCode();
    const created = await this.prisma.accessRequest.create({
      data: {
        code,
        assetId: dto.assetId,
        requestedById: userId || undefined,
        heightMeters: dto.heightMeters,
        means: dto.means || 'MANLIFT',
        locationKind: dto.locationKind,
        justification: dto.justification,
        accessRoute: dto.accessRoute,
        requiresPetar: dto.requiresPetar ?? ((dto.heightMeters ?? 0) >= ALTURA_TRABAJO_EN_ALTURA_M),
        hasIperc: dto.hasIperc ?? false,
        hasAts: dto.hasAts ?? false,
        personnelCount: dto.personnelCount ?? 2,
        eppDetail: dto.eppDetail,
        risks: dto.risks,
        productionImpact: dto.productionImpact,
      },
      include: inc,
    });
    await this.audit.record({
      userId: userId || null, action: 'CREATE_ACCESS_REQUEST', entity: 'access_requests', entityId: created.id, ip,
      after: { codigo: code, activo: asset.assetCode, medio: created.means },
    });
    return created;
  }

  async update(id: string, dto: UpdateAccessRequestDto, userId?: string | null, ip?: string | null) {
    const cur = await this.prisma.accessRequest.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('Solicitud de acceso no encontrada');
    // Una solicitud ya resuelta no se edita: se crea una nueva.
    if (cur.status === 'APROBADO' || cur.status === 'RECHAZADO') {
      throw new BadRequestException('La solicitud ya fue resuelta; registra una nueva si hace falta.');
    }
    const updated = await this.prisma.accessRequest.update({
      where: { id }, data: { ...dto, status: 'EN_REVISION' }, include: inc,
    });
    await this.audit.record({
      userId: userId || null, action: 'UPDATE_ACCESS_REQUEST', entity: 'access_requests', entityId: id, ip,
      after: { codigo: cur.code },
    });
    return updated;
  }

  /**
   * Decisión del JEFE DE MANTENIMIENTO (firma electrónica).
   * Para APROBAR se exige sustento fotográfico: el manlift es un recurso caro y el
   * trabajo en altura es de alto riesgo; la aprobación debe quedar documentada.
   */
  async decide(id: string, dto: DecideAccessRequestDto, ip?: string | null) {
    const req = await this.prisma.accessRequest.findUnique({
      where: { id }, include: { _count: { select: { photos: true } }, asset: { select: { assetCode: true } } },
    });
    if (!req) throw new NotFoundException('Solicitud de acceso no encontrada');
    if (dto.status !== 'APROBADO' && dto.status !== 'RECHAZADO') {
      throw new BadRequestException('La decisión debe ser APROBADO o RECHAZADO.');
    }
    if (dto.status === 'APROBADO' && req._count.photos === 0) {
      throw new BadRequestException(
        'No se puede aprobar sin sustento fotográfico: adjunta al menos una foto que evidencie la inaccesibilidad.',
      );
    }

    // Firma electrónica: re-verifica identidad del que aprueba.
    const signer = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const valid = signer && signer.active
      ? await argon2.verify(signer.passwordHash, dto.password).catch(() => false)
      : false;
    if (!valid) {
      await this.audit.record({
        userId: signer?.id || null, action: 'FIRMA_FALLIDA', entity: 'access_requests', entityId: id, ip,
        after: { intento: dto.email, motivo: 'contraseña incorrecta', accion: 'resolver solicitud de acceso' },
      });
      throw new BadRequestException('Firma inválida: contraseña incorrecta');
    }

    const updated = await this.prisma.accessRequest.update({
      where: { id },
      data: {
        status: dto.status,
        decisionNotes: dto.decisionNotes,
        reviewedById: signer!.id,
        reviewedAt: new Date(),
      },
      include: inc,
    });
    await this.audit.record({
      userId: signer!.id, action: dto.status === 'APROBADO' ? 'APROBAR_ACCESO' : 'RECHAZAR_ACCESO',
      entity: 'access_requests', entityId: id, ip,
      after: { codigo: req.code, activo: req.asset.assetCode, firmadoPor: signer!.email },
    });
    return updated;
  }

  // ---------- Sustento fotográfico ----------
  async addPhoto(id: string, file: any, caption?: string) {
    const req = await this.prisma.accessRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Solicitud de acceso no encontrada');
    if (!file || !file.buffer) throw new BadRequestException('Imagen requerida');
    // No se cree lo que el archivo DICE ser: se miran sus primeros bytes.
    // `file.mimetype` lo manda el navegador; un .html declarado como
    // imagen quedaba guardado y se ejecutaba al abrir la evidencia.
    const revision = revisarImagen(file as any);
    if (!revision.ok) throw new BadRequestException(revision.motivo);
    // La extensión sale del tipo REAL del archivo, nunca del nombre que
    // mandó el navegador: 'foto.jpg.html' o un nombre con ../ dentro no
    // puede acabar decidiendo cómo ni dónde se guarda.
    const ext = revision.tipo.extension;
    const objectName = `access/${id}/${Date.now()}-${randomUUID()}.${ext}`;
    await this.storage.put(objectName, file.buffer, revision.tipo.mime);
    return this.prisma.accessRequestPhoto.create({
      data: { requestId: id, fileId: objectName, caption: caption || null },
    });
  }

  listPhotos(id: string) {
    return this.prisma.accessRequestPhoto.findMany({ where: { requestId: id }, orderBy: { createdAt: 'asc' } });
  }

  async getPhotoFile(photoId: string): Promise<{ buffer: Buffer; contentType: string }> {
    const ph = await this.prisma.accessRequestPhoto.findUnique({ where: { id: photoId } });
    if (!ph) throw new NotFoundException('Foto no encontrada');
    const buffer = await this.storage.getBuffer(ph.fileId);
    const ext = ph.fileId.split('.').pop()?.toLowerCase();
    return { buffer, contentType: ext === 'png' ? 'image/png' : 'image/jpeg' };
  }

  // ---------- Documento sustentado (PDF) ----------
  async buildReport(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const r: any = await this.prisma.accessRequest.findUnique({
      where: { id },
      include: { ...inc, photos: { orderBy: { createdAt: 'asc' } } },
    });
    if (!r) throw new NotFoundException('Solicitud de acceso no encontrada');

    const images: { buffer: Buffer; caption?: string | null }[] = [];
    for (const ph of r.photos) {
      try { images.push({ buffer: await this.storage.getBuffer(ph.fileId), caption: ph.caption }); } catch { /* omitir */ }
    }

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    const NAVY = '#1b2a4a', RED = '#c0392b', GREY = '#555555', OK = '#16a34a';
    const pageW = doc.page.width;
    const fmt = (d?: Date | null) => (d ? new Date(d).toLocaleString('es-PE') : '—');
    const si = (b: boolean) => (b ? 'Sí' : 'No');

    doc.rect(0, 0, pageW, 92).fill(NAVY);
    doc.fillColor('#ffffff').fontSize(17).text('ACEROS AREQUIPA — Planta Pisco', 50, 26);
    doc.fillColor('#cfd8e3').fontSize(10).text('SGIT-CCTV · Solicitud de acceso especial (trabajo en altura)', 50, 50);
    doc.fillColor('#ffffff').fontSize(20).text(r.code, 0, 34, { align: 'right', width: pageW - 50 });
    doc.fillColor('#000000');

    let y = 116;
    const heading = (t: string) => {
      doc.fontSize(13).fillColor(NAVY).text(t, 50, y); y = doc.y + 6;
      doc.moveTo(50, y).lineTo(pageW - 50, y).strokeColor('#dddddd').stroke(); y += 8;
    };
    const line = (label: string, value: string, color = '#000000') => {
      doc.fontSize(10).fillColor(GREY).text(label, 50, y);
      doc.fontSize(11).fillColor(color).text(value || '—', 215, y, { width: pageW - 265 });
      y = doc.y + 6;
    };
    const block = (label: string, value: string) => {
      doc.fontSize(10).fillColor(GREY).text(label, 50, y); y = doc.y + 3;
      doc.fontSize(11).fillColor('#000000').text(value || '—', 50, y, { width: pageW - 100 }); y = doc.y + 8;
    };

    heading('Identificación');
    line('Activo', r.asset ? `${r.asset.assetCode} (${r.asset.type})` : '—');
    line('Ubicación', r.asset?.location?.name || '—');
    line('Solicitado por', r.requestedBy ? `${r.requestedBy.fullName}` : '—');
    line('Fecha de solicitud', fmt(r.createdAt));
    line('Estado', STATUS_ES[r.status] || r.status,
      r.status === 'APROBADO' ? OK : r.status === 'RECHAZADO' ? RED : '#000000');

    y += 4;
    heading('Condición de acceso');
    line('Medio requerido', MEANS_ES[r.means] || r.means);
    line('Altura estimada', r.heightMeters != null ? `${r.heightMeters} m` : '—');
    line('Tipo de emplazamiento', r.locationKind || '—');
    const enAltura = (r.heightMeters ?? 0) >= ALTURA_TRABAJO_EN_ALTURA_M;
    line('Clasifica como trabajo en altura', enAltura ? 'Sí (≥ 1.80 m)' : 'No', enAltura ? RED : '#000000');
    block('Justificación de la inaccesibilidad', r.justification);
    block('Ruta / restricciones de acceso', r.accessRoute || '—');

    y += 4;
    heading('Seguridad (SSOMA)');
    line('Requiere PETAR', si(r.requiresPetar), r.requiresPetar ? RED : '#000000');
    line('IPERC elaborado', si(r.hasIperc), r.hasIperc ? OK : RED);
    line('ATS del día', si(r.hasAts), r.hasAts ? OK : RED);
    line('Personal asignado', r.personnelCount != null ? `${r.personnelCount} persona(s)` : '—');
    block('EPP requerido', r.eppDetail || '—');
    block('Riesgos identificados', r.risks || '—');
    block('Impacto en producción', r.productionImpact || '—');

    y += 4;
    heading('Resolución');
    line('Decisión', STATUS_ES[r.status] || r.status,
      r.status === 'APROBADO' ? OK : r.status === 'RECHAZADO' ? RED : '#000000');
    line('Revisado por', r.reviewedBy ? r.reviewedBy.fullName : '—');
    line('Fecha de resolución', fmt(r.reviewedAt));
    block('Observaciones', r.decisionNotes || '—');

    if (images.length) {
      doc.addPage();
      doc.fontSize(13).fillColor(NAVY).text('Sustento fotográfico de la inaccesibilidad', 50, 50);
      let iy = 82; const maxW = pageW - 100;
      for (const img of images) {
        if (iy > doc.page.height - 250) { doc.addPage(); iy = 50; }
        try { doc.image(img.buffer, 50, iy, { fit: [maxW, 220], align: 'center' }); iy += 228; }
        catch { doc.fontSize(9).fillColor(RED).text('(imagen no renderizable)', 50, iy); iy += 20; }
        if (img.caption) { doc.fontSize(9).fillColor(GREY).text(img.caption, 50, iy, { width: maxW }); iy = doc.y + 12; }
      }
    }

    doc.fontSize(8).fillColor(GREY).text(
      `Documento generado por SGIT-CCTV el ${new Date().toLocaleString('es-PE')}. ` +
      'Sustento para solicitud de manlift/izaje — Mantenimiento CCTV, Aceros Arequipa.',
      50, doc.page.height - 42, { width: pageW - 100, align: 'center' },
    );

    doc.end();
    const buffer = await done;
    return { buffer, filename: `acceso-${r.code}.pdf` };
  }
}
