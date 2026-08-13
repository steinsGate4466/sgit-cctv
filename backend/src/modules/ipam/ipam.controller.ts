import { Body, Controller, Delete, Get, Ip, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IpamService } from './ipam.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SinAmbito } from '../../common/ambito.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('ipam')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('ipam')
export class IpamController {
  constructor(private readonly ipam: IpamService) {}

  @Get('subredes')
  @RequirePermissions('asset.read')
  subredes() { return this.ipam.listarSubredes(); }

  @Post('subredes')
  @RequirePermissions('asset.update')
  crear(@Body() dto: any, @CurrentUser() u: any, @Ip() ip: string) {
    return this.ipam.crearSubred(dto, u?.userId, ip);
  }

  /** Lo que está mal en el direccionamiento, por gravedad. */
  @Get('hallazgos')
  @RequirePermissions('asset.read')
  hallazgos() { return this.ipam.hallazgos(); }

  @Get('buscar')
  @RequirePermissions('asset.read')
  buscar(@Query('q') q: string) { return this.ipam.buscar(q); }

  @SinAmbito()  // una subred es de la red, no de un tren concreto
  @Get('subredes/:id/mapa')
  @RequirePermissions('asset.read')
  mapa(@Param('id') id: string) { return this.ipam.mapa(id); }

  /** «¿Qué IP le pongo?» — la razón de ser del módulo. */
  @SinAmbito()  // idem
  @Get('subredes/:id/libres')
  @RequirePermissions('asset.read')
  libres(@Param('id') id: string, @Query('n') n?: string) {
    return this.ipam.siguienteLibre(id, Number(n) > 0 ? Number(n) : 5);
  }

  @Post('reservas')
  @RequirePermissions('asset.update')
  reservar(@Body() dto: any, @CurrentUser() u: any, @Ip() ip: string) {
    return this.ipam.reservar(dto, u?.userId, ip);
  }

  @SinAmbito()  // la reserva se identifica por su id propio
  @Delete('reservas/:id')
  @RequirePermissions('asset.update')
  liberar(@Param('id') id: string, @CurrentUser() u: any, @Ip() ip: string) {
    return this.ipam.liberar(id, u?.userId, ip);
  }
}
