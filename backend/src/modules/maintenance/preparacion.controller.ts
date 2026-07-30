import { Body, Controller, Delete, Get, Ip, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PreparacionService } from './preparacion.service';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * Preparación de la orden: herramientas, materiales y reemplazo de equipo.
 *
 * Es lo que evita el viaje perdido: el técnico confirma qué lleva ANTES de
 * salir, y el Jefe de Mantenimiento ve el resultado.
 */
@ApiTags('work-orders')
@ApiBearerAuth()
@Controller('work-orders/:id')
export class PreparacionController {
  constructor(private readonly prep: PreparacionService) {}

  // ---- Herramientas ----

  /** Herramientas sugeridas para el tipo de orden + lo ya declarado. */
  @Get('tools')
  @RequirePermissions('wo.read')
  herramientas(@Param('id') id: string) {
    return this.prep.herramientasSugeridas(id);
  }

  /**
   * Verificación al abrir. Permiso wo.update: la hace el técnico, no el Jefe.
   * El Jefe la LEE con wo.read.
   */
  @Post('tools')
  @RequirePermissions('wo.update')
  registrarHerramientas(
    @Param('id') id: string,
    @Body() body: { items: { toolId: string; carried: boolean; note?: string }[] },
    @CurrentUser() user: any,
    @Ip() ip: string,
  ) {
    return this.prep.registrarHerramientas(id, body?.items || [], user?.userId, ip);
  }

  // ---- Materiales ----

  @Get('materials')
  @RequirePermissions('wo.read')
  materiales(@Param('id') id: string) {
    return this.prep.materiales(id);
  }

  @Post('materials')
  @RequirePermissions('wo.update')
  agregarMaterial(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() user: any,
    @Ip() ip: string,
  ) {
    return this.prep.agregarMaterial(id, body, user?.userId, ip);
  }

  @Patch('materials/:materialId')
  @RequirePermissions('wo.update')
  actualizarMaterial(@Param('materialId') materialId: string, @Body() body: any) {
    return this.prep.actualizarMaterial(materialId, body);
  }

  @Delete('materials/:materialId')
  @RequirePermissions('wo.update')
  quitarMaterial(@Param('materialId') materialId: string) {
    return this.prep.quitarMaterial(materialId);
  }

  // ---- Reemplazo de equipo ----

  /** Equipos en almacén disponibles para reemplazo. */
  @Get('stock-assets')
  @RequirePermissions('wo.read')
  disponibles(@Param('id') _id: string, @Query('type') type?: string) {
    return this.prep.disponiblesEnAlmacen(type);
  }

  @Get('swaps')
  @RequirePermissions('wo.read')
  reemplazos(@Param('id') id: string) {
    return this.prep.reemplazos(id);
  }

  @Post('swaps')
  @RequirePermissions('wo.update')
  registrarReemplazo(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() user: any,
    @Ip() ip: string,
  ) {
    return this.prep.registrarReemplazo(id, body, user?.userId, ip);
  }
}
