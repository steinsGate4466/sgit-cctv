import { Global, Module } from '@nestjs/common';
import { EquiposService } from './equipos.service';
import { EquiposController } from './equipos.controller';

/**
 * Global porque el interceptor de auditoría —que vive en el módulo de
 * auditoría— necesita traducir la IP en cada petición. La alternativa era
 * importarlo en cadena por medio sistema.
 */
@Global()
@Module({
  controllers: [EquiposController],
  providers: [EquiposService],
  exports: [EquiposService],
})
export class EquiposModule {}
