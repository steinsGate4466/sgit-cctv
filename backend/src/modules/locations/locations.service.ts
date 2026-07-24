import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateLocationDto, UpdateLocationDto } from './dto/location.dto';

@Injectable()
export class LocationsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.location.findMany({
      orderBy: { path: 'asc' },
      include: { parent: { select: { name: true } }, _count: { select: { assets: true } } },
    });
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
