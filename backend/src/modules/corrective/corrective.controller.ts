import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CorrectiveService } from './corrective.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('corrective')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('corrective')
export class CorrectiveController {
  constructor(private readonly corrective: CorrectiveService) {}

  @Get('assets')
  @RequirePermissions('wo.read')
  assets() {
    return this.corrective.assetsHistory();
  }

  @Get('summary')
  @RequirePermissions('wo.read')
  summary() {
    return this.corrective.summary();
  }
}
