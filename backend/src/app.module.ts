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
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AuditModule } from './modules/audit/audit.module';
import { IntegrationModule } from './modules/integration/integration.module';
import { CredentialsModule } from './modules/credentials/credentials.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { PreventiveModule } from './modules/preventive/preventive.module';
import { CorrectiveModule } from './modules/corrective/corrective.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    LocationsModule,
    AssetsModule,
    NetworkModule,
    MaintenanceModule,
    IncidentsModule,
    TroubleshootingModule,
    DocumentsModule,
    DashboardModule,
    AuditModule,
    IntegrationModule,
    CredentialsModule,
    InventoryModule,
    PreventiveModule,
    CorrectiveModule,
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
