import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TroubleshootingService } from './troubleshooting.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('troubleshooting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('troubleshooting')
export class TroubleshootingController {
  constructor(private readonly ts: TroubleshootingService) {}
  @Get('metrics')
  metrics() {
    return this.ts.metrics();
  }
}
