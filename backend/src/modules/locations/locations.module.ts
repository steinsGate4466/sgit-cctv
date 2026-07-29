import { Module } from '@nestjs/common';
import { LocationsService } from './locations.service';
import { LocationsController } from './locations.controller';
import { StagesService } from './stages.service';
import { StagesController } from './stages.controller';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  // StagesController va PRIMERO: sus rutas son más específicas
  // (/locations/stages) y así nunca las captura una ruta genérica.
  controllers: [StagesController, LocationsController],
  providers: [LocationsService, StagesService],
  exports: [LocationsService, StagesService],
})
export class LocationsModule {}
