import { Module } from '@nestjs/common';
import { GruaService } from './grua.service';
import { GruaController } from './grua.controller';

/**
 * INSPECCIÓN DE CÁMARAS DE GRÚA (bloque 14).
 * Formulario largo a propósito: subir con manlift cuesta caro, así que se
 * sube una vez y se revisa todo — cámara, antena, cableado, alimentación,
 * grabación y gabinete.
 */
@Module({
  controllers: [GruaController],
  providers: [GruaService],
  exports: [GruaService],
})
export class GruaModule {}
