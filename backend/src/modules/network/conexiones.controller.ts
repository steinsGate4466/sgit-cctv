import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConexionesService } from './conexiones.service';
import { NetworkService } from './network.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GuardarPuertoDto, CrearEnlaceDto } from './dto/conexiones.dto';

@ApiTags('conexiones')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('conexiones')
export class ConexionesController {
  constructor(
    private readonly conexiones: ConexionesService,
    private readonly red: NetworkService,
  ) {}

  @Get('switches')
  @RequirePermissions('asset.read')
  switches(@CurrentUser() user: any, @Query('tren') tren?: string) {
    return this.conexiones.switches(user?.userId, tren);
  }

  @Get('enlaces')
  @RequirePermissions('asset.read')
  enlaces(@CurrentUser() user: any, @Query('tren') tren?: string) {
    return this.conexiones.enlaces(user?.userId, tren);
  }

  @Get('candidatos')
  @RequirePermissions('asset.read')
  candidatos(@Query('q') q?: string) {
    return this.conexiones.candidatos(q);
  }

  @Post('puertos')
  @RequirePermissions('asset.update')
  guardarPuerto(@Body() dto: GuardarPuertoDto) {
    return this.conexiones.guardarPuerto(dto);
  }

  @Delete('puertos/:id')
  @RequirePermissions('asset.update')
  vaciarPuerto(@Param('id') id: string) {
    return this.conexiones.vaciarPuerto(id);
  }

  /**
   * El alta y baja de enlaces ya vivía en NetworkService y estaba probada.
   * Se reutiliza en vez de duplicarla: dos altas del mismo concepto acaban
   * divergiendo, y la segunda siempre es la que se olvida de validar.
   */
  @Post('enlaces')
  @RequirePermissions('asset.update')
  crearEnlace(@Body() dto: CrearEnlaceDto) {
    return this.red.crearEnlace(dto);
  }

  @Delete('enlaces/:id')
  @RequirePermissions('asset.update')
  borrarEnlace(@Param('id') id: string) {
    return this.red.borrarEnlace(id);
  }
}
