import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('kpis')
  @RequirePermissions('dashboard.read')
  kpis() {
    return this.dashboard.kpis();
  }

  // Agregados para los gráficos (evita traer los activos completos al navegador).
  @Get('overview')
  @RequirePermissions('dashboard.read')
  overview() {
    return this.dashboard.overview();
  }

  // Detalle de un Tren: activos con problema y trabajos pendientes.
  @Get('train/:train')
  @RequirePermissions('dashboard.read')
  trainDetail(@Param('train') train: string) {
    return this.dashboard.trainDetail(train);
  }

  // Causas raíz reales de las incidencias (no la categoría).
  @Get('root-causes')
  @RequirePermissions('dashboard.read')
  rootCauses(@Query('days') days?: string) {
    const d = Math.max(30, Math.min(730, Number(days) || 180));
    return this.dashboard.rootCauses(d);
  }
}
