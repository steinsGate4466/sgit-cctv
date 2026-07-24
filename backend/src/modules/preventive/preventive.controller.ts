import { Body, Controller, Get, Ip, Post, UseGuards } from '@nestjs/common';
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

  // Generar las OM preventivas vencidas (botón del Jefe o tarea programada).
  @Post('generate')
  @RequirePermissions('wo.create')
  generate(@CurrentUser() user: any, @Ip() ip: string) {
    return this.preventive.generateDue(user?.userId, ip);
  }
}
