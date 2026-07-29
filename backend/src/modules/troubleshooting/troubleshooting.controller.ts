import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TroubleshootingService } from './troubleshooting.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('troubleshooting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('troubleshooting')
export class TroubleshootingController {
  constructor(private readonly ts: TroubleshootingService) {}

  // Antes bastaba con estar autenticado: cualquier usuario accedía a las métricas.
  // Ahora exige el permiso correspondiente, como el resto del sistema.
  @Get('metrics')
  @RequirePermissions('troubleshooting.read')
  metrics() {
    return this.ts.metrics();
  }
}
