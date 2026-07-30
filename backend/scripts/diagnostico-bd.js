// ============================================================================
//  SGIT-CCTV — DIAGNOSTICO DE DESFASE ENTRE EL ESQUEMA Y LA BASE REAL
//
//  POR QUE EXISTE
//  El endpoint /dashboard/infra/tren/:code fallaba con P2022:
//    "The column work_orders.progressPct does not exist in the current database"
//  La columna SI esta en schema.prisma y SI la crea la migracion
//  20260729120000_om_ejecucion_campo. Es decir: el codigo esta bien y la BASE
//  DE PRODUCCION esta desfasada. Eso significa que puede faltar mucho mas que
//  una columna, y hay que saber QUE falta antes de tocar nada.
//
//  EL CI NO PODIA DETECTARLO: aplica las migraciones sobre una base LIMPIA, y
//  ahi todo funciona. Lo que no comprueba es si PRODUCCION recibio todas.
//
//  QUE HACE
//   1) Lee el registro de migraciones (_prisma_migrations) con su estado.
//   2) Compara las 42 tablas y 389 columnas que espera el esquema contra las
//      que existen de verdad.
//   3) Compara los 28 tipos enumerados.
//   4) Imprime SOLO las diferencias, y propone el orden de arreglo.
//
//  NO MODIFICA NADA. Es de solo lectura.
//
//  USO
//    cd backend
//    node scripts/diagnostico-bd.js "postgresql://usuario:clave@host:puerto/base"
//  o, si la variable ya esta en el entorno:
//    node scripts/diagnostico-bd.js
// ============================================================================
const { PrismaClient } = require('@prisma/client');

