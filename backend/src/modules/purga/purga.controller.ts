import { Body, Controller, Get, Ip, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PurgaService } from './purga.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SinAmbito } from '../../common/ambito.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PurgarDto, PurgarAuditoriaDto } from './dto/purga.dto';

/**
 * Todo lo de aquí es IRREVERSIBLE, así que se usa POST incluso para las
 * vistas previas que no cambian nada: mantiene el patrón "nada de purga se
 * dispara desde un enlace" — un GET se puede provocar desde una imagen o un
 * enlace en otra web.
 */
@ApiTags('purga')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('purga')
export class PurgaController {
  constructor(private readonly purga: PurgaService) {}

  /** Literales antes que parámetros, como siempre. */
  @Get('candidatos')
  @RequirePermissions('asset.delete')
  candidatos() {
    return this.purga.candidatosBasura();
  }

  /**
   * `wo.approve` y no un `wo.delete` nuevo: ese permiso YA está reservado al
   * Jefe de Mantenimiento en la semilla, y crear uno nuevo obliga a sembrarlo
   * y a que alguien se acuerde de asignarlo. El día que se olvide, el botón
   * no lo ve nadie y parece que el módulo no funciona.
   */
  @Get('candidatos-om')
  @RequirePermissions('wo.approve')
  candidatosOm() {
    return this.purga.candidatosOm();
  }

  @SinAmbito()  // purga: ya exige el rol Jefe de Mantenimiento, que lo ve todo
  @Get('activo/:id')
  @RequirePermissions('asset.delete')
  previaActivo(@Param('id') id: string) {
    return this.purga.vistaPreviaActivo(id);
  }

  @SinAmbito()  // purga: ya exige el rol Jefe de Mantenimiento, que lo ve todo
  @Post('activo/:id')
  @RequirePermissions('asset.delete')
  purgarActivo(@Param('id') id: string, @Body() dto: PurgarDto, @CurrentUser() u: any, @Ip() ip: string) {
    return this.purga.purgarActivo(id, dto.confirmacion, u?.userId, ip);
  }

  @SinAmbito()  // purga: ya exige el rol Jefe de Mantenimiento, que lo ve todo
  @Get('om/:id')
  @RequirePermissions('wo.approve')
  previaOm(@Param('id') id: string) {
    return this.purga.vistaPreviaOm(id);
  }

  @SinAmbito()  // purga: ya exige el rol Jefe de Mantenimiento, que lo ve todo
  @Post('om/:id')
  @RequirePermissions('wo.approve')
  purgarOm(@Param('id') id: string, @Body() dto: PurgarDto, @CurrentUser() u: any, @Ip() ip: string) {
    return this.purga.purgarOm(id, dto.confirmacion, u?.userId, ip, !!dto.forzar);
  }

  /**
   * VACIAR TODAS LAS ÓRDENES. Ruta literal y separada de `:id` a propósito:
   * que no se pueda llegar aquí por accidente desde la ruta de una sola.
   */
  @Get('resumen-om')
  @RequirePermissions('wo.approve')
  resumenOm() {
    return this.purga.resumenOrdenes();
  }

  @Post('vaciar-om')
  @RequirePermissions('wo.approve')
  vaciarOm(@Body() dto: PurgarDto, @CurrentUser() u: any, @Ip() ip: string) {
    return this.purga.vaciarOrdenes(dto.confirmacion, u?.userId, ip);
  }

  @SinAmbito()  // purga: ya exige el rol Jefe de Mantenimiento, que lo ve todo
  /* ---------- BORRADO GENÉRICO, CUALQUIER MÓDULO ----------
     Una sola pareja de rutas para los quince recursos. El permiso concreto
     de cada uno lo comprueba el servicio contra la tabla `RECURSOS`; aquí
     se exige el mínimo común (`asset.read`) porque sin ver nada no tiene
     sentido llegar hasta aquí, y ADEMÁS el servicio exige el rol de Jefe.
     Repetir quince rutas con quince @RequirePermissions distintos habría
     sido quince sitios donde equivocarse. */
  @Get('recursos')
  @RequirePermissions('asset.read')
  recursos() {
    return this.purga.recursosDisponibles();
  }

  @SinAmbito()  // el borrado definitivo ya exige el rol Jefe, que lo ve todo
  @Get('r/:clave/:id')
  @RequirePermissions('asset.read')
  previaRecurso(@Param('clave') clave: string, @Param('id') id: string, @CurrentUser() u: any) {
    // Se le pasan los permisos del token: la ruta es una para los dieciséis
    // recursos, así que el permiso concreto lo comprueba el servicio.
    return this.purga.vistaPreviaRecurso(clave, id, u?.permissions || [], u?.role);
  }

  @SinAmbito()  // idem
  @Post('r/:clave/:id')
  @RequirePermissions('asset.read')
  purgarRecurso(
    @Param('clave') clave: string,
    @Param('id') id: string,
    @Body() dto: PurgarDto,
    @CurrentUser() u: any,
    @Ip() ip: string,
  ) {
    return this.purga.purgarRecurso(clave, id, dto.confirmacion, u?.userId, ip, !!dto.forzar);
  }

  @SinAmbito()  // purga: ya exige el rol Jefe de Mantenimiento, que lo ve todo
  @Get('usuario/:id')
  @RequirePermissions('user.manage')
  previaUsuario(@Param('id') id: string) {
    return this.purga.vistaPreviaUsuario(id);
  }

  @SinAmbito()  // purga: ya exige el rol Jefe de Mantenimiento, que lo ve todo
  @Post('usuario/:id')
  @RequirePermissions('user.manage')
  purgarUsuario(@Param('id') id: string, @Body() dto: PurgarDto, @CurrentUser() u: any, @Ip() ip: string) {
    return this.purga.purgarUsuario(id, dto.confirmacion, u?.userId, ip);
  }

  @Get('auditoria')
  @RequirePermissions('audit.read')
  previaAuditoria(@Query('antesDe') antesDe: string) {
    return this.purga.vistaPreviaAuditoria(antesDe);
  }

  @Post('auditoria')
  @RequirePermissions('audit.read')
  purgarAuditoria(@Body() dto: PurgarAuditoriaDto, @CurrentUser() u: any, @Ip() ip: string) {
    return this.purga.purgarAuditoria(dto.antesDe, dto.confirmacion, u?.userId, ip);
  }
}
