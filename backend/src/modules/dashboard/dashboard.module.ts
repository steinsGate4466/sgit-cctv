import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { InfraService } from './infra.service';
import { InfraController } from './infra.controller';

@Module({
  // InfraController PRIMERO: lo específico antes de lo genérico. Sus rutas
  // ('dashboard/infra/...') no chocan hoy con las del tablero ejecutivo, pero
  // el orden deja la regla escrita para quien venga después.
  controllers: [InfraController, DashboardController],
  providers: [DashboardService, InfraService],
  exports: [InfraService],
})
export class DashboardModule {}
