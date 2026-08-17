import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ActivosPorTrenService } from './activos-por-tren.service';
import { DeclararAccesoDto } from './dto/declarar-acceso.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SinAmbito } from '../../common/ambito.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * ACTIVOS POR TREN — bloque 41.
 *
 * =============================================================================
 *  DOS PERMISOS DISTINTOS EN UN MISMO CONTROLADOR, Y ES A PROPÓSITO
 * =============================================================================
 *  LEER la lista es `activos.mirar`. Nació usando `om.mirar` —la llave del
 *  panel de cámaras caídas— y eso era forzarlo: son dos pantallas distintas y
 *  puede haber quien deba ver el inventario de su tren sin ver las órdenes, o
 *  al revés. Un permiso por pantalla es lo que permite decir que no a una sin
 *  quitar la otra.
 *
 *  Lo que NO se hace es darle `asset.read`: eso abre el módulo de Activos con
 *  sus doce columnas y veintiocho campos, pensado para el ingeniero.
 *
 *  DECLARAR cómo se llega a un equipo es `asset.update`. No es una opinión: es
 *  un dato de la ficha técnica, queda con nombre y fecha, y de él depende que
 *  alguien suba preparado o no. Lo declara quien instaló el equipo o quien
 *  subió la última vez — no quien mira la pantalla.
 *
 *  Si fuera un solo permiso, o Producción podría reescribir fichas técnicas, o
 *  no podría ver su propio tren. Las dos cosas están mal.
 *
 * =============================================================================
 *  EL ÁMBITO LO COMPRUEBA EL SERVICIO
 * =============================================================================
 *  Va `@SinAmbito()` porque el guard genérico no sabe leer un código de tren de
 *  la ruta. El servicio sí: cruza el tren pedido contra el ámbito del usuario y
 *  devuelve vacío si no le corresponde.
 */
@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('dashboard/tren')
export class ActivosPorTrenController {
  constructor(private readonly svc: ActivosPorTrenService) {}

  /** Todo lo que hay en el tren, agrupado por dónde está montado. */
  @SinAmbito()
  @Get(':code/activos')
  @RequirePermissions('activos.mirar')
  activos(@Param('code') code: string, @CurrentUser() user: any) {
    return this.svc.porTren(code, user?.userId);
  }

  /**
   * Declarar cómo se llega a un equipo.
   *
   * Vive aquí y no en el módulo de Activos por una razón práctica: se rellena
   * DESDE esta pantalla, mirando la lista de lo que falta por declarar. Obligar
   * a abrir la ficha completa de cada activo para poner un número convertiría
   * una tarde de trabajo en tres, y lo que no se puede hacer del tirón no se
   * termina nunca.
   */
  @SinAmbito()
  @Patch('activo/:id/acceso')
  @RequirePermissions('asset.update')
  declarar(
    @Param('id') id: string,
    @Body() dto: DeclararAccesoDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.declararAcceso(id, dto, user?.userId);
  }
}
