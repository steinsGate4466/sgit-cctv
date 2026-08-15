import { Body, Controller, Delete, Get, Ip, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ElectricidadService } from './electricidad.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AmbitoDe, SinAmbito } from '../../common/ambito.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('electricidad')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('electricidad')
export class ElectricidadController {
  constructor(private readonly e: ElectricidadService) {}

  @Get('resumen')
  @RequirePermissions('asset.read')
  resumen() { return this.e.resumen(); }

  @Get('tableros')
  @RequirePermissions('asset.read')
  tableros(@Query() q: any) { return this.e.listarTableros(q || {}); }

  @Post('tableros')
  @RequirePermissions('asset.create')
  crearTablero(@Body() dto: any, @CurrentUser() u: any, @Ip() ip: string) {
    return this.e.crearTablero(dto, u?.userId, ip);
  }

  @SinAmbito()  // el tablero declara su tren; el ámbito se aplica al listar
  @Get('tableros/:id')
  @RequirePermissions('asset.read')
  tablero(@Param('id') id: string) { return this.e.detalleTablero(id); }

  @SinAmbito()  // idem
  @Patch('tableros/:id')
  @RequirePermissions('asset.update')
  editarTablero(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any, @Ip() ip: string) {
    return this.e.editarTablero(id, dto, u?.userId, ip);
  }

  @SinAmbito()  // idem
  @Post('tableros/:id/circuitos')
  @RequirePermissions('asset.update')
  crearCircuito(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any, @Ip() ip: string) {
    return this.e.crearCircuito(id, dto, u?.userId, ip);
  }

  @SinAmbito()  // el circuito cuelga de su tablero
  @Patch('circuitos/:id')
  @RequirePermissions('asset.update')
  editarCircuito(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any, @Ip() ip: string) {
    return this.e.editarCircuito(id, dto, u?.userId, ip);
  }

  /* El impacto del TABLERO entero, no de un circuito. Contesta la pregunta de
     las tres de la mañana: «se fue el TAB-T2-MCC-01, ¿qué acabo de perder?».
     Arrastra los tableros aguas abajo y la cascada de red. */
  @SinAmbito()  // el tablero declara su tren; el ámbito se aplica al listar
  @Get('tableros/:id/impacto')
  @RequirePermissions('asset.read')
  impactoTablero(@Param('id') id: string) { return this.e.impactoTablero(id); }

  /** «Si salta esta llave, ¿qué se apaga?» */
  @SinAmbito()  // el circuito cuelga de su tablero, que ya declara el tren
  @Get('circuitos/:id/impacto')
  @RequirePermissions('asset.read')
  impacto(@Param('id') id: string) { return this.e.impactoCircuito(id); }

  @SinAmbito()  // idem
  @Post('circuitos/:id/activos')
  @RequirePermissions('asset.update')
  colgar(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any, @Ip() ip: string) {
    return this.e.colgarActivo(id, dto?.assetId, !!dto?.viaPoe, dto?.notas, u?.userId, ip);
  }

  @SinAmbito()  // el enlace se identifica por su id propio
  @Delete('activos/:id')
  @RequirePermissions('asset.update')
  descolgar(@Param('id') id: string, @CurrentUser() u: any, @Ip() ip: string) {
    return this.e.descolgarActivo(id, u?.userId, ip);
  }

  /** «¿Qué llave le corta la luz a este equipo?» — la pregunta de campo. */
  @AmbitoDe('asset', 'assetId')
  @Get('activo/:assetId')
  @RequirePermissions('asset.read')
  deActivo(@Param('assetId') assetId: string) { return this.e.alimentacionDeActivo(assetId); }

  @Post('mediciones')
  @RequirePermissions('asset.update')
  medir(@Body() dto: any, @CurrentUser() u: any, @Ip() ip: string) {
    return this.e.anotarMedicion(dto, u?.userId, ip);
  }
}
