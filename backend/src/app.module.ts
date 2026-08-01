import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './common/health.controller';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { LocationsModule } from './modules/locations/locations.module';
import { AssetsModule } from './modules/assets/assets.module';
import { NetworkModule } from './modules/network/network.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { IncidentsModule } from './modules/incidents/incidents.module';
import { TroubleshootingModule } from './modules/troubleshooting/troubleshooting.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { CatalogosModule } from './modules/catalogos/catalogos.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AuditModule } from './modules/audit/audit.module';
import { IntegrationModule } from './modules/integration/integration.module';
import { CredentialsModule } from './modules/credentials/credentials.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { PreventiveModule } from './modules/preventive/preventive.module';
import { CorrectiveModule } from './modules/corrective/corrective.module';
import { CabinetsModule } from './modules/cabinets/cabinets.module';
import { AccessModule } from './modules/access/access.module';
import { PredictiveModule } from './modules/predictive/predictive.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    LocationsModule,
    AssetsModule,
    MaintenanceModule,
    IncidentsModule,
    TroubleshootingModule,
    CatalogosModule,   // causas, sintomas, acciones y motivos, editables (3E)
    DashboardModule,
    AuditModule,
    CredentialsModule,
    // ---- Módulos reservados para fases siguientes ----
    // Sus modelos YA existen en el esquema de datos; falta exponer su API.
    NetworkModule,      // topología: VLAN, puertos de switch y enlaces (F8)
    DocumentsModule,    // planos, manuales y respaldos de configuración (F8)
    IntegrationModule,  // SAP, HikCentral, Zabbix, Active Directory (F9)
    InventoryModule,
    PreventiveModule,
    CorrectiveModule,
    CabinetsModule,
    AccessModule,
    PredictiveModule,
  ],
  controllers: [HealthController],
  providers: [
    // Seguridad por defecto en TODOS los endpoints (F1-A):
    // 1) JwtAuthGuard valida el token (excepto rutas @Public).
    // 2) PermissionsGuard valida @RequirePermissions (pasa si no se exige ninguno).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
