import { Module } from '@nestjs/common';
import { MaintenanceService } from './maintenance.service';
import { MaintenanceController } from './maintenance.controller';
import { PreparacionService } from './preparacion.service';
import { OmEquiposService } from './om-equipos.service';
import { PreparacionController } from './preparacion.controller';
import { ParadaProrrogaController } from './parada-prorroga.controller';
import { ParadaProrrogaService } from './parada-prorroga.service';
import { AuditModule } from '../audit/audit.module';
import { StorageModule } from '../storage/storage.module';
import { PreventiveModule } from '../preventive/preventive.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';

@Module({
  imports: [AuditModule, StorageModule, PreventiveModule, NotificacionesModule],
  // PreparacionController va PRIMERO: sus rutas son más específicas
  // (/work-orders/:id/tools, /materials, /swaps). Si fuera después, las rutas
  // genéricas de MaintenanceController podrían capturarlas.
  // ParadaProrrogaController también antes: `prorrogas/pendientes` no puede
  // caer en el `:id` genérico de MaintenanceController (bloques 135/138).
  controllers: [PreparacionController, ParadaProrrogaController, MaintenanceController],
  providers: [MaintenanceService, PreparacionService, OmEquiposService, ParadaProrrogaService],
  exports: [MaintenanceService, PreparacionService, OmEquiposService],
})
export class MaintenanceModule {}
