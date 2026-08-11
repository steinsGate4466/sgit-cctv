import { Body, Controller, Delete, Get, Ip, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ChecklistService } from './checklist.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SinAmbito } from '../../common/ambito.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * Rutinas preventivas.
 *
 * DEFINIR la rutina pide 'location.manage', como las etapas y los catálogos:
 * es la misma clase de decisión, cómo se trabaja en esta planta.
 * RESPONDERLA pide 'wo.update': la contesta el técnico que está en el equipo.
 */
@ApiTags('checklist')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('checklist')
export class ChecklistController {
  constructor(private readonly chk: ChecklistService) {}

  // ---- Definición de rutinas ----

  @Get('plantillas')
  @RequirePermissions('wo.read')
  plantillas() {
    return this.chk.plantillas();
  }

  @Post('plantillas')
  @RequirePermissions('location.manage')
  crearPlantilla(@Body() body: any, @CurrentUser() user: any, @Ip() ip: string) {
    return this.chk.crearPlantilla(body, user?.userId, ip);
  }

  @SinAmbito()  // plantillas de checklist: globales
  @Patch('plantillas/:id')
  @RequirePermissions('location.manage')
  actualizarPlantilla(@Param('id') id: string, @Body() body: any) {
    return this.chk.actualizarPlantilla(id, body);
  }

  @SinAmbito()  // plantillas de checklist: globales
  @Post('plantillas/:id/puntos')
  @RequirePermissions('location.manage')
  agregarPunto(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any, @Ip() ip: string) {
    return this.chk.agregarPunto(id, body, user?.userId, ip);
  }

  @SinAmbito()  // plantillas de checklist: globales
  @Patch('puntos/:id')
  @RequirePermissions('location.manage')
  actualizarPunto(@Param('id') id: string, @Body() body: any) {
    return this.chk.actualizarPunto(id, body);
  }

  /** Desactiva el punto. No lo borra: las órdenes cerradas lo respondieron. */
  @SinAmbito()  // plantillas de checklist: globales
  @Delete('puntos/:id')
  @RequirePermissions('location.manage')
  quitarPunto(@Param('id') id: string) {
    return this.chk.quitarPunto(id);
  }

  // ---- La rutina dentro de una orden ----

  @SinAmbito()  // plantillas de checklist: globales
  @Get('orden/:woId')
  @RequirePermissions('wo.read')
  rutina(@Param('woId') woId: string) {
    return this.chk.rutinaDeOrden(woId);
  }

  @SinAmbito()  // plantillas de checklist: globales
  @Post('orden/:woId')
  @RequirePermissions('wo.update')
  responder(@Param('woId') woId: string, @Body() body: any, @CurrentUser() user: any, @Ip() ip: string) {
    return this.chk.responder(woId, body, user?.userId, ip);
  }
}
