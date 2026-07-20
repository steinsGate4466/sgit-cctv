import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LocationsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.location.findMany({ orderBy: { path: 'asc' } });
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
