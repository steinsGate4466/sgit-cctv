import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PredictiveService } from './predictive.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('predictive')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('predictive')
export class PredictiveController {
  constructor(private readonly predictive: PredictiveService) {}

  @Get('risk')
  @RequirePermissions('wo.read')
  risk() {
    return this.predictive.riskAssets();
  }

  @Get('summary')
  @RequirePermissions('wo.read')
  summary() {
    return this.predictive.summary();
  }
}
