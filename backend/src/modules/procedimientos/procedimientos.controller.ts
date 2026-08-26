import { Body, Controller, Get, Ip, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProcedimientosService } from './procedimientos.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequireAlguno, RequirePermissions } from '../../common/decorators/permissions.decorator';
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
  /* Misma puerta que `GET /assets/:id` (bloque 68): esta llamada es la otra
     mitad de la MISMA pantalla. Si una se abre y la otra no, el QR sale a
     medias — que es peor que no salir, porque parece que funciona. */
  @AmbitoDe('asset')
  @Get('activos/:id/campo')
  @RequireAlguno('asset.read', 'activos.mirar')
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

  /**
   * LA BANDEJA DE QUIEN DECIDE — bloque 58.
   *
   * Antes pedía `asset.read`, que era la llave maestra: cualquiera que pudiera
   * ver una cámara veía también las propuestas pendientes de aprobar. Al
   * partir esa llave en el bloque 55 quedó claro que ésta es una pantalla de
   * DECISIÓN, y se pide el mismo permiso que hace falta para decidir.
   *
   * Así la pantalla no aparece en el menú de quien no puede hacer nada con
   * ella. Un botón que no se puede pulsar enseña a ignorar los botones.
   */
  @SinAmbito()
  @Get('procedimientos-mejoras/pendientes')
  @RequirePermissions('procedimiento.manage')
  pendientes() { return this.svc.mejorasPendientes(); }

  /**
   * LO QUE YO PROPUSE, Y EN QUÉ QUEDÓ — bloque 58.
   *
   * Sin permiso: cada uno ve LO SUYO, y el identificador sale de la sesión, no
   * de la URL. No hay nada que pedir ni nada que se pueda mirar de otro.
   */
  @SinAmbito()
  @Get('procedimientos-mejoras/mias')
  mias(@CurrentUser() u: any) { return this.svc.misMejoras(u?.userId); }

  @SinAmbito()
  @Patch('procedimientos-mejoras/:id')
  @RequirePermissions('procedimiento.manage')
  decidir(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: any, @Ip() ip: string) {
    return this.svc.decidirMejora(id, dto, u?.permissions, u?.userId, ip);
  }
}
