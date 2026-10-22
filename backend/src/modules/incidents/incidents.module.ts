import { Module } from '@nestjs/common';
import { IncidentsService } from './incidents.service';
import { IncidentsController } from './incidents.controller';
import { AuditModule } from '../audit/audit.module';
import { StorageModule } from '../storage/storage.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';

@Module({
  imports: [AuditModule, StorageModule, NotificacionesModule],
  controllers: [IncidentsController],
  providers: [IncidentsService],
  // Bloque 180: la inspección de grúa abre su aviso con este mismo alta.
  exports: [IncidentsService],
})
export class IncidentsModule {}
