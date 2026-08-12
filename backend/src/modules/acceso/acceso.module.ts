import { Global, Module } from '@nestjs/common';
import { AccesoService } from './acceso.service';
import { AccesoController } from './acceso.controller';
import { AuditModule } from '../audit/audit.module';

/**
 * Global porque el guard de acceso corre en cada petición y vive fuera de
 * este módulo. Ver `acceso.service.ts` para el diseño y sus límites.
 */
@Global()
@Module({
  imports: [AuditModule],
  controllers: [AccesoController],
  providers: [AccesoService],
  exports: [AccesoService],
})
export class AccesoModule {}
