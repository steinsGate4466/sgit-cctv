import { Body, Controller, Get, Ip, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PreventiveService } from './preventive.service';
import { UpsertPreventivePlanDto } from './dto/upsert-plan.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AmbitoDe } from '../../common/ambito.decorator';
import { NumeroSapDto } from '../../common/numero-sap.dto';

@ApiTags('preventive')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('preventive')
export class PreventiveController {
  constructor(private readonly preventive: PreventiveService) {}

  @Get('plans')
  @RequirePermissions('wo.read')
  plans() {
    return this.preventive.listPlans();
  }

  @Get('summary')
  @RequirePermissions('wo.read')
  summary() {
    return this.preventive.summary();
  }

  // Crear/editar el plan de un activo (Jefe / quien pueda crear OM).
  @Post('plans')
  @RequirePermissions('wo.create')
  upsert(@Body() dto: UpsertPreventivePlanDto, @CurrentUser() user: any, @Ip() ip: string) {
    return this.preventive.upsertPlan(dto, user?.userId, ip);
  }

  /* ===========================================================================
     BLOQUE 180 · EL PROGRAMA Y EL VÍNCULO CON SAP
     ---------------------------------------------------------------------------
     Se retiraron `generate`, `autogen` y `autogen-status`: SGIT ya no crea
     órdenes preventivas (decisión 3 de Cristhian, «solo programa y vincula»).
     La OM de una rutina la genera SAP; aquí se ve qué toca y se vincula.
  =========================================================================== */

  /** Qué rutina toca y cuándo, con su OM si ya la tiene. `dias`: cuántos días adelante (0-90). */
  @Get('programa')
  @RequirePermissions('wo.read')
  programa(@Query('dias') dias?: string) {
    return this.preventive.programa(dias === undefined ? 30 : Number(dias));
  }

  /* Vincular la OM que generó SAP a la rutina de ESTE equipo. Lo hace el Jefe
     (`wo.approve`): decide qué trabajo entra en el programa de la planta. El
     ámbito es el del equipo: sólo los de tu tren. */
  @AmbitoDe('asset', 'assetId')
  @Post('activo/:assetId/vincular-sap')
  @RequirePermissions('wo.approve')
  vincularSap(@Param('assetId') assetId: string, @Body() body: NumeroSapDto, @CurrentUser() user: any, @Ip() ip: string) {
    return this.preventive.vincularSap(assetId, body?.numero ?? null, user?.userId ?? null, ip);
  }
}
