import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { revisarImagen } from '../../common/archivos-seguros';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { filtroDeUbicaciones } from '../../common/ambito-planta';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { CreateCabinetDto, UpdateCabinetDto } from './dto/cabinet.dto';
// Se cargan con require, IGUAL que en assets.service.ts, y no con
// `import * as`. Con esModuleInterop, `import * as PDFDocument` devuelve un
// objeto de espacio de nombres que NO se puede usar con `new`: compila sin
// una queja y revienta al pulsar el botón con
// "PDFDocument is not a constructor".
// Es justo lo que pasó: el QR individual funcionaba —ahí sólo se llama a un
// método— y la hoja de etiquetas fallaba.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PDFDocument = require('pdfkit');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const QRCode = require('qrcode');
import { computeEffectiveStatuses } from '../../common/asset-status';

@Injectable()
export class CabinetsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private storage: StorageService,
  ) {}

  /**
   * Ámbito de planta: un gabinete pertenece al tren de SU ubicación. Los que
   * no tienen ubicación no salen al filtrar, y es correcto: si no está en el
   * árbol, no está en ningún tren.
   */
  async list(q?: { tren?: string; etapa?: string }) {
    const ambito = await filtroDeUbicaciones(this.prisma, { tren: q?.tren, etapa: q?.etapa });
    const cabs = await this.prisma.cabinet.findMany({
      where: ambito ? { locationId: ambito } : {},
      include: { location: { select: { name: true } }, _count: { select: { assets: true } } },
      orderBy: { code: 'asc' },
    });
    return cabs.map((c: any) => ({ ...c, assetCount: c._count.assets, hasPhoto: !!c.photoFileId }));
  }

  async findOne(id: string) {
    const c = await this.prisma.cabinet.findUnique({
      where: { id },
      include: { location: true, assets: { select: { id: true, assetCode: true, type: true } } },
    });
    if (!c) throw new NotFoundException('Gabinete no encontrado');
    return { ...c, hasPhoto: !!c.photoFileId };
  }

  async create(dto: CreateCabinetDto, userId?: string | null, ip?: string | null) {
    const c = await this.prisma.cabinet.create({ data: dto });
    await this.audit.record({ userId: userId || null, action: 'CREATE_CABINET', entity: 'cabinets', entityId: c.id, ip, after: { code: c.code } });
    return c;
  }

  async update(id: string, dto: UpdateCabinetDto, userId?: string | null, ip?: string | null) {
    const exists = await this.prisma.cabinet.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Gabinete no encontrado');
    const c = await this.prisma.cabinet.update({ where: { id }, data: dto });
    await this.audit.record({ userId: userId || null, action: 'UPDATE_CABINET', entity: 'cabinets', entityId: id, ip, after: { code: c.code } });
    return c;
  }

  async remove(id: string) {
    const exists = await this.prisma.cabinet.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Gabinete no encontrado');
    // Los activos montados quedan con cabinetId = null (relación opcional).
    await this.prisma.cabinet.delete({ where: { id } });
    return { ok: true };
  }

  async uploadPhoto(id: string, file: any) {
    const cab = await this.prisma.cabinet.findUnique({ where: { id } });
    if (!cab) throw new NotFoundException('Gabinete no encontrado');
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
    const objectName = `cabinet/${id}/${Date.now()}-${randomUUID()}.${ext}`;
    await this.storage.put(objectName, file.buffer, revision.tipo.mime);
    return this.prisma.cabinet.update({ where: { id }, data: { photoFileId: objectName } });
  }

  async getPhoto(id: string): Promise<{ buffer: Buffer; contentType: string }> {
    const cab = await this.prisma.cabinet.findUnique({ where: { id } });
    if (!cab || !cab.photoFileId) throw new NotFoundException('El gabinete no tiene foto');
    const buffer = await this.storage.getBuffer(cab.photoFileId);
    const ext = cab.photoFileId.split('.').pop()?.toLowerCase();
    return { buffer, contentType: ext === 'png' ? 'image/png' : 'image/jpeg' };
  }

  // ==========================================================================
  //  QR DEL GABINETE (bloque 5a)
  //
  //  POR QUÉ EL GABINETE Y NO SÓLO EL ACTIVO
  //  El técnico que llega a planta no se planta delante de una cámara: se
  //  planta delante de un ARMARIO CERRADO. Lo que necesita ahí es "qué hay
  //  dentro de esto y qué le pasa", no la ficha de un equipo que todavía no
  //  sabe cuál es.
  //
  //  El QR del activo sirve cuando ya lo tienes localizado. Éste sirve para
  //  llegar, que es el paso de antes.
  // ==========================================================================

  private urlGabinete(id: string): string {
    const base = (process.env.APP_URL || process.env.FRONTEND_URL || '')
      .trim().replace(/\/$/, '');
    return `${base}/g/${id}`;
  }

  /** QR individual del gabinete, en PNG. */
  async qrPng(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const gab = await this.prisma.cabinet.findUnique({
      where: { id }, select: { code: true },
    });
    if (!gab) throw new NotFoundException('Gabinete no encontrado');
    const buffer: Buffer = await QRCode.toBuffer(this.urlGabinete(id), {
      type: 'png', width: 512, margin: 1,
      color: { dark: '#16233bff', light: '#ffffffff' },
      // Tolerancia media: la etiqueta va dentro de una nave con polvo de
      // laminación y se ensucia. Es la misma que se usa en los activos.
      errorCorrectionLevel: 'M',
    });
    return { buffer, filename: `qr-gabinete-${gab.code}.png` };
  }

  /**
   * Lo que se ve al escanear: qué hay dentro y qué le pasa.
   *
   * El estado de cada equipo es el EFECTIVO —el mismo que ve en Activos—, no
   * la columna a secas: una cámara con una OM abierta no está "operativa"
   * aunque nadie haya cambiado su estado a mano.
   */
  async fichaRapida(id: string) {
    const gab = await this.prisma.cabinet.findUnique({
      where: { id },
      include: {
        location: { select: { name: true, path: true } },
        assets: {
          where: { deletedAt: null },
          select: {
            id: true, assetCode: true, type: true, status: true,
            referencePlace: true, ipAddress: true,
          },
          orderBy: { assetCode: 'asc' },
        },
      },
    });
    if (!gab) throw new NotFoundException('Gabinete no encontrado');

    const eff = await computeEffectiveStatuses(this.prisma, gab.assets as any);
    const ids = gab.assets.map((a) => a.id);

    // Órdenes abiertas de CUALQUIER equipo del gabinete. Es la pregunta real
    // de quien está delante: "¿ya hay alguien en esto?". Sin esto, dos
    // técnicos se plantan el mismo día en el mismo armario.
    const ordenes = ids.length
      ? await this.prisma.workOrder.findMany({
          where: { assetId: { in: ids }, status: { in: ['ABIERTA', 'EN_PROCESO', 'EN_ESPERA'] } },
          select: {
            id: true, code: true, status: true, activity: true, scheduledDate: true,
            asset: { select: { assetCode: true } },
            technician: { select: { fullName: true } },
          },
          orderBy: { scheduledDate: 'asc' },
        })
      : [];

    const equipos = gab.assets.map((a) => ({
      ...a,
      estadoEfectivo: eff[a.id] || a.status,
    }));
    const caidos = equipos.filter((e) =>
      ['FUERA_SERVICIO', 'CON_INCIDENCIA', 'MANTENIMIENTO'].includes(e.estadoEfectivo),
    ).length;

    return {
      id: gab.id,
      code: gab.code,
      name: gab.name,
      lugar: gab.referencePlace,
      ubicacion: gab.location?.name,
      tieneFoto: !!gab.photoFileId,
      notas: gab.notes,
      equipos,
      total: equipos.length,
      caidos,
      ordenes,
      // Frase lista para la pantalla. El número solo no dice si hay que
      // preocuparse; esto sí.
      resumen: equipos.length === 0
        ? 'Este gabinete no tiene equipos registrados todavía.'
        : caidos === 0
          ? `${equipos.length} equipo(s), todos operativos.`
          : `${caidos} de ${equipos.length} equipo(s) con problema.`,
    };
  }

  /**
   * Hoja de etiquetas de gabinete, en PDF.
   *
   * Distinta de la de activos a propósito: SEIS por hoja en lugar de doce, y
   * el rótulo MUCHO más grande. Una etiqueta de gabinete se lee de pie, a dos
   * metros, en una nave con poca luz. La del activo se lee a un palmo.
   */
  async qrSheet(ids?: string[]): Promise<{ buffer: Buffer; filename: string }> {
    const gabinetes = await this.prisma.cabinet.findMany({
      where: ids && ids.length ? { id: { in: ids } } : undefined,
      select: {
        id: true, code: true, name: true, referencePlace: true,
        location: { select: { name: true } },
      },
      orderBy: { code: 'asc' },
      take: 120,
    });
    if (!gabinetes.length) throw new NotFoundException('No hay gabinetes para generar etiquetas');

    const doc = new PDFDocument({ size: 'A4', margin: 28 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    const NAVY = '#16233b', GREY = '#555555';
    const cols = 2, rows = 3;                 // 6 etiquetas por hoja
    const cellW = (doc.page.width - 56) / cols;
    const cellH = (doc.page.height - 56) / rows;

    let i = 0;
    for (const g of gabinetes) {
      const pos = i % (cols * rows);
      if (i > 0 && pos === 0) doc.addPage();
      const cx = 28 + (pos % cols) * cellW;
      const cy = 28 + Math.floor(pos / cols) * cellH;

      doc.rect(cx + 4, cy + 4, cellW - 8, cellH - 8).lineWidth(0.5).strokeColor('#cccccc').stroke();

      const png: Buffer = await QRCode.toBuffer(this.urlGabinete(g.id), {
        type: 'png', width: 400, margin: 0,
        color: { dark: '#000000ff', light: '#ffffffff' }, errorCorrectionLevel: 'M',
      });
      const qrSize = Math.min(cellW - 80, cellH - 96);
      doc.image(png, cx + (cellW - qrSize) / 2, cy + 18, { width: qrSize, height: qrSize });

      let ty = cy + 18 + qrSize + 10;
      // 20 puntos: el rótulo es lo que se busca con la vista desde lejos.
      doc.fontSize(20).fillColor(NAVY).text(g.code, cx + 8, ty, { width: cellW - 16, align: 'center' });
      ty = doc.y + 2;
      const sub = [g.name, g.referencePlace || g.location?.name].filter(Boolean).join(' · ');
      doc.fontSize(9).fillColor(GREY).text(sub, cx + 8, ty, { width: cellW - 16, align: 'center' });
      i++;
    }

    doc.end();
    const buffer = await done;
    return { buffer, filename: `etiquetas-gabinetes-${new Date().toISOString().slice(0, 10)}.pdf` };
  }
}
