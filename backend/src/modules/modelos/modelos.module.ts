import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { AuditModule } from '../audit/audit.module';
import { ModelosController } from './modelos.controller';
import { ModelosService } from './modelos.service';

/** Catálogo de modelos y fichas técnicas (bloque 184). */
@Module({
  imports: [StorageModule, AuditModule],
  controllers: [ModelosController],
  providers: [ModelosService],
  exports: [ModelosService],
})
export class ModelosModule {}
