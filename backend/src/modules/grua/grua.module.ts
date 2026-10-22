import { Module } from '@nestjs/common';
import { GruaService } from './grua.service';
import { GruaController } from './grua.controller';
import { IncidentsModule } from '../incidents/incidents.module';

/**
 * INSPECCIÓN DE CÁMARAS DE GRÚA (bloque 14).
 * Formulario largo a propósito: subir con manlift cuesta caro, así que se
 * sube una vez y se revisa todo — cámara, antena, cableado, alimentación,
 * grabación y gabinete.
 */
@Module({
  // Bloque 180: la inspección abre un AVISO con el alta normal de Incidencias
  // (la OM la crea SAP y la trata Mantenimiento).
  imports: [IncidentsModule],
  controllers: [GruaController],
  providers: [GruaService],
  exports: [GruaService],
})
export class GruaModule {}
