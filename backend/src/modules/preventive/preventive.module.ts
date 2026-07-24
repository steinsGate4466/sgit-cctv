import { Module } from '@nestjs/common';
import { PreventiveService } from './preventive.service';
import { PreventiveController } from './preventive.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [PreventiveController],
  providers: [PreventiveService],
  exports: [PreventiveService], // lo usa MaintenanceModule para reprogramar al cerrar OM
})
export class PreventiveModule {}
