import { Body, Controller, Get, Ip, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PreventiveService } from './preventive.service';
import { UpsertPreventivePlanDto } from './dto/upsert-plan.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

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

  // Estado de la generación automática (activa, hora, última ejecución).
  @Get('autogen-status')
  @RequirePermissions('wo.read')
  autoGenStatus() {
    return this.preventive.autoGenStatus();
  }

  // Generación manual (además de la automática diaria). SOLO crea OM PREVENTIVAS.
  // `days` permite adelantar las que vencen dentro de N días.
  @Post('generate')
  @RequirePermissions('wo.create')
  generate(@CurrentUser() user: any, @Ip() ip: string, @Query('days') days?: string) {
    const lookahead = Math.max(0, Math.min(90, Number(days) || 0));
    return this.preventive.generateDue(user?.userId, ip, lookahead);
  }
}
