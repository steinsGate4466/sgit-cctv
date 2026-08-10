import { Module } from '@nestjs/common';
import { PurgaService } from './purga.service';
import { PurgaController } from './purga.controller';
import { AuditModule } from '../audit/audit.module';

/**
 * PURGA (bloque 15) — borrado definitivo para limpiar basura.
 *
 * Distinto de la BAJA: la baja retira un equipo real y conserva su historial;
 * la purga borra un registro que nunca debió existir. Ver el comentario largo
 * del servicio: confundirlas es el error caro.
 *
 * Sólo el Jefe de Mantenimiento, y sólo si no hay trabajo firmado detrás.
 */
@Module({
  imports: [AuditModule],
  controllers: [PurgaController],
  providers: [PurgaService],
  exports: [PurgaService],
})
export class PurgaModule {}
