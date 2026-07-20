import { Module } from '@nestjs/common';
import { TroubleshootingService } from './troubleshooting.service';
import { TroubleshootingController } from './troubleshooting.controller';

@Module({
  controllers: [TroubleshootingController],
  providers: [TroubleshootingService],
})
export class TroubleshootingModule {}
