import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { decryptSecret } from '../../common/crypto/crypto.util';
import { computeEffectiveStatuses, computeEffectiveStatus } from '../../common/asset-status';
// PDF: require para no depender de @types en el build.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument = require('pdfkit');

const TYPE_ES: Record<string, string> = { CAMERA: 'Cámara', NVR: 'NVR', SWITCH: 'Switch', WIRELESS: 'Enlace inalámbrico', ROUTER: 'Router', FIREWALL: 'Firewall', SERVER: 'Servidor', UPS: 'UPS', FIBER: 'Fibra', CABINET: 'Gabinete', DECODER: 'Decodificador', PC: 'PC / iVMS-4200', OTHER: 'Otro' };
const STATUS_ES: Record<string, string> = { OPERATIVO: 'Operativo', FUERA_SERVICIO: 'Fuera de servicio', MANTENIMIENTO: 'En mantenimiento', CON_INCIDENCIA: 'Con incidencia', BAJA: 'Baja', STOCK: 'En stock' };
const PHOTO_ES: Record<string, string> = { APUNTA: 'Imagen en pantalla (púlpito)', REFERENCIA: 'Ubicación de referencia', PLANO: 'Ubicación en plano', GENERAL: 'General' };
import { CreateAssetDto } from './dto/create-asset.dto';
import { SignedCreateAssetDto } from './dto/create-asset-signed.dto';
import { SignedUpdateAssetDto } from './dto/update-asset-signed.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { UpdateNetworkDto } from './dto/update-network.dto';
import { QueryAssetDto } from './dto/query-asset.dto';