const ESPERADO = {"access_request_photos": ["caption", "createdAt", "fileId", "id", "requestId"], "access_requests": ["accessRoute", "assetId", "code", "createdAt", "decisionNotes", "eppDetail", "hasAts", "hasIperc", "heightMeters", "id", "justification", "locationKind", "means", "personnelCount", "productionImpact", "requestedById", "requiresPetar", "reviewedAt", "reviewedById", "risks", "status", "updatedAt"], "asset_cables": ["category", "code", "createdAt", "fromAssetId", "fromPortNumber", "id", "installedAt", "meters", "metersEstimated", "notes", "route", "shielded", "status", "toAssetId", "updatedAt"], "asset_cameras": ["assetId", "cameraStyle", "cameraUser", "ipAddress", "macAddress", "nvrChannel", "nvrId", "nvrName", "poeSourcePortId", "resolution", "rtspUrl", "switchPortId", "vlanId", "wirelessUplinkId"], "asset_decoders": ["assetId", "mgmtIp", "outputCount", "sourceNvrId"], "asset_history": ["assetId", "changedBy", "createdAt", "field", "id", "newValue", "oldValue"], "asset_nvrs": ["assetId", "capacityTb", "channels", "diskCount", "hasLocalDisk", "nicPrimary", "nicSecondary", "switchIdDirect"], "asset_pcs": ["assetId", "hostname", "ivmsVersion", "nvrsConfigured", "os", "videoOutputs"], "asset_photos": ["assetId", "caption", "createdAt", "fileId", "id", "kind"], "asset_screens": ["assetId", "label", "layout", "sizeInch", "sourceKind", "sourcePcAssetId"], "asset_switches": ["assetId", "mgmtIp", "mgmtNetwork", "poeBudgetW", "poePorts", "portCount", "switchRole", "vendor"], "asset_wireless": ["assetId", "destPoint", "frequency", "hasCredentials", "linkStable", "mode", "originPoint", "parentWirelessId", "signalDbm", "ssid", "switchPortId", "vendor"], "assets": ["assetCode", "brand", "cabinetId", "costCenter", "createdAt", "criticality", "deletedAt", "firmware", "id", "installDate", "ipAddress", "isDraft", "locationId", "mappedInWorkOrderId", "model", "referencePlace", "responsibleArea", "sapId", "serialNumber", "status", "train", "type", "updatedAt", "warrantyEnd"], "audit_logs": ["action", "after", "before", "createdAt", "entity", "entityId", "id", "ip", "userId"], "cabinets": ["code", "createdAt", "id", "locationId", "name", "notes", "photoFileId", "referencePlace", "updatedAt"], "credentials": ["assetId", "createdAt", "id", "secretEnc", "type", "username"], "decoder_outputs": ["decoderAssetId", "id", "number", "screenAssetId", "type"], "documents": ["assetId", "category", "createdAt", "fileId", "id", "locationId", "title", "uploadedBy", "version"], "incident_evidences": ["caption", "createdAt", "fileId", "id", "incidentId"], "incidents": ["affectedCameras", "assetId", "category", "code", "concurrentSessions", "description", "id", "interveners", "lineManagerNotified", "materials", "mttrMinutes", "observations", "priority", "proposal", "proposalCost", "proposalRisk", "reportedAt", "requiresThirdParty", "resolvedAt", "responsibleId", "responsibleName", "rootCause", "solution", "status", "title", "visionDownMin", "zone"], "locations": ["code", "costCenter", "createdAt", "environment", "howToGet", "id", "name", "parentId", "path", "photoFileId", "responsibleArea", "sapLocationCode", "stageId", "type", "updatedAt"], "network_links": ["description", "endpointAId", "endpointBId", "id", "isRing", "medium"], "permissions": ["code", "description", "id"], "preventive_plans": ["active", "assetId", "createdAt", "id", "intervalDays", "lastServiceAt", "nextDueAt", "updatedAt", "zoneCritical"], "process_stages": ["active", "baseCriticality", "code", "createdAt", "defaultIntervalDays", "environment", "id", "name", "sequence", "updatedAt", "watches"], "role_permissions": ["permissionId", "roleId"], "roles": ["description", "id", "name"], "screen_cells": ["cameraAssetId", "id", "position", "screenAssetId"], "spare_part_assets": ["assetId", "id", "sparePartId"], "spare_parts": ["brand", "category", "createdAt", "currentStock", "description", "id", "lastCheckedAt", "minStock", "model", "name", "sapCode", "unit", "updatedAt", "warehouse"], "stock_checks": ["checkedAt", "countedQty", "id", "note", "previousQty", "sparePartId", "userId"], "stock_movements": ["createdAt", "id", "quantity", "reason", "sapCode", "sparePartId", "type", "userId"], "switch_ports": ["assetSwitchId", "connectedAssetId", "id", "poe", "portNumber", "switchId", "vlanNumber"], "tools": ["active", "category", "code", "createdAt", "id", "name", "notes", "updatedAt"], "users": ["active", "createdAt", "email", "fullName", "id", "lastLoginAt", "passwordHash", "pinHash", "pinUpdatedAt", "roleId", "updatedAt"], "vlans": ["id", "name", "number", "role", "subnet"], "work_order_evidences": ["caption", "createdAt", "fileId", "id", "workOrderId"], "work_order_materials": ["createdAt", "description", "id", "plannedQty", "sapCode", "sparePartId", "unit", "updatedAt", "usedQty", "workOrderId"], "work_order_progress": ["id", "note", "pct", "reportedAt", "reportedById", "workOrderId"], "work_order_swaps": ["createdAt", "id", "installedAssetId", "note", "removedAssetId", "workOrderId"], "work_order_tools": ["carried", "id", "note", "toolId", "workOrderId"], "work_orders": ["activity", "assetId", "closedById", "code", "companionId", "condition", "createdAt", "diagnosis", "endedAt", "executedDate", "externalRef", "id", "incidentId", "isRecurrent", "locationId", "materials", "openedById", "plannedDurationMin", "plannedStopAt", "progressPct", "receivedAt", "requestChannel", "requestedBy", "responsible", "rootCause", "rootCauseNote", "scheduledDate", "spareParts", "startedAt", "status", "technicianId", "type", "updatedAt", "zone"]};

const ENUMS = ["AccessMeans", "AccessRequestStatus", "AssetStatus", "AssetType", "CableCategory", "CableRoute", "CableStatus", "Criticality", "DocumentCategory", "Environment", "IncidentCategory", "IncidentStatus", "LinkMedium", "LocationType", "MgmtNetwork", "MovementType", "PhotoKind", "PlantTrain", "Priority", "RequestChannel", "RootCause", "ScreenLayout", "ScreenSource", "SwitchRole", "VideoOutputType", "WirelessMode", "WorkOrderStatus", "WorkOrderType"];

