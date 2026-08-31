import { Module } from '@nestjs/common';
import { PreventiveService } from './preventive.service';
import { PreventiveController } from './preventive.controller';
import { PreventiveScheduler } from './preventive.scheduler';
import { AuditModule } from '../audit/audit.module';
import { CriticidadModule } from '../criticidad/criticidad.module';

@Module({
  // Bloque 78: la letra A/B/C manda en la frecuencia del preventivo.
  imports: [AuditModule, CriticidadModule],
  controllers: [PreventiveController],
  // PreventiveScheduler: genera automáticamente las OM PREVENTIVAS vencidas (1 vez al día).
  providers: [PreventiveService, PreventiveScheduler],
  exports: [PreventiveService], // lo usa MaintenanceModule para reprogramar al cerrar OM
})
export class PreventiveModule {}
