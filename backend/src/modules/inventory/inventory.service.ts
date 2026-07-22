import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSpareDto } from './dto/create-spare.dto';
import { UpdateSpareDto } from './dto/update-spare.dto';
import { QuerySpareDto } from './dto/query-spare.dto';
import { MovementDto } from './dto/movement.dto';
import { CheckDto } from './dto/check.dto';
import { LinkAssetDto } from './dto/link-asset.dto';

const STALE_DAYS = 2; // repuesto "sin comprobar" si pasan más de N días

function flags(r: any) {
  return { ...r, lowStock: r.currentStock < r.minStock, outOfStock: r.currentStock <= 0 };
}

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateSpareDto) {
    return this.prisma.sparePart.create({
      data: {
        sapCode: dto.sapCode, name: dto.name, description: dto.description,
        category: dto.category, brand: dto.brand, model: dto.model,
        unit: dto.unit, warehouse: dto.warehouse,
        currentStock: dto.currentStock ?? 0, minStock: dto.minStock ?? 0,
      },
    });
  }

  async findAll(q: QuerySpareDto) {
    const where: any = {};
    if (q.q && q.q.trim()) {
      const t = q.q.trim();
      where.OR = [
        { name: { contains: t, mode: 'insensitive' } },
        { sapCode: { contains: t, mode: 'insensitive' } },
        { model: { contains: t, mode: 'insensitive' } },
        { category: { contains: t, mode: 'insensitive' } },
      ];
    }
    if (q.category) where.category = q.category;
    const rows = await this.prisma.sparePart.findMany({
      where, orderBy: { name: 'asc' },
      include: { _count: { select: { assets: true } } },
    });
    const data = rows.map(flags);
    return q.lowStock === 'true' ? data.filter((r) => r.lowStock) : data;
  }

  async findOne(id: string) {
    const sp = await this.prisma.sparePart.findUnique({
      where: { id },
      include: {
        assets: { include: { asset: { select: { id: true, assetCode: true, type: true, model: true, status: true } } } },
        movements: { orderBy: { createdAt: 'desc' }, take: 20, include: { user: { select: { fullName: true } } } },
        checks: { orderBy: { checkedAt: 'desc' }, take: 20, include: { user: { select: { fullName: true } } } },
      },
    });
    if (!sp) throw new NotFoundException('Repuesto no encontrado');
    return flags(sp);
  }

  async update(id: string, dto: UpdateSpareDto) {
    await this.ensure(id);
    return this.prisma.sparePart.update({ where: { id }, data: dto as any });
  }

  async remove(id: string) {
    await this.ensure(id);
    await this.prisma.sparePart.delete({ where: { id } });
    return { ok: true };
  }

  // ---------- compatibilidad repuesto <-> activo ----------
  async linkAsset(id: string, dto: LinkAssetDto) {
    await this.ensure(id);
    return this.prisma.sparePartAsset.upsert({
      where: { sparePartId_assetId: { sparePartId: id, assetId: dto.assetId } },
      update: {},
      create: { sparePartId: id, assetId: dto.assetId },
    });
  }
  async unlinkAsset(id: string, assetId: string) {
    await this.prisma.sparePartAsset.deleteMany({ where: { sparePartId: id, assetId } });
    return { ok: true };
  }

  // Repuestos compatibles con un activo: por vínculo directo O por mismo modelo.
  async sparesForAsset(assetId: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw new NotFoundException('Activo no encontrado');
    const or: any[] = [{ assets: { some: { assetId } } }];
    if (asset.model) or.push({ model: { equals: asset.model, mode: 'insensitive' } });
    const rows = await this.prisma.sparePart.findMany({ where: { OR: or }, orderBy: { name: 'asc' } });
    return rows.map(flags);
  }

  // ---------- movimientos de stock ----------
  async registerMovement(id: string, dto: MovementDto, userId?: string) {
    const sp = await this.ensure(id);
    let delta = 0;
    if (dto.type === 'INGRESO') delta = Math.abs(dto.quantity);
    else if (dto.type === 'RETIRO') delta = -Math.abs(dto.quantity);
    else delta = dto.quantity; // AJUSTE: +/-
    const newStock = sp.currentStock + delta;
    if (newStock < 0) throw new BadRequestException('El movimiento deja el stock en negativo');
    await this.prisma.stockMovement.create({
      data: {
        sparePartId: id, type: dto.type as any, quantity: Math.abs(dto.quantity),
        sapCode: dto.sapCode, reason: dto.reason, userId: userId || null,
      },
    });
    return this.prisma.sparePart.update({ where: { id }, data: { currentStock: newStock } });
  }

  // ---------- comprobación física (control diario) ----------
  async registerCheck(id: string, dto: CheckDto, userId?: string) {
    const sp = await this.ensure(id);
    await this.prisma.stockCheck.create({
      data: { sparePartId: id, countedQty: dto.countedQty, previousQty: sp.currentStock, note: dto.note, userId: userId || null },
    });
    return this.prisma.sparePart.update({ where: { id }, data: { currentStock: dto.countedQty, lastCheckedAt: new Date() } });
  }

  // ---------- dashboard de inventario ----------
  async summary() {
    const parts = await this.prisma.sparePart.findMany({
      include: { assets: { include: { asset: { select: { status: true } } } } },
    });
    const now = Date.now();
    let totalUnits = 0, shortage = 0, outOfStock = 0, stale = 0;
    const criticalList: any[] = [];
    const byCategory: Record<string, { category: string; stock: number; field: number }> = {};

    for (const p of parts) {
      totalUnits += p.currentStock;
      const low = p.currentStock < p.minStock;
      const out = p.currentStock <= 0;
      if (low) shortage++;
      if (out) outOfStock++;
      const daysSince = p.lastCheckedAt ? (now - new Date(p.lastCheckedAt).getTime()) / 86400000 : 999;
      if (daysSince > STALE_DAYS) stale++;
      const fieldCount = p.assets.filter((a: any) => a.asset.status !== 'BAJA').length;
      if (low || out) {
        criticalList.push({ id: p.id, name: p.name, sapCode: p.sapCode, currentStock: p.currentStock, minStock: p.minStock, fieldCount });
      }
      const c = p.category || 'Sin categoría';
      if (!byCategory[c]) byCategory[c] = { category: c, stock: 0, field: 0 };
      byCategory[c].stock += p.currentStock;
      byCategory[c].field += fieldCount;
    }

    return {
      totalItems: parts.length,
      totalUnits,
      shortage,
      outOfStock,
      stale,
      criticalList: criticalList.sort((a, b) => a.currentStock - b.currentStock).slice(0, 10),
      byCategory: Object.values(byCategory),
    };
  }

  private async ensure(id: string) {
    const sp = await this.prisma.sparePart.findUnique({ where: { id } });
    if (!sp) throw new NotFoundException('Repuesto no encontrado');
    return sp;
  }
}
