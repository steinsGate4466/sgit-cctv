import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { NetworkService } from './network.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SinAmbito } from '../../common/ambito.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('red')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('network')
export class NetworkController {
  constructor(private readonly red: NetworkService) {}

  /** Ranking de puntos críticos. 'criticos' antes que ':id': lo específico primero. */
  @Get('criticos')
  @RequirePermissions('asset.read')
  criticos(@CurrentUser() user: any, @Query('tren') tren?: string) {
    return this.red.puntosCriticos(user?.userId, tren);
  }

  /** El mapa para dibujar. 'mapa' antes de ':assetId', como siempre. */
  @Get('mapa')
  @RequirePermissions('asset.read')
  mapa(@CurrentUser() user: any, @Query('tren') tren?: string) {
    return this.red.mapa(user?.userId, tren);
  }

  /**
   * De qué depende cada cámara, en castellano de planta (bloque 47).
   *
   * Va con `om.mirar` y no con `asset.update` a propósito: es una pantalla
   * de CONSULTA para Producción, que no toca la red y no debería necesitar
   * un permiso de operación para entender por qué se quedó sin ver.
   */
  @Get('dependencias')
  @RequirePermissions('om.mirar')
  dependencias(@CurrentUser() user: any, @Query('tren') tren?: string) {
    return this.red.dependencias(user?.userId, tren);
  }

  /** El camino de UNA cámara hasta el grabador. 'cadena' antes que ':id'. */
  @SinAmbito()  // red: el ámbito se aplica en el servicio
  @Get('cadena/:assetId')
  @RequirePermissions('om.mirar')
  cadena(@Param('assetId') assetId: string) {
    return this.red.cadena(assetId);
  }

  @SinAmbito()  // red: el ámbito se aplica en el servicio
  @Get('impacto/:assetId')
  @RequirePermissions('asset.read')
  impacto(@Param('assetId') assetId: string) {
    return this.red.impacto(assetId);
  }

  @Post('enlaces')
  @RequirePermissions('asset.update')
  crear(@Body() dto: any) {
    return this.red.crearEnlace(dto);
  }

  @SinAmbito()  // red: el ámbito se aplica en el servicio
  @Delete('enlaces/:id')
  @RequirePermissions('asset.update')
  borrar(@Param('id') id: string) {
    return this.red.borrarEnlace(id);
  }
}
