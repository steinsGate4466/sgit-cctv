import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { QueryAssetDto } from './dto/query-asset.dto';

@Injectable()
export class AssetsService {
  constructor(private prisma: PrismaService) {}

  create(dto: CreateAssetDto) {
    return this.prisma.asset.create({ data: dto });
  }

  findAll(q: QueryAssetDto) {
    return this.prisma.asset.findMany({
      where: {
        deletedAt: null,
        type: q.type,
        status: q.status,
        locationId: q.locationId,
        ...(q.search
          ? { OR: [{ assetCode: { contains: q.search, mode: 'insensitive' } }, { model: { contains: q.search, mode: 'insensitive' } }] }
          : {}),
      },
      include: { location: true },
      orderBy: { assetCode: 'asc' },
    });
  }

  async findOne(id: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id },
      include: { location: true, camera: true, nvr: true, switchDev: true, wireless: true },
    });
    if (!asset || asset.deletedAt) throw new NotFoundException('Activo no encontrado');
    return asset;
  }

  update(id: string, dto: UpdateAssetDto) {
    return this.prisma.asset.update({ where: { id }, data: dto });
  }

  remove(id: string) {
    // Soft delete (baja lógica, preserva trazabilidad)
    return this.prisma.asset.update({ where: { id }, data: { deletedAt: new Date(), status: 'BAJA' } });
  }
}
