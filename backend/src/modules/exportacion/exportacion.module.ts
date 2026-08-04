import { Module } from '@nestjs/common';
import { ExportacionService } from './exportacion.service';
import { ExportacionController } from './exportacion.controller';

/**
 * EXPORTACIÓN A EXCEL (bloque 11.1).
 * Sólo lectura: convierte lo que ya se ve en pantallas en hojas de cálculo.
 * No escribe nada, nunca. La reimportación —si algún día existe— será otro
 * módulo, sólo para catálogos, y con confirmación.
 */
@Module({
  controllers: [ExportacionController],
  providers: [ExportacionService],
})
export class ExportacionModule {}
