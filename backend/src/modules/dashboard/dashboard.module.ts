import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { InfraService } from './infra.service';
import { InfraController } from './infra.controller';
import { BandejaService } from './bandeja.service';
import { CamarasCaidasService } from './camaras-caidas.service';
import { CamarasCaidasController } from './camaras-caidas.controller';
import { ActivosPorTrenService } from './activos-por-tren.service';
import { ActivosPorTrenController } from './activos-por-tren.controller';

@Module({
  // InfraController PRIMERO: lo específico antes de lo genérico. Sus rutas
  // ('dashboard/infra/...') no chocan hoy con las del tablero ejecutivo, pero
  // el orden deja la regla escrita para quien venga después.
  controllers: [
    CamarasCaidasController, ActivosPorTrenController,
    InfraController, DashboardController,
  ],
  // BandejaService FALTABA aquí y tumbó el arranque en producción:
  // DashboardController lo pide por constructor, Nest no lo encontraba y
  // abortaba el arranque entero. Un proveedor que se inyecta y no se declara
  // no da un error en compilación —TypeScript ve la clase importada y se
  // queda tranquilo—, lo da al levantar. Por eso hay ahora una prueba que
  // compila el módulo de verdad: dashboard.module.spec.ts.
  providers: [
    DashboardService, InfraService, BandejaService,
    CamarasCaidasService, ActivosPorTrenService,
  ],
  exports: [InfraService],
})
export class DashboardModule {}
