import { Controller, ForbiddenException, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { RequireAlguno } from '../../common/decorators/permissions.decorator';
import { SinAmbito } from '../../common/ambito.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { filtroConAmbito } from '../../common/ambito-usuario';
import { perfilDeSeguridadEn } from '../../common/seguridad-de-planta';

/**
 * LA SEGURIDAD DEL TRABAJO, PARA RELLENAR LOS FORMULARIOS — bloque 168.
 * Ver `common/seguridad-del-trabajo.ts`. Sólo LEE: lo que se marca se guarda
 * en cada formulario (abrir la OM, pedir acceso, inspección de grúa).
 *
 * El ámbito se comprueba aquí contra la ubicación (rutas @SinAmbito): un jefe
 * de tren ve la seguridad de su tren, no la del resto.
 */
const QUIEN = ['asset.read', 'activos.mirar', 'wo.read', 'om.mirar', 'access.read', 'access.request', 'incident.read'];

@ApiTags('seguridad')
@ApiBearerAuth()
@Controller('seguridad')
export class SeguridadController {
  constructor(private readonly prisma: PrismaService) {}

  private async enSuAmbito(userId: string | null, locationId: string | null) {
    if (!locationId) return;
    const ambito = await filtroConAmbito(this.prisma, userId, {});
    if (ambito && !ambito.in.includes(locationId)) throw new ForbiddenException('Ese equipo no es de tu zona.');
  }

  @SinAmbito()
  @Get('activo/:id')
  @RequireAlguno(...QUIEN)
  async activo(@Param('id') id: string, @CurrentUser() u: any) {
    const a = await this.prisma.asset.findUnique({ where: { id }, select: { id: true, locationId: true } });
    if (!a) throw new NotFoundException('Ese equipo no existe.');
    await this.enSuAmbito(u?.userId ?? null, a.locationId);
    return perfilDeSeguridadEn(this.prisma, { assetId: a.id, locationId: a.locationId });
  }

  @SinAmbito()
  @Get('orden/:id')
  @RequireAlguno(...QUIEN)
  async orden(@Param('id') id: string, @CurrentUser() u: any) {
    const wo = await this.prisma.workOrder.findUnique({
      where: { id }, select: { assetId: true, locationId: true, asset: { select: { locationId: true } } },
    });
    if (!wo) throw new NotFoundException('Esa orden no existe.');
    await this.enSuAmbito(u?.userId ?? null, wo.asset?.locationId ?? wo.locationId);
    return perfilDeSeguridadEn(this.prisma, { assetId: wo.assetId, locationId: wo.locationId });
  }

  @SinAmbito()
  @Get('ubicacion/:id')
  @RequireAlguno(...QUIEN)
  async ubicacion(@Param('id') id: string, @CurrentUser() u: any) {
    const l = await this.prisma.location.findUnique({ where: { id }, select: { id: true } });
    if (!l) throw new NotFoundException('Esa ubicación no existe.');
    await this.enSuAmbito(u?.userId ?? null, l.id);
    return perfilDeSeguridadEn(this.prisma, { locationId: l.id });
  }
}
