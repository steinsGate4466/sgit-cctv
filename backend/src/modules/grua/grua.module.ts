import { Module } from '@nestjs/common';
import { GruaService } from './grua.service';
import { GruaController } from './grua.controller';
import { MaintenanceModule } from '../maintenance/maintenance.module';

/**
 * INSPECCIÓN DE CÁMARAS DE GRÚA (bloque 14).
 * Formulario largo a propósito: subir con manlift cuesta caro, así que se
 * sube una vez y se revisa todo — cámara, antena, cableado, alimentación,
 * grabación y gabinete.
 */
@Module({
  // Bloque 140: la inspección abre la orden con el alta normal de Órdenes.
  imports: [MaintenanceModule],
  controllers: [GruaController],
  providers: [GruaService],
  exports: [GruaService],
})
export class GruaModule {}
