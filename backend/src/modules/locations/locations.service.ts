import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateLocationDto, UpdateLocationDto } from './dto/location.dto';

@Injectable()
export class LocationsService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  async findAll() {
    const rows = await this.prisma.location.findMany({
      orderBy: { path: 'asc' },
      include: { parent: { select: { name: true } }, _count: { select: { assets: true } } },
    });
    return rows.map((l: any) => ({ ...l, hasPhoto: !!l.photoFileId }));
  }

  async uploadPhoto(id: string, file: any) {
    const loc = await this.prisma.location.findUnique({ where: { id } });
    if (!loc) throw new NotFoundException('Ubicación no encontrada');
    if (!file || !file.buffer) throw new BadRequestException('Imagen requerida');
    const ext = (file.originalname?.split('.').pop() || 'jpg').toLowerCase();
    const objectName = `location/${id}/${Date.now()}-${randomUUID()}.${ext}`;
    await this.storage.put(objectName, file.buffer, file.mimetype || 'image/jpeg');
    return this.prisma.location.update({ where: { id }, data: { photoFileId: objectName } });
  }

  async getPhoto(id: string): Promise<{ buffer: Buffer; contentType: string }> {
    const loc = await this.prisma.location.findUnique({ where: { id } });
    if (!loc || !loc.photoFileId) throw new NotFoundException('La ubicación no tiene foto');
    const buffer = await this.storage.getBuffer(loc.photoFileId);
    const ext = loc.photoFileId.split('.').pop()?.toLowerCase();
    return { buffer, contentType: ext === 'png' ? 'image/png' : 'image/jpeg' };
  }

  async create(dto: CreateLocationDto) {
    let path = dto.code;
    if (dto.parentId) {
      const parent = await this.prisma.location.findUnique({ where: { id: dto.parentId } });
      if (parent) path = `${parent.path}/${dto.code}`;
    }
    return this.prisma.location.create({
      data: {
        code: dto.code, name: dto.name, type: dto.type,
        parentId: dto.parentId || undefined, responsibleArea: dto.responsibleArea, path,
      },
    });
  }

  async update(id: string, dto: UpdateLocationDto) {
    const exists = await this.prisma.location.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Ubicación no encontrada');
    return this.prisma.location.update({
      where: { id },
      data: { name: dto.name, parentId: dto.parentId, responsibleArea: dto.responsibleArea },
    });
  }

  // Árbol jerárquico completo (Planta > Tren > Área > ...)
  async tree() {
    const all = await this.prisma.location.findMany();
    const byParent = new Map<string | null, any[]>();
    for (const loc of all) {
      const key = loc.parentId ?? null;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push({ ...loc, children: [] });
    }
    const build = (parentId: string | null): any[] =>
      (byParent.get(parentId) ?? []).map((n) => ({ ...n, children: build(n.id) }));
    return build(null);
  }
}
