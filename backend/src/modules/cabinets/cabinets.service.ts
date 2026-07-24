import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
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

  async list() {
    const cabs = await this.prisma.cabinet.findMany({
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
    const ext = (file.originalname?.split('.').pop() || 'jpg').toLowerCase();
    const objectName = `cabinet/${id}/${Date.now()}-${randomUUID()}.${ext}`;
    await this.storage.put(objectName, file.buffer, file.mimetype || 'image/jpeg');
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
