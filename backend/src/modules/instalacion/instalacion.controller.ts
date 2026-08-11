import { Body, Controller, Get, Ip, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InstalacionService } from './instalacion.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  CrearInstalacionDto, DecidirInstalacionDto, EvaluarInstalacionDto, InstaladaDto,
} from './dto/instalacion.dto';

@ApiTags('instalaciones')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('instalaciones')
export class InstalacionController {
  constructor(private readonly inst: InstalacionService) {}

  // Literales antes que :id.
  @Get('perfiles')
  @RequirePermissions('asset.read')
  perfiles() {
    return this.inst.perfiles();
  }

  @Get('resumen')
  @RequirePermissions('asset.read')
  resumen() {
    return this.inst.resumen();
  }

  @Get()
  @RequirePermissions('asset.read')
  listar(@Query() q: any) {
    return this.inst.listar(q || {});
  }

  @Get(':id')
  @RequirePermissions('asset.read')
  detalle(@Param('id') id: string) {
    return this.inst.detalle(id);
  }

  /** Pedir. Con `asset.read` basta: quien ve la infraestructura puede pedir una cámara. */
  @Post()
  @RequirePermissions('asset.read')
  crear(@Body() dto: CrearInstalacionDto, @CurrentUser() u: any, @Ip() ip: string) {
    return this.inst.crear(dto, u?.userId, ip);
  }

  /** Guardar la visita. Lo hace quien va al sitio. */
  @Patch(':id/evaluar')
  @RequirePermissions('asset.update')
  evaluar(@Param('id') id: string, @Body() dto: EvaluarInstalacionDto, @CurrentUser() u: any, @Ip() ip: string) {
    return this.inst.evaluar(id, dto, u?.userId, ip);
  }

  /** Aprobar o rechazar: del Jefe, como el cierre de OM. */
  @Patch(':id/decidir')
  @RequirePermissions('wo.approve')
  decidir(@Param('id') id: string, @Body() dto: DecidirInstalacionDto, @CurrentUser() u: any, @Ip() ip: string) {
    return this.inst.decidir(id, dto, u?.userId, ip);
  }

  @Post(':id/orden')
  @RequirePermissions('wo.create')
  generarOrden(@Param('id') id: string, @CurrentUser() u: any, @Ip() ip: string) {
    return this.inst.generarOrden(id, u?.userId, ip);
  }

  /** Cerrar el ciclo: nace el activo. Exige poder crear activos. */
  @Post(':id/instalada')
  @RequirePermissions('asset.create')
  instalada(@Param('id') id: string, @Body() dto: InstaladaDto, @CurrentUser() u: any, @Ip() ip: string) {
    return this.inst.marcarInstalada(id, dto, u?.userId, ip);
  }

  @Patch(':id/cancelar')
  @RequirePermissions('asset.update')
  cancelar(@Param('id') id: string, @Body() dto: DecidirInstalacionDto, @CurrentUser() u: any, @Ip() ip: string) {
    return this.inst.cancelar(id, dto.motivo || '', u?.userId, ip);
  }
}
