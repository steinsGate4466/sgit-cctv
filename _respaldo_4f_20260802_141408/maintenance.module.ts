import { Module } from '@nestjs/common';
import { MaintenanceService } from './maintenance.service';
import { MaintenanceController } from './maintenance.controller';
import { PreparacionService } from './preparacion.service';
import { PreparacionController } from './preparacion.controller';
import { AuditModule } from '../audit/audit.module';
import { StorageModule } from '../storage/storage.module';
import { PreventiveModule } from '../preventive/preventive.module';

@Module({
  imports: [AuditModule, StorageModule, PreventiveModule],
  // PreparacionController va PRIMERO: sus rutas son más específicas
  // (/work-orders/:id/tools, /materials, /swaps). Si fuera después, las rutas
  // genéricas de MaintenanceController podrían capturarlas.
  controllers: [PreparacionController, MaintenanceController],
  providers: [MaintenanceService, PreparacionService],
  exports: [MaintenanceService, PreparacionService],
})
export class MaintenanceModule {}
