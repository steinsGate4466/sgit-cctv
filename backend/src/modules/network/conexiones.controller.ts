import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConexionesService } from './conexiones.service';
import { NetworkService } from './network.service';
import { CapacidadService } from './capacidad.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions, RequireAlguno } from '../../common/decorators/permissions.decorator';
import { SinAmbito } from '../../common/ambito.decorator';
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
    private readonly capacidad: CapacidadService,
  ) {}

  /* =========================================================================
     BLOQUE 122 · CAPACIDAD DE RED
     -------------------------------------------------------------------------
     Contesta «¿hay sitio para cuatro cámaras más en el gabinete 1262?» antes
     de que alguien lo prometa. El dato estaba entero en `SwitchPort` desde
     hace meses y nadie lo preguntaba.

     `red.read` O `infra.read` O `asset.read`: no es sólo de TI. **Quien decide
     con este informe es MANTENIMIENTO** —es quien contesta si se puede hacer
     la instalación—, así que la llave de activos también lo abre. No lleva ni
     una credencial ni una IP: son cuentas de puertos.

     El recorte por tren lo pone el servicio con `filtroConAmbito`.
  ========================================================================= */
  @SinAmbito()
  @Get('capacidad')
  @RequireAlguno('red.read', 'infra.read', 'asset.read')
  capacidadDeRed(
    @Query('tren') tren: string,
    @Query('etapa') etapa: string,
    @CurrentUser() user: any,
  ) {
    return this.capacidad.resumen({ tren: tren ?? null, etapa: etapa ?? null }, user?.userId);
  }

  @SinAmbito()
  @Get('parque')
  @RequireAlguno('red.read', 'infra.read', 'asset.read')
  parqueInstalado(
    @Query('tren') tren: string,
    @Query('etapa') etapa: string,
    @CurrentUser() user: any,
  ) {
    return this.capacidad.parque({ tren: tren ?? null, etapa: etapa ?? null }, user?.userId);
  }

  @Get('switches')
  @RequirePermissions('red.read')
  switches(@CurrentUser() user: any, @Query('tren') tren?: string) {
    return this.conexiones.switches(user?.userId, tren);
  }

  @Get('enlaces')
  @RequirePermissions('red.read')
  enlaces(@CurrentUser() user: any, @Query('tren') tren?: string) {
    return this.conexiones.enlaces(user?.userId, tren);
  }

  @Get('candidatos')
  @RequirePermissions('red.read')
  candidatos(@Query('q') q?: string) {
    return this.conexiones.candidatos(q);
  }

  @Post('puertos')
  @RequirePermissions('asset.update')
  guardarPuerto(@Body() dto: GuardarPuertoDto) {
    return this.conexiones.guardarPuerto(dto);
  }

  @SinAmbito()  // conexiones: el ámbito se aplica en el servicio
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

  @SinAmbito()  // conexiones: el ámbito se aplica en el servicio
  @Delete('enlaces/:id')
  @RequirePermissions('asset.update')
  borrarEnlace(@Param('id') id: string) {
    return this.red.borrarEnlace(id);
  }
}
