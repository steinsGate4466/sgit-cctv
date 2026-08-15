import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './common/health.controller';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { RitmoGuard } from './common/guards/ritmo.guard';
import { AmbitoGuard } from './common/guards/ambito.guard';
import { AccesoDispositivoGuard } from './modules/acceso/acceso-dispositivo.guard';

import { AuthModule } from './modules/auth/auth.module';
import { RolesModule } from './modules/roles/roles.module';
import { MonitoreoModule } from './modules/monitoreo/monitoreo.module';
import { ExportacionModule } from './modules/exportacion/exportacion.module';
import { GruaModule } from './modules/grua/grua.module';
import { PurgaModule } from './modules/purga/purga.module';
import { EquiposModule } from './modules/equipos/equipos.module';
import { ParadasModule } from './modules/paradas/paradas.module';
import { InstalacionModule } from './modules/instalacion/instalacion.module';
import { CampanasModule } from './modules/campanas/campanas.module';
import { AccesoModule } from './modules/acceso/acceso.module';
import { ElectricidadModule } from './modules/electricidad/electricidad.module';
import { IpamModule } from './modules/ipam/ipam.module';
import { IndicadoresModule } from './modules/indicadores/indicadores.module';
import { NotificacionesModule } from './modules/notificaciones/notificaciones.module';
import { UsersModule } from './modules/users/users.module';
import { LocationsModule } from './modules/locations/locations.module';
import { AssetsModule } from './modules/assets/assets.module';
import { NetworkModule } from './modules/network/network.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { IncidentsModule } from './modules/incidents/incidents.module';
import { TroubleshootingModule } from './modules/troubleshooting/troubleshooting.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { ChecklistModule } from './modules/checklist/checklist.module';
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
import { ZonasModule } from './modules/zonas/zonas.module';
import { ProcedimientosModule } from './modules/procedimientos/procedimientos.module';
import { EstandaresModule } from './modules/estandares/estandares.module';
import { RiesgoModule } from './modules/riesgo/riesgo.module';

@Module({
  imports: [
    RiesgoModule,
    EstandaresModule,
    ProcedimientosModule,
    ZonasModule,
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    LocationsModule,
    AssetsModule,
    MaintenanceModule,
    IncidentsModule,
    TroubleshootingModule,
    ChecklistModule,   // rutina preventiva por tipo de activo (3F-2)
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
    RolesModule,       // roles que crea el ingeniero + ámbito por tren (4C)
    MonitoreoModule,   // estado observado: montado y en espera de TI (bloque 8)
    NotificacionesModule, // avisos salientes: montado y apagado sin token (4F)
    ExportacionModule,    // descarga a Excel: temas sueltos y libro completo (11.1)
    GruaModule,           // inspeccion de camaras de grua: antena, cable, manlift (14)
    EquiposModule,        // registro de PCs conocidos: traduce IP -> sitio (15)
    ParadasModule,        // ventanas de parada: manuales, se mueven (16 / F8-F)
    InstalacionModule,    // instalar equipo nuevo por tipo de sitio (16)
    CampanasModule,       // campanas de mapeo: control de calidad del levantamiento (12.5)
    AccesoModule,         // que aparatos pueden entrar al sistema (18)
    ElectricidadModule,   // tableros, circuitos y que alimenta cada llave (18)
    IpamModule,           // direccionamiento IP: que IP le pongo, y que esta mal (20)
    IndicadoresModule,    // MTTR, MTBF, disponibilidad, backlog (22)
    PurgaModule,          // borrado definitivo de basura, solo el Jefe (15)
  ],
  controllers: [HealthController],
  providers: [
    // Seguridad por defecto en TODOS los endpoints:
    // 0) RitmoGuard limita el VOLUMEN de peticiones (12.2). Va PRIMERO a
    //    proposito: un bucle sin token valido se corta antes de gastar
    //    tiempo comprobando la firma del token.
    // 1) JwtAuthGuard valida el token (excepto rutas @Public).
    // 2) PermissionsGuard valida @RequirePermissions (pasa si no se exige ninguno).
    { provide: APP_GUARD, useClass: RitmoGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    // 3) AmbitoGuard: el ÚLTIMO a propósito. Sólo tiene sentido preguntarse
    //    "¿este activo es de tu tren?" cuando ya se sabe quién eres y que
    //    tienes permiso para leer activos. Consultar la base antes de eso
    //    sería trabajo tirado en cada petición sin token.
    { provide: APP_GUARD, useClass: AmbitoGuard },
    // 4) AccesoDispositivoGuard: ¿este APARATO puede entrar? Va el último y
    //    falla ABRIENDO a propósito — ver el comentario largo del guard.
    { provide: APP_GUARD, useClass: AccesoDispositivoGuard },
  ],
})
export class AppModule {}
