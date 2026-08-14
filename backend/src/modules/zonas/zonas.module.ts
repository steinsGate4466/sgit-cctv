import { Module } from '@nestjs/common';
import { ZonasService } from './zonas.service';
import { CoberturaService } from './cobertura.service';
import { ZonasController } from './zonas.controller';
import { AuditModule } from '../audit/audit.module';

/**
 * ZONAS VITALES (bloque 26). El punto donde Producción entra al sistema:
 * declara qué zonas no pueden quedarse sin vista y por qué, y esa decisión
 * reordena sola el trabajo de Mantenimiento.
 */
@Module({
  imports: [AuditModule],
  controllers: [ZonasController],
  providers: [ZonasService, CoberturaService],
  exports: [ZonasService, CoberturaService],
})
export class ZonasModule {}
