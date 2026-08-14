import { Body, Controller, Get, Ip, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProcedimientosService } from './procedimientos.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AmbitoDe, SinAmbito } from '../../common/ambito.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('procedimientos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class ProcedimientosController {
  constructor(private readonly svc: ProcedimientosService) {}

  /** TODO lo que hace falta estando delante del equipo, en una sola llamada.
   *  En planta la señal es mala: tres peticiones son tres formas de fallar. */
  @AmbitoDe('asset')
  @Get('activos/:id/campo')
  @RequirePermissions('asset.read')
  contexto(@Param('id') id: string) { return this.svc.contextoDeCampo(id); }

  /** Dejar un aviso para el que llegue después. Va con `wo.update`: quien
   *  trabaja el equipo puede avisar. Un permiso aparte para esto conseguiría
   *  que nadie avisara. */
  @AmbitoDe('asset')
  @Post('activos/:id/notas')
  @RequirePermissions('wo.update')
  dejarNota(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any, @Ip() ip: string) {
    return this.svc.dejarNota(id, dto, u?.userId, ip);
  }

  @SinAmbito()
  @Patch('notas-campo/:id/resolver')
  @RequirePermissions('wo.update')
  resolverNota(@Param('id') id: string, @CurrentUser() u: any, @Ip() ip: string) {
    return this.svc.resolverNota(id, u?.userId, ip);
  }

  @SinAmbito()
  @Get('procedimientos')
  @RequirePermissions('asset.read')
  listar(@Query('tipo') tipo?: string) { return this.svc.listarProcedimientos(tipo); }

  @SinAmbito()
  @Post('procedimientos')
  @RequirePermissions('procedimiento.manage')
  guardar(@Body() dto: any, @CurrentUser() u: any, @Ip() ip: string) {
    return this.svc.guardarProcedimiento(dto, u?.userId, ip);
  }

  /** Proponer una mejora desde el trabajo recién hecho. Cualquiera que
   *  trabaje órdenes puede proponer; decidir es otra cosa. */
  @SinAmbito()
  @Post('procedimientos/:id/mejoras')
  @RequirePermissions('wo.update')
  proponer(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any, @Ip() ip: string) {
    return this.svc.proponerMejora(id, dto, u?.userId, ip);
  }

  @SinAmbito()
  @Get('procedimientos-mejoras/pendientes')
  @RequirePermissions('asset.read')
  pendientes() { return this.svc.mejorasPendientes(); }

  @SinAmbito()
  @Patch('procedimientos-mejoras/:id')
  @RequirePermissions('procedimiento.manage')
  decidir(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any, @Ip() ip: string) {
    return this.svc.decidirMejora(id, dto, u?.permissions, u?.userId, ip);
  }
}
