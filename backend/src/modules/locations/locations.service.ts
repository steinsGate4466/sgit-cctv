import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateLocationDto, UpdateLocationDto } from './dto/location.dto';
import { exigirPadreValido, haceCirculo } from '../../common/jerarquia-ubicaciones';

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
      if (!parent) throw new BadRequestException('La ubicación padre no existe.');
      exigirPadreValido(dto.type, parent.type); // bloque 172
      path = `${parent.path}/${dto.code}`;
    }
    return this.prisma.location.create({
      data: {
        code: dto.code, name: dto.name, type: dto.type,
        parentId: dto.parentId || undefined, responsibleArea: dto.responsibleArea, path,
        // Bloque 168: cómo llegar, sigla del tren y ambiente puntual.
        howToGet: dto.howToGet?.trim() || undefined,
        siglaTren: dto.type === 'TREN' ? dto.siglaTren || undefined : undefined,
        environment: dto.environment || undefined,
        // Bloque 180: la ubicación técnica de SAP, como la escribe SAP (mayúsculas).
        sapLocationCode: (dto.sapLocationCode || '').trim().toUpperCase() || undefined,
      },
    });
  }

  async update(id: string, dto: UpdateLocationDto) {
    const exists = await this.prisma.location.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Ubicación no encontrada');
    /* Bloque 172 · el padre nuevo: de nivel mayor y sin círculo. '' = raíz. */
    let parentId: string | null | undefined = dto.parentId === undefined ? undefined : (dto.parentId || null);
    if (parentId) {
      const todos = await this.prisma.location.findMany({ select: { id: true, parentId: true, type: true } });
      const padre = todos.find((t) => t.id === parentId);
      if (!padre) throw new BadRequestException('La ubicación padre no existe.');
      exigirPadreValido(exists.type, padre.type);
      if (haceCirculo(id, parentId, new Map(todos.map((t) => [t.id, t.parentId])))) {
        throw new BadRequestException('No puede colgar de sí misma ni de algo que cuelga de ella.');
      }
    }
    return this.prisma.location.update({
      where: { id },
      data: {
        name: dto.name, parentId, responsibleArea: dto.responsibleArea,
        // Bloque 168. '' borra el dato (vuelve a «no declarado»); ausente no lo toca.
        ...(dto.howToGet !== undefined ? { howToGet: dto.howToGet.trim() || null } : {}),
        ...(dto.siglaTren !== undefined && exists.type === 'TREN' ? { siglaTren: dto.siglaTren || null } : {}),
        ...(dto.environment !== undefined ? { environment: dto.environment || null } : {}),
        ...(dto.sapLocationCode !== undefined ? { sapLocationCode: dto.sapLocationCode.trim().toUpperCase() || null } : {}),
      },
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
