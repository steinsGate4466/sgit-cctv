import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GrabadoresService } from './grabadores.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SinAmbito } from '../../common/ambito.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { EnlazarCamaraDto } from './dto/enlazar-camara.dto';

@ApiTags('grabadores')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('grabadores')
export class GrabadoresController {
  constructor(private readonly grabadores: GrabadoresService) {}

  @Get()
  @RequirePermissions('red.read')
  lista(@CurrentUser() user: any, @Query('tren') tren?: string) {
    return this.grabadores.lista(user?.userId, tren);
  }

  /**
   * 'traducir' va ANTES de ':id'. Si no, Nest interpretaría "traducir" como
   * el id de un grabador y devolvería 404. Es el mismo orden que en el
   * controlador de red y por el mismo motivo.
   */
  @Get('traducir')
  @RequirePermissions('red.read')
  traducir(@CurrentUser() user: any, @Query('q') q: string) {
    return this.grabadores.traducir(user?.userId, q || '');
  }

  @SinAmbito()  // grabadores: el ámbito se aplica en el servicio
  @Get(':id/rejilla')
  @RequirePermissions('red.read')
  rejilla(@Param('id') id: string) {
    return this.grabadores.rejilla(id);
  }

  @SinAmbito()  // grabadores: el ámbito se aplica en el servicio
  @Get(':id/candidatas')
  @RequirePermissions('red.read')
  candidatas(@Param('id') id: string, @Query('q') q?: string) {
    return this.grabadores.candidatas(id, q);
  }

  @SinAmbito()  // grabadores: el ámbito se aplica en el servicio
  @Post(':id/enlazar')
  @RequirePermissions('asset.update')
  enlazar(@Param('id') id: string, @Body() dto: EnlazarCamaraDto) {
    return this.grabadores.enlazar(id, dto);
  }

  @SinAmbito()  // grabadores: el ámbito se aplica en el servicio
  @Delete(':id/camaras/:assetId')
  @RequirePermissions('asset.update')
  desenlazar(@Param('id') id: string, @Param('assetId') assetId: string) {
    return this.grabadores.desenlazar(id, assetId);
  }
}