const url = process.argv[2] || process.env.DATABASE_URL;
if (!url) {
  console.error('Falta la cadena de conexion. Pasala como argumento o en DATABASE_URL.');
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

// Nunca se imprime la cadena de conexion: lleva la contrasena.
function titulo(t) { console.log('\n' + '='.repeat(70) + '\n ' + t + '\n' + '='.repeat(70)); }

(async () => {
  try {
    // ------------------------------------------------- 1. migraciones
    titulo('REGISTRO DE MIGRACIONES');
    let migs = [];
    try {
      migs = await prisma.$queryRawUnsafe(
        `SELECT migration_name, applied_steps_count,
                finished_at IS NOT NULL AS terminada,
                rolled_back_at IS NOT NULL AS revertida
         FROM _prisma_migrations ORDER BY started_at ASC`);
    } catch (e) {
      console.log('  No se pudo leer _prisma_migrations: ' + e.message.split('\n')[0]);
    }
    for (const m of migs) {
      const estado = m.revertida ? 'REVERTIDA' : (m.terminada ? 'ok' : 'SIN TERMINAR');
      const marca = estado === 'ok' ? '  ' : '>>';
      console.log(`${marca} ${String(m.migration_name).padEnd(48)} ${estado}  pasos=${m.applied_steps_count}`);
    }
    const problematicas = migs.filter((m) => m.revertida || !m.terminada);

    // ------------------------------------------------- 2. tablas y columnas
    const filas = await prisma.$queryRawUnsafe(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
       ORDER BY table_name, column_name`);
    const real = {};
    for (const f of filas) {
      const t = f.table_name;
      if (!real[t]) real[t] = new Set();
      real[t].add(f.column_name);
    }

    titulo('TABLAS QUE FALTAN');
    const tablasFaltan = Object.keys(ESPERADO).filter((t) => !real[t]).sort();
    if (!tablasFaltan.length) console.log('  Ninguna. Las 42 tablas existen.');
    else tablasFaltan.forEach((t) => console.log('  FALTA tabla: ' + t));

    titulo('COLUMNAS QUE FALTAN');
    let totalCols = 0;
    for (const t of Object.keys(ESPERADO).sort()) {
      if (!real[t]) continue;
      const faltan = ESPERADO[t].filter((c) => !real[t].has(c));
      if (faltan.length) {
        console.log(`  ${t}:`);
        faltan.forEach((c) => console.log('      FALTA  ' + c));
        totalCols += faltan.length;
      }
    }
    if (!totalCols) console.log('  Ninguna. Las 389 columnas existen.');

    titulo('COLUMNAS DE SOBRA (existen en la base y no en el esquema)');
    let sobra = 0;
    for (const t of Object.keys(ESPERADO).sort()) {
      if (!real[t]) continue;
      const extra = [...real[t]].filter((c) => !ESPERADO[t].includes(c)).sort();
      if (extra.length) {
        console.log(`  ${t}: ` + extra.join(', '));
        sobra += extra.length;
      }
    }
    if (!sobra) console.log('  Ninguna.');
    else {
      console.log('  (No siempre son un problema. Dos casos distintos:');
      console.log('    - columnas conservadas a proposito, como assets.train;');
      console.log('    - listas escalares como tools.suggestedFor, que este');
      console.log('      comparador no cuenta como esperadas. Es un falso positivo');
      console.log('      mio, no un desfase.)');
    }

    // ------------------------------------------------- 3. enums
    titulo('TIPOS ENUMERADOS QUE FALTAN');
    const tipos = await prisma.$queryRawUnsafe(
      `SELECT t.typname FROM pg_type t
       JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE t.typtype = 'e' AND n.nspname = 'public'`);
    const existentes = new Set(tipos.map((x) => x.typname));
    const enumsFaltan = ENUMS.filter((e) => !existentes.has(e));
    if (!enumsFaltan.length) console.log('  Ninguno. Los 28 tipos existen.');
    else enumsFaltan.forEach((e) => console.log('  FALTA enum: ' + e));

    // ------------------------------------------------- 4. veredicto
    titulo('VEREDICTO');
    const roto = tablasFaltan.length + totalCols + enumsFaltan.length;
    if (!roto) {
      console.log('  La base coincide con el esquema. El desfase ya no existe.');
    } else {
      // Salir con error para que sirva en el CI: un desfase de produccion tiene
      // que romper la comprobacion, no solo imprimir un aviso que nadie lee.
      process.exitCode = 1;
      console.log(`  ${tablasFaltan.length} tabla(s), ${totalCols} columna(s) y ${enumsFaltan.length} enum(s) sin crear.`);
      console.log('');
      console.log('  Esto NO se arregla volviendo a lanzar las migraciones: las que');
      console.log('  aparecen como "ok" arriba no se vuelven a ejecutar. Hace falta una');
      console.log('  migracion de reparacion idempotente (ADD COLUMN IF NOT EXISTS), que');
      console.log('  funcione tanto en la base desfasada como en una limpia.');
      console.log('');
      console.log('  Copiame TODO este informe y te la preparo.');
    }
    if (problematicas.length) {
      console.log('');
      console.log('  ATENCION: hay migraciones marcadas REVERTIDA o SIN TERMINAR.');
      console.log('  Esa es la causa mas probable del desfase.');
    }
  } catch (e) {
    console.error('\nFALLO EL DIAGNOSTICO: ' + e.message.split('\n')[0]);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
