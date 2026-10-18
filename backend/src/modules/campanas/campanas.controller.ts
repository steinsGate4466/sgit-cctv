import { Body, Controller, Get, Ip, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CampanasService } from './campanas.service';
import { AnotarAvanceDto, CrearCampanaDto, DecidirZonaDto, EditarCampanaDto, EditarZonaDto, RepartirZonasDto } from './dto/campanas.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequireAlguno, RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SinAmbito } from '../../common/ambito.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('campanas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('campanas')
export class CampanasController {
  constructor(private readonly campanas: CampanasService) {}

  @Get()
  @RequireAlguno('asset.read', 'wo.read')
  listar(@Res({ passthrough: true }) res: Response, @Query('estado') estado?: string, @Query('tipo') tipo?: string) {
    return this.campanas.listar(estado, tipo, res);
  }

  /** Bloque 175 · los tipos ya usados, para elegirlos con un clic. Literal ANTES que `:id`. */
  @Get('tipos')
  @RequireAlguno('asset.read', 'wo.read')
  tipos() {
    return this.campanas.tipos();
  }

  @Post()
  @RequirePermissions('asset.update')
  crear(@Body() dto: CrearCampanaDto, @CurrentUser() u: any, @Ip() ip: string) {
    return this.campanas.crear(dto, u?.userId, ip);
  }

  /** Bloque 175 · cambiar el plan o el estado (cerrar, cancelar, reabrir). */
  @SinAmbito()  // la campaña ya declara su tren; sus zonas son ubicaciones
  @Patch(':id')
  @RequirePermissions('asset.update')
  editar(@Param('id') id: string, @Body() dto: EditarCampanaDto, @CurrentUser() u: any, @Ip() ip: string) {
    return this.campanas.editar(id, dto, u?.userId, ip);
  }

  @SinAmbito()  // la campaña ya declara su tren; sus zonas son ubicaciones
  @Get(':id/avance')
  @RequireAlguno('asset.read', 'wo.read')
  avance(@Param('id') id: string) {
    return this.campanas.avance(id);
  }

  @SinAmbito()  // idem
  @Post(':id/zonas')
  @RequirePermissions('asset.update')
  repartir(@Param('id') id: string, @Body() dto: RepartirZonasDto) {
    return this.campanas.repartir(id, dto?.zonas || []);
  }

  @SinAmbito()  // la zona se identifica por su id propio
  @Get('zona/:zonaId')
  @RequireAlguno('asset.read', 'wo.read')
  revisar(@Param('zonaId') zonaId: string) {
    return this.campanas.revisarZona(zonaId);
  }

  /** Bloque 175 · el plan de una zona: quién, cuándo, cuánto. */
  @SinAmbito()  // la zona se identifica por su id propio
  @Patch('zona/:zonaId')
  @RequirePermissions('asset.update')
  editarZona(@Param('zonaId') zonaId: string, @Body() dto: EditarZonaDto, @CurrentUser() u: any, @Ip() ip: string) {
    return this.campanas.editarZona(zonaId, dto, u?.userId, ip);
  }

  /**
   * Bloque 175 · cuánto se lleva hecho (campañas que no son de mapeo). Lo anota
   * quien trabaja la zona: el técnico tiene `wo.update`, no `asset.create`.
   */
  @SinAmbito()  // idem
  @Patch('zona/:zonaId/avance')
  @RequireAlguno('asset.create', 'wo.update')
  avanceZona(@Param('zonaId') zonaId: string, @Body() dto: AnotarAvanceDto, @CurrentUser() u: any, @Ip() ip: string) {
    return this.campanas.anotarAvance(zonaId, dto?.hechos, dto?.notas, u?.userId, ip);
  }

  @SinAmbito()  // idem
  @Patch('zona/:zonaId/cargada')
  @RequireAlguno('asset.create', 'wo.update')
  cargada(@Param('zonaId') zonaId: string, @CurrentUser() u: any, @Ip() ip: string) {
    return this.campanas.marcarCargada(zonaId, u?.userId, ip);
  }

  /** Aprobar o devolver. El servicio exige que NO seas quien la cargó. */
  @SinAmbito()  // idem
  @Patch('zona/:zonaId/decidir')
  @RequirePermissions('asset.update')
  decidir(@Param('zonaId') zonaId: string, @Body() dto: DecidirZonaDto, @CurrentUser() u: any, @Ip() ip: string) {
    return this.campanas.decidirZona(zonaId, !!dto?.aprobar, dto?.observaciones, u?.userId, ip);
  }
}
