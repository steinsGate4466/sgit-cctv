import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EquiposService } from './equipos.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CrearEquipoDto, EditarEquipoDto } from './dto/equipo.dto';

/**
 * Se apoya en los permisos de activos (`asset.read` / `asset.update`) en vez de
 * inventar unos nuevos: esto ES inventario de infraestructura, y lo mantiene la
 * misma persona. Un permiso nuevo obliga a una migración y a que alguien se
 * acuerde de asignarlo — y el día que se olvide, la pantalla no la ve nadie.
 */
@ApiTags('equipos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('equipos')
export class EquiposController {
  constructor(private readonly equipos: EquiposService) {}

  @Get('sin-registrar')
  @RequirePermissions('asset.read')
  sinRegistrar(@Query('dias') dias?: string) {
    return this.equipos.ipsSinRegistrar(Number(dias) > 0 ? Number(dias) : 30);
  }

  @Get()
  @RequirePermissions('asset.read')
  listar(@Query('q') q?: string) {
    return this.equipos.listar(q);
  }

  @Post()
  @RequirePermissions('asset.update')
  crear(@Body() dto: CrearEquipoDto) {
    return this.equipos.crear(dto);
  }

  @Patch(':id')
  @RequirePermissions('asset.update')
  editar(@Param('id') id: string, @Body() dto: EditarEquipoDto) {
    return this.equipos.editar(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('asset.update')
  borrar(@Param('id') id: string) {
    return this.equipos.borrar(id);
  }
}
