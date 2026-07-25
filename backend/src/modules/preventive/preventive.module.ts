import { Module } from '@nestjs/common';
import { PreventiveService } from './preventive.service';
import { PreventiveController } from './preventive.controller';
import { PreventiveScheduler } from './preventive.scheduler';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [PreventiveController],
  // PreventiveScheduler: genera automáticamente las OM PREVENTIVAS vencidas (1 vez al día).
  providers: [PreventiveService, PreventiveScheduler],
  exports: [PreventiveService], // lo usa MaintenanceModule para reprogramar al cerrar OM
})
export class PreventiveModule {}
