import { Module } from '@nestjs/common';
import { IndicadoresService } from './indicadores.service';
import { IndicadoresController } from './indicadores.controller';

/**
 * INDICADORES DE GESTIÓN (bloque 22). MTTR, MTBF, disponibilidad,
 * cumplimiento del preventivo y backlog. Convierte el sistema de herramienta
 * operativa en herramienta de gestión, sin cargar un solo dato nuevo.
 */
@Module({
  controllers: [IndicadoresController],
  providers: [IndicadoresService],
  exports: [IndicadoresService],
})
export class IndicadoresModule {}
