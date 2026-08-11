import { Module } from '@nestjs/common';
import { ParadasService } from './paradas.service';
import { ParadasController } from './paradas.controller';
import { AuditModule } from '../audit/audit.module';

/**
 * VENTANAS DE PARADA (F8-F/G/H). Estuvo bloqueado hasta saber de dónde salen
 * las paradas. La respuesta: MANUAL, y la hora cambia a última hora.
 */
@Module({
  imports: [AuditModule],
  controllers: [ParadasController],
  providers: [ParadasService],
  exports: [ParadasService],
})
export class ParadasModule {}
