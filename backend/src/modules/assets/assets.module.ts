import { Module } from '@nestjs/common';
import { AssetsService } from './assets.service';
import { AssetsController } from './assets.controller';
import { CablesService } from './cables.service';
import { CablesController } from './cables.controller';
import { HistoryService } from './history.service';
import { AuditModule } from '../audit/audit.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [AuditModule, StorageModule],
  // CablesController va PRIMERO: su ruta (/assets/cables) es más específica.
  // Si fuera después, @Get(':id') de AssetsController capturaría "cables" y
  // el endpoint devolvería "activo no encontrado" en lugar de la lista.
  controllers: [CablesController, AssetsController],
  providers: [AssetsService, CablesService, HistoryService],
  exports: [AssetsService, CablesService, HistoryService],
})
export class AssetsModule {}
