import { Body, Controller, Delete, Get, Ip, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CatalogosService } from './catalogos.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequireAlguno, RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SinAmbito } from '../../common/ambito.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ActualizarCatalogoDto, CrearCatalogoDto } from './dto/catalogos.dto';

/**
 * Catálogos editables del sistema.
 *
 * LEER lo puede hacer cualquiera que trabaje con órdenes: el técnico necesita
 * la lista para elegir. EDITAR pide 'location.manage', el mismo permiso que el
 * catálogo de etapas del proceso: son la misma clase de decisión, cómo se
 * llaman las cosas en esta planta.
 */
/* QUIÉN LEE LOS CATÁLOGOS — bloque 171.
   Pedía `wo.read`. El Jefe de Tren y el de línea ven las órdenes con `om.mirar`
   (sin `wo.read`): al abrir Órdenes recibían dos 403 y el aviso «no tienes
   permiso» encima de una pantalla que SÍ es suya. Lo cazó el barrido por roles.
   Un catálogo es vocabulario de planta, no un dato sensible: lo lee quien
   trabaja con órdenes o con incidencias. Editar sigue pidiendo location.manage. */
const LEEN_CATALOGOS = ['wo.read', 'om.mirar', 'incident.read'];

@ApiTags('catalogos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('catalogos')
export class CatalogosController {
  constructor(private readonly cat: CatalogosService) {}

  /** Todos los tipos a la vez. Va ANTES de ':kind' para que no lo capture. */
  @Get('todos')
  @RequireAlguno(...LEEN_CATALOGOS)
  todos() {
    return this.cat.todos();
  }

  @SinAmbito()  // catálogos de planta: son globales, no de un tren
  @Get(':kind')
  @RequireAlguno(...LEEN_CATALOGOS)
  listar(@Param('kind') kind: string, @Query('todas') todas?: string) {
    return this.cat.listar(kind.toUpperCase(), todas === 'true');
  }

  @Post()
  @RequirePermissions('location.manage')
  crear(@Body() body: CrearCatalogoDto, @CurrentUser() user: any, @Ip() ip: string) {
    return this.cat.crear(body, user?.userId, ip);
  }

  @SinAmbito()  // catálogos de planta: son globales, no de un tren
  @Patch(':id')
  @RequirePermissions('location.manage')
  actualizar(@Param('id') id: string, @Body() body: ActualizarCatalogoDto, @CurrentUser() user: any, @Ip() ip: string) {
    return this.cat.actualizar(id, body, user?.userId, ip);
  }

  /** Desactiva. Nunca borra: el histórico tiene que seguir leyéndose. */
  @SinAmbito()  // catálogos de planta: son globales, no de un tren
  @Delete(':id')
  @RequirePermissions('location.manage')
  desactivar(@Param('id') id: string, @CurrentUser() user: any, @Ip() ip: string) {
    return this.cat.desactivar(id, user?.userId, ip);
  }
}
