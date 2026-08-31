import { Module } from '@nestjs/common';
import { IndicadoresService } from './indicadores.service';
import { IndicadoresController } from './indicadores.controller';
import { CriticidadModule } from '../criticidad/criticidad.module';

/**
 * INDICADORES DE GESTIÓN (bloque 22). MTTR, MTBF, disponibilidad,
 * cumplimiento del preventivo y backlog. Convierte el sistema de herramienta
 * operativa en herramienta de gestión, sin cargar un solo dato nuevo.
 */
@Module({
  // Bloque 78. `IndicadoresService` inyecta `CriticidadService` para la regla
  // de cumplimiento «todo equipo tiene su letra». Sin importar el módulo, Nest
  // aborta AL ARRANCAR, no al compilar.
  imports: [CriticidadModule],
  controllers: [IndicadoresController],
  providers: [IndicadoresService],
  exports: [IndicadoresService],
})
export class IndicadoresModule {}
