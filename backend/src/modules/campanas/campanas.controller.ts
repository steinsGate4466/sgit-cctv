import { Body, Controller, Get, Ip, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CampanasService } from './campanas.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SinAmbito } from '../../common/ambito.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('campanas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('campanas')
export class CampanasController {
  constructor(private readonly campanas: CampanasService) {}

  @Get()
  @RequirePermissions('asset.read')
  listar(@Query('estado') estado?: string) {
    return this.campanas.listar(estado);
  }

  @Post()
  @RequirePermissions('asset.update')
  crear(@Body() dto: any, @CurrentUser() u: any, @Ip() ip: string) {
    return this.campanas.crear(dto, u?.userId, ip);
  }

  @SinAmbito()  // la campaña ya declara su tren; sus zonas son ubicaciones
  @Get(':id/avance')
  @RequirePermissions('asset.read')
  avance(@Param('id') id: string) {
    return this.campanas.avance(id);
  }

  @SinAmbito()  // idem
  @Post(':id/zonas')
  @RequirePermissions('asset.update')
  repartir(@Param('id') id: string, @Body() dto: any) {
    return this.campanas.repartir(id, dto?.zonas || []);
  }

  @SinAmbito()  // la zona se identifica por su id propio
  @Get('zona/:zonaId')
  @RequirePermissions('asset.read')
  revisar(@Param('zonaId') zonaId: string) {
    return this.campanas.revisarZona(zonaId);
  }

  @SinAmbito()  // idem
  @Patch('zona/:zonaId/cargada')
  @RequirePermissions('asset.create')
  cargada(@Param('zonaId') zonaId: string, @CurrentUser() u: any, @Ip() ip: string) {
    return this.campanas.marcarCargada(zonaId, u?.userId, ip);
  }

  /** Aprobar o devolver. El servicio exige que NO seas quien la cargó. */
  @SinAmbito()  // idem
  @Patch('zona/:zonaId/decidir')
  @RequirePermissions('asset.update')
  decidir(@Param('zonaId') zonaId: string, @Body() dto: any, @CurrentUser() u: any, @Ip() ip: string) {
    return this.campanas.decidirZona(zonaId, !!dto?.aprobar, dto?.observaciones, u?.userId, ip);
  }
}
