import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IndicadoresService } from './indicadores.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('indicadores')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('indicadores')
export class IndicadoresController {
  constructor(private readonly ind: IndicadoresService) {}

  @Get()
  @RequirePermissions('dashboard.read')
  tablero(@Query('dias') dias?: string, @Query('tren') tren?: string) {
    const d = Number(dias);
    return this.ind.tablero(d > 0 && d <= 730 ? d : 90, tren || undefined);
  }

  @Get('tendencia')
  @RequirePermissions('dashboard.read')
  tendencia(@Query('meses') meses?: string) {
    const m = Number(meses);
    return this.ind.tendencia(m > 0 && m <= 24 ? m : 6);
  }
}
