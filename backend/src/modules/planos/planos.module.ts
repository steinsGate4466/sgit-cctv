import { Module } from '@nestjs/common';
import { PlanosService } from './planos.service';
import { PlanosController } from './planos.controller';
import { StorageModule } from '../storage/storage.module';
import { AuditModule } from '../audit/audit.module';

/** PLANO VIVO — bloque 151: el plano real con cada equipo en su sitio. */
@Module({
  imports: [StorageModule, AuditModule],
  controllers: [PlanosController],
  providers: [PlanosService],
})
export class PlanosModule {}
