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

  // ---- Retiro de almacén (3D) ----

  /**
   * El ingeniero firma y sale TODO lo solicitado de una vez.
   *
   * Pide 'inventory.manage' y no 'wo.update' a propósito: quien autoriza la
   * salida de almacén no es el mismo que ejecuta el trabajo. El técnico pide;
   * el ingeniero descuenta stock. Separar esos dos permisos ES el control.
   */
  @Post('materials/retiro')
  @RequirePermissions('inventory.manage')
  generarRetiro(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() user: any,
    @Ip() ip: string,
  ) {
    return this.prep.generarRetiro(id, body || {}, user?.userId, ip);
  }

  /** No se autoriza una línea. El motivo es obligatorio. */
  @Post('materials/:materialId/rechazar')
  @RequirePermissions('inventory.manage')
  rechazarMaterial(
    @Param('materialId') materialId: string,
    @Body() body: { motivo?: string },
    @CurrentUser() user: any,
    @Ip() ip: string,
  ) {
    return this.prep.rechazarMaterial(materialId, body?.motivo || '', user?.userId, ip);
  }

  /**
   * Devuelve al almacén lo retirado y no usado.
   *
   * Aquí sí basta 'wo.update': devolver material NO es una operación de riesgo
   * —solo puede aumentar el stock— y exigir al ingeniero para cerrar el ciclo
   * garantizaría que nadie lo hace y que el almacén quede mintiendo.
   */
  @Post('materials/devolucion')
  @RequirePermissions('wo.update')
  devolver(@Param('id') id: string, @CurrentUser() user: any, @Ip() ip: string) {
    return this.prep.devolverSobrante(id, user?.userId, ip);
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
