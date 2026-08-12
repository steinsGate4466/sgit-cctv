import { Module } from '@nestjs/common';
import { CampanasService } from './campanas.service';
import { CampanasController } from './campanas.controller';
import { AuditModule } from '../audit/audit.module';

/**
 * CAMPAÑAS DE MAPEO (12.5). El control de calidad del levantamiento:
 * repartir zonas, medir avance y REVISAR —con otra persona— antes de dar
 * una zona por buena. Contra un dato mal cargado ningún respaldo sirve.
 */
@Module({
  imports: [AuditModule],
  controllers: [CampanasController],
  providers: [CampanasService],
  exports: [CampanasService],
})
export class CampanasModule {}
