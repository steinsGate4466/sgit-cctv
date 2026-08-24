import { Module } from '@nestjs/common';
import { ProcedimientosService } from './procedimientos.service';
import { ProcedimientosController } from './procedimientos.controller';
import { AuditModule } from '../audit/audit.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';

/**
 * PROCEDIMIENTOS Y NOTAS DE CAMPO (bloque 29). Los dos cuelgan del QR del
 * equipo, que es la única puerta que el técnico abre de verdad en planta.
 */
@Module({
  imports: [AuditModule, NotificacionesModule],
  controllers: [ProcedimientosController],
  providers: [ProcedimientosService],
  exports: [ProcedimientosService],
})
export class ProcedimientosModule {}