@Injectable()
export class AssetsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private storage: StorageService,
  ) {}

  /**
   * Alta FIRMADA de activo: re-verifica las credenciales del firmante (argon2) y deja
   * traza de auditoría (CREATE_ASSET) con el firmante. Registrar un activo es crítico
   * porque contiene información sensible (IP, red, accesos).
   */
  async createSigned(dto: SignedCreateAssetDto, ip?: string | null) {
    const signer = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const valid = signer && signer.active
      ? await argon2.verify(signer.passwordHash, dto.password).catch(() => false)
      : false;
    if (!valid) {
      // Registra el intento fallido (no se agregó) y NO cierra sesión (error 400, no 401).
      await this.audit.record({
        userId: signer?.id || null,
        action: 'FIRMA_FALLIDA',
        entity: 'assets',
        ip,
        after: { intento: dto.email, motivo: 'contraseña incorrecta', accion: 'registrar activo' },
      });
      throw new BadRequestException('Firma inválida: contraseña incorrecta');
    }

    const { email, password, ...data } = dto;
    const asset = await this.prisma.asset.create({ data: data as CreateAssetDto });
    await this.audit.record({
      userId: signer!.id,
      action: 'CREATE_ASSET',
      entity: 'assets',
      entityId: asset.id,
      ip,
      after: { assetCode: asset.assetCode, type: asset.type, firmadoPor: signer!.email },
    });
    return asset;
  }

  async findAll(q: QueryAssetDto, sensitive = false) {
    const rows = await this.prisma.asset.findMany({
      where: {
        deletedAt: null,
        type: q.type,
        status: q.status,
        locationId: q.locationId,
        ...(q.search
          ? { OR: [{ assetCode: { contains: q.search, mode: 'insensitive' } }, { model: { contains: q.search, mode: 'insensitive' } }] }
          : {}),
      },
      include: sensitive
        ? {
            location: true,
            camera: { select: { ipAddress: true } },
            switchDev: { select: { mgmtIp: true } },
            nvr: { select: { nicPrimary: true } },
            credentials: { take: 1, orderBy: { createdAt: 'desc' } },
          }
        : { location: true },
      orderBy: { assetCode: 'asc' },
    });
    // Estado operativo DERIVADO (F5): calculado desde OM/incidencias abiertas.
    const eff = await computeEffectiveStatuses(this.prisma, rows);
    if (!sensitive) {
      return rows.map((a: any) => ({ ...a, effectiveStatus: eff[a.id] || a.status }));
    }
    // IP y contraseña (descifrada) solo para roles con credential.read
    // (Jefe de Mantenimiento, Supervisor TI, Técnico de Red).
    return rows.map((a: any) => {
      const { credentials, camera, switchDev, nvr, ...rest } = a;
      let password: string | null = null;
      const c = credentials?.[0];
      if (c) { try { password = decryptSecret(c.secretEnc); } catch { password = null; } }
      return {
        ...rest,
        effectiveStatus: eff[a.id] || a.status,
        ip: a.ipAddress || camera?.ipAddress || switchDev?.mgmtIp || nvr?.nicPrimary || null,
        password,
        credentialId: c?.id || null,
      };
    });
  }

  /**
   * Detalle de activo. Los datos de RED sensibles (IP, MAC, IP de gestión, NICs del NVR)
   * solo se devuelven si `sensitive` es true (usuario con permiso credential.read:
   * Jefe de Mantenimiento, Supervisor TI, Técnico de Red). Al resto se le ocultan.
   */
  async findOne(id: string, sensitive = false) {
    const asset: any = await this.prisma.asset.findUnique({
      where: { id },
      include: {
        location: true, cabinet: true, camera: true, nvr: true, switchDev: true, wireless: true,
        photos: { orderBy: { createdAt: 'asc' } },
        workOrders: {
          orderBy: { createdAt: 'desc' }, take: 8,
          select: { code: true, type: true, status: true, scheduledDate: true, executedDate: true },
        },
      },
    });
    if (!asset || asset.deletedAt) throw new NotFoundException('Activo no encontrado');

    if (!sensitive) {
      if (asset.camera) { asset.camera.ipAddress = null; asset.camera.macAddress = null; }
      if (asset.switchDev) { asset.switchDev.mgmtIp = null; }
      if (asset.nvr) { asset.nvr.nicPrimary = null; asset.nvr.nicSecondary = null; }
    }
    // Estado operativo derivado (F5) para que el detalle sea coherente con OM/incidencias.
    asset.effectiveStatus = await computeEffectiveStatus(this.prisma, asset);
    return asset;
  }

  update(id: string, dto: UpdateAssetDto) {
    return this.prisma.asset.update({ where: { id }, data: dto });
  }

  /**
   * Edición FIRMADA de activo: re-verifica credenciales del firmante y audita UPDATE_ASSET.
   * Un fallo de firma se audita (FIRMA_FALLIDA) y devuelve 400 (no cierra sesión).
   */
  async updateSigned(id: string, dto: SignedUpdateAssetDto, ip?: string | null) {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset || asset.deletedAt) throw new NotFoundException('Activo no encontrado');
    const signer = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const valid = signer && signer.active
      ? await argon2.verify(signer.passwordHash, dto.password).catch(() => false)
      : false;
    if (!valid) {
      await this.audit.record({
        userId: signer?.id || null, action: 'FIRMA_FALLIDA', entity: 'assets', entityId: id, ip,
        after: { intento: dto.email, motivo: 'contraseña incorrecta', accion: 'editar activo' },
      });
      throw new BadRequestException('Firma inválida: contraseña incorrecta');
    }
    const { email, password, ...data } = dto;
    const updated = await this.prisma.asset.update({ where: { id }, data: data as any });
    await this.audit.record({
      userId: signer!.id, action: 'UPDATE_ASSET', entity: 'assets', entityId: id, ip,
      after: { assetCode: updated.assetCode, firmadoPor: signer!.email },
    });
    return updated;
  }

  /**
   * Actualiza datos de RED sensibles (IP). Solo credential.manage (Jefe y Técnico de Red).
   * Queda auditado — pensado para proyectos de estandarización de red.
   */
  async updateNetwork(id: string, dto: UpdateNetworkDto, ip?: string | null, userId?: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset || asset.deletedAt) throw new NotFoundException('Activo no encontrado');
    const updated = await this.prisma.asset.update({ where: { id }, data: { ipAddress: dto.ipAddress } });
    await this.audit.record({
      userId: userId || null,
      action: 'UPDATE_NETWORK',
      entity: 'assets',
      entityId: id,
      ip,
      after: { assetCode: asset.assetCode, ipAddress: dto.ipAddress },
    });
    return { id: updated.id, ipAddress: updated.ipAddress };
  }

  remove(id: string) {
    return this.prisma.asset.update({ where: { id }, data: { deletedAt: new Date(), status: 'BAJA' } });
  }

  // ---------- Fotografías del activo (a qué apunta, referencia, plano) ----------
  async addPhoto(id: string, file: any, kind?: string, caption?: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset || asset.deletedAt) throw new NotFoundException('Activo no encontrado');
    if (!file || !file.buffer) throw new BadRequestException('Imagen requerida');
    const ext = (file.originalname?.split('.').pop() || 'jpg').toLowerCase();
    const objectName = `asset/${id}/${Date.now()}-${randomUUID()}.${ext}`;
    await this.storage.put(objectName, file.buffer, file.mimetype || 'image/jpeg');
    return this.prisma.assetPhoto.create({
      data: { assetId: id, kind: (kind as any) || 'GENERAL', fileId: objectName, caption: caption || null },
    });
  }

  listPhotos(id: string) {
    return this.prisma.assetPhoto.findMany({ where: { assetId: id }, orderBy: { createdAt: 'asc' } });
  }

  async getPhotoFile(photoId: string): Promise<{ buffer: Buffer; contentType: string }> {
    const ph = await this.prisma.assetPhoto.findUnique({ where: { id: photoId } });
    if (!ph) throw new NotFoundException('Foto no encontrada');
    const buffer = await this.storage.getBuffer(ph.fileId);
    const ext = ph.fileId.split('.').pop()?.toLowerCase();
    return { buffer, contentType: ext === 'png' ? 'image/png' : 'image/jpeg' };
  }

  async removePhoto(photoId: string) {
    const ph = await this.prisma.assetPhoto.findUnique({ where: { id: photoId } });
    if (!ph) throw new NotFoundException('Foto no encontrada');
    await this.prisma.assetPhoto.delete({ where: { id: photoId } });
    await this.storage.remove(ph.fileId).catch(() => null);
    return { ok: true };
  }

  // ---------- Informe del equipo (PDF): ficha técnica + fotos + historial ----------
  async buildReport(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const asset: any = await this.prisma.asset.findUnique({
      where: { id },
      include: {
        location: true, cabinet: true,
        photos: { orderBy: { createdAt: 'asc' } },
        preventivePlan: true,
        workOrders: {
          orderBy: { createdAt: 'desc' }, take: 10,
          select: { code: true, type: true, status: true, scheduledDate: true, executedDate: true, activity: true },
        },
      },
    });
    if (!asset || asset.deletedAt) throw new NotFoundException('Activo no encontrado');
    const eff = await computeEffectiveStatus(this.prisma, asset);

    const images: { buffer: Buffer; kind: string; caption?: string | null }[] = [];
    for (const ph of asset.photos) {
      try { images.push({ buffer: await this.storage.getBuffer(ph.fileId), kind: ph.kind, caption: ph.caption }); } catch { /* omitir */ }
    }

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    const NAVY = '#1b2a4a', RED = '#c0392b', GREY = '#555555';
    const pageW = doc.page.width;
    const fmt = (d?: Date | null) => (d ? new Date(d).toLocaleDateString('es-PE') : '—');

    doc.rect(0, 0, pageW, 92).fill(NAVY);
    doc.fillColor('#ffffff').fontSize(17).text('ACEROS AREQUIPA — Planta Pisco', 50, 26);
    doc.fillColor('#cfd8e3').fontSize(10).text('SGIT-CCTV · Informe del equipo (ficha técnica)', 50, 50);
    doc.fillColor('#ffffff').fontSize(20).text(asset.assetCode, 0, 34, { align: 'right', width: pageW - 50 });
    doc.fillColor('#000000');

    let y = 116;
    const heading = (t: string) => {
      doc.fontSize(13).fillColor(NAVY).text(t, 50, y); y = doc.y + 6;
      doc.moveTo(50, y).lineTo(pageW - 50, y).strokeColor('#dddddd').stroke(); y += 8;
    };
    const line = (label: string, value: string) => {
      doc.fontSize(10).fillColor(GREY).text(label, 50, y);
      doc.fontSize(11).fillColor('#000000').text(value || '—', 210, y, { width: pageW - 260 });
      y = doc.y + 6;
    };

    heading('Ficha del activo');
    line('Tipo', TYPE_ES[asset.type] || asset.type);
    line('Marca / Modelo', [asset.brand, asset.model].filter(Boolean).join(' ') || '—');
    line('N° de serie', asset.serialNumber || '—');
    line('Estado operativo', STATUS_ES[eff] || eff);
    line('Criticidad', asset.criticality);
    line('IP', asset.ipAddress || '—');
    line('Ubicación', asset.location ? asset.location.name : '—');
    line('Gabinete', asset.cabinet ? `${asset.cabinet.code} — ${asset.cabinet.name}` : '—');
    line('Lugar de referencia', asset.referencePlace || '—');
    line('Código SAP', asset.sapId || '—');

    y += 6;
    heading('Plan de mantenimiento preventivo');
    if (asset.preventivePlan) {
      line('Intervalo', `${asset.preventivePlan.intervalDays} días${asset.preventivePlan.zoneCritical ? ' (zona crítica)' : ''}`);
      line('Último preventivo', fmt(asset.preventivePlan.lastServiceAt));
      line('Próximo preventivo', fmt(asset.preventivePlan.nextDueAt));
    } else {
      doc.fontSize(11).fillColor(GREY).text('Sin plan preventivo asignado.', 50, y); y = doc.y + 6;
    }

    y += 6;
    heading('Historial de mantenimiento (últimas 10)');
    if (asset.workOrders.length) {
      for (const w of asset.workOrders) {
        doc.fontSize(10).fillColor('#000000').text(`• ${w.code} · ${w.type} · ${w.status} · ${fmt(w.executedDate || w.scheduledDate)}`, 55, y, { width: pageW - 110 });
        y = doc.y + 2;
        if (w.activity) { doc.fontSize(9).fillColor(GREY).text(`   ${w.activity}`, 60, y, { width: pageW - 120 }); y = doc.y + 3; }
        if (y > doc.page.height - 120) { doc.addPage(); y = 50; }
      }
    } else {
      doc.fontSize(11).fillColor(GREY).text('Sin órdenes de mantenimiento registradas.', 50, y); y = doc.y + 6;
    }

    if (images.length) {
      doc.addPage();
      doc.fontSize(13).fillColor(NAVY).text('Fotografías del equipo', 50, 50);
      let iy = 82; const maxW = pageW - 100;
      for (const img of images) {
        if (iy > doc.page.height - 250) { doc.addPage(); iy = 50; }
        doc.fontSize(10).fillColor(NAVY).text(PHOTO_ES[img.kind] || img.kind, 50, iy); iy = doc.y + 4;
        try { doc.image(img.buffer, 50, iy, { fit: [maxW, 220], align: 'center' }); iy += 228; }
        catch { doc.fontSize(9).fillColor(RED).text('(imagen no renderizable)', 50, iy); iy += 20; }
        if (img.caption) { doc.fontSize(9).fillColor(GREY).text(img.caption, 50, iy, { width: maxW }); iy = doc.y + 12; }
      }
    }

    doc.fontSize(8).fillColor(GREY).text(
      `Documento generado por SGIT-CCTV el ${new Date().toLocaleString('es-PE')}. Ficha técnica — Aceros Arequipa, Planta Pisco.`,
      50, doc.page.height - 38, { width: pageW - 100, align: 'center' },
    );

    doc.end();
    const buffer = await done;
    return { buffer, filename: `informe-${asset.assetCode}.pdf` };
  }
}
