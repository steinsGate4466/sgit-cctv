import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { revisarImagen } from '../../common/archivos-seguros';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { filtroDeUbicaciones } from '../../common/ambito-planta';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { CreateCabinetDto, UpdateCabinetDto } from './dto/cabinet.dto';

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
}
