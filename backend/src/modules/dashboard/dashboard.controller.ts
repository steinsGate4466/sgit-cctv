import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { BandejaService } from './bandeja.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly bandeja: BandejaService,
  ) {}

  /**
   * LA BANDEJA: lo que espera una decisión, hoy, en una sola llamada.
   * Un indicador se mira; una bandeja se VACÍA.
   */
  @Get('bandeja')
  @RequirePermissions('dashboard.read')
  miBandeja(@CurrentUser() user: any) {
    return this.bandeja.bandeja(user?.userId);
  }

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

  // RETIRADO en 3B-2: GET /dashboard/train/:train
  //
  // Agrupaba por la columna Asset.train, la fuente de verdad vieja. Se retira
  // porque era código VIVO leyendo la columna obsoleta: mientras existiera,
  // cualquiera podía construir encima y reintroducir la contradicción que
  // costó el cuarto tren fantasma. Se verificó antes de quitarlo: ninguna de
  // las 160 llamadas del frontend apuntaba aquí.
  //
  // El tablero por tren se sirve desde InfraService, que deriva el tren del
  // árbol de ubicaciones: GET /dashboard/infra/tren/:idOrCode
  //
  // La columna Asset.train SE CONSERVA en la base: no se lee, pero tampoco se
  // pierde el dato.

  // Causas raíz reales de las incidencias (no la categoría).
  @Get('root-causes')
  @RequirePermissions('dashboard.read')
  rootCauses(@Query('days') days?: string) {
    const d = Math.max(30, Math.min(730, Number(days) || 180));
    return this.dashboard.rootCauses(d);
  }
}
