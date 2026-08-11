import { Body, Controller, Get, Ip, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ParadasService } from './paradas.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CrearParadaDto, EstadoParadaDto, LigarOrdenDto, MoverParadaDto } from './dto/parada.dto';

@ApiTags('paradas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('paradas')
export class ParadasController {
  constructor(private readonly paradas: ParadasService) {}

  // Rutas literales SIEMPRE antes que :id, o `/paradas/proximas` entra por
  // `/paradas/:id` con id="proximas" y devuelve un 404 que no se entiende.
  @Get('proximas')
  @RequirePermissions('wo.read')
  proximas(@Query('tren') tren?: string) {
    return this.paradas.proximas(tren);
  }

  @Get('fiabilidad')
  @RequirePermissions('wo.read')
  fiabilidad(@Query('dias') dias?: string) {
    return this.paradas.fiabilidad(Number(dias) > 0 ? Number(dias) : 90);
  }

  @Get()
  @RequirePermissions('wo.read')
  listar(@Query() q: any) {
    return this.paradas.listar(q || {});
  }

  @Get(':id')
  @RequirePermissions('wo.read')
  detalle(@Param('id') id: string) {
    return this.paradas.detalle(id);
  }

  /** Apuntar una parada. Cualquiera que gestione OM puede: quien se entera, apunta. */
  @Post()
  @RequirePermissions('wo.update')
  crear(@Body() dto: CrearParadaDto, @CurrentUser() u: any, @Ip() ip: string) {
    return this.paradas.crear(dto, u?.userId, ip);
  }

  @Patch(':id/mover')
  @RequirePermissions('wo.update')
  mover(@Param('id') id: string, @Body() dto: MoverParadaDto, @CurrentUser() u: any, @Ip() ip: string) {
    return this.paradas.mover(id, dto, u?.userId, ip);
  }

  @Patch(':id/estado')
  @RequirePermissions('wo.update')
  estado(@Param('id') id: string, @Body() dto: EstadoParadaDto, @CurrentUser() u: any, @Ip() ip: string) {
    return this.paradas.cambiarEstado(id, dto, u?.userId, ip);
  }

  @Post(':id/orden')
  @RequirePermissions('wo.update')
  ligar(@Param('id') id: string, @Body() dto: LigarOrdenDto, @CurrentUser() u: any, @Ip() ip: string) {
    return this.paradas.ligarOrden(id, dto.workOrderId, dto.ligar !== false, u?.userId, ip);
  }
}
