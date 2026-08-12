import { Module } from '@nestjs/common';
import { ElectricidadService } from './electricidad.service';
import { ElectricidadController } from './electricidad.controller';
import { AuditModule } from '../audit/audit.module';

/**
 * ELECTRICIDAD (bloque 18). Tableros, circuitos y —lo que importa— QUÉ
 * EQUIPO CUELGA DE QUÉ LLAVE. La causa número uno de «se cayeron ocho
 * cámaras de golpe» es que saltó un térmico, y hoy nadie sabe cuál.
 */
@Module({
  imports: [AuditModule],
  controllers: [ElectricidadController],
  providers: [ElectricidadService],
  exports: [ElectricidadService],
})
export class ElectricidadModule {}
