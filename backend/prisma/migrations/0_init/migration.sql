-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('EMPRESA', 'PLANTA', 'TREN', 'AREA', 'SALA', 'ZONA', 'RACK');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('CAMERA', 'NVR', 'SWITCH', 'WIRELESS', 'ROUTER', 'FIREWALL', 'SERVER', 'UPS', 'FIBER', 'CABINET', 'DECODER', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('OPERATIVO', 'FUERA_SERVICIO', 'MANTENIMIENTO', 'BAJA', 'STOCK');

-- CreateEnum
CREATE TYPE "Criticality" AS ENUM ('BAJA', 'MEDIA', 'ALTA', 'CRITICA');

-- CreateEnum
CREATE TYPE "SwitchRole" AS ENUM ('CORE_ANILLO', 'DISTRIBUCION', 'AJENO', 'POE_ACCESO');

-- CreateEnum
CREATE TYPE "WirelessMode" AS ENUM ('PMP_BASE', 'SUSCRIPTOR', 'PTP', 'ESTACION');

-- CreateEnum
CREATE TYPE "LinkMedium" AS ENUM ('FIBRA', 'COBRE', 'INALAMBRICO');

-- CreateEnum
CREATE TYPE "WorkOrderType" AS ENUM ('PREVENTIVO', 'CORRECTIVO', 'MEJORA');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('ABIERTA', 'EN_PROCESO', 'EN_ESPERA', 'CERRADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('BAJA', 'MEDIA', 'ALTA', 'CRITICA');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('ABIERTA', 'EN_DIAGNOSTICO', 'EN_PROCESO', 'RESUELTA', 'CERRADA');

-- CreateEnum
CREATE TYPE "IncidentCategory" AS ENUM ('GENERAL', 'SATURACION_SESIONES_NVR', 'CAIDA_ENLACE_INALAMBRICO', 'FALLA_ALMACENAMIENTO_NVR', 'DECODER_VIDEOWALL', 'CAMARA_SIN_IMAGEN', 'RED');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('MANUAL', 'DIAGRAMA', 'PLANO', 'FOTO', 'CONFIG', 'BACKUP');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "roleId" TEXT NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "type" "LocationType" NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "path" TEXT NOT NULL DEFAULT '',
    "sapLocationCode" TEXT,
    "costCenter" TEXT,
    "responsibleArea" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "assetCode" TEXT NOT NULL,
    "type" "AssetType" NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "firmware" TEXT,
    "status" "AssetStatus" NOT NULL DEFAULT 'OPERATIVO',
    "criticality" "Criticality" NOT NULL DEFAULT 'MEDIA',
    "installDate" TIMESTAMP(3),
    "warrantyEnd" TIMESTAMP(3),
    "locationId" TEXT,
    "sapId" TEXT,
    "costCenter" TEXT,
    "responsibleArea" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_cameras" (
    "assetId" TEXT NOT NULL,
    "resolution" TEXT,
    "cameraUser" TEXT,
    "rtspUrl" TEXT,
    "ipAddress" TEXT,
    "macAddress" TEXT,
    "vlanId" TEXT,
    "nvrId" TEXT,
    "switchPortId" TEXT,
    "wirelessUplinkId" TEXT,

    CONSTRAINT "asset_cameras_pkey" PRIMARY KEY ("assetId")
);

-- CreateTable
CREATE TABLE "asset_nvrs" (
    "assetId" TEXT NOT NULL,
    "channels" INTEGER,
    "diskCount" INTEGER,
    "capacityTb" DOUBLE PRECISION,
    "hasLocalDisk" BOOLEAN NOT NULL DEFAULT false,
    "switchIdDirect" TEXT,
    "nicPrimary" TEXT,
    "nicSecondary" TEXT,

    CONSTRAINT "asset_nvrs_pkey" PRIMARY KEY ("assetId")
);

-- CreateTable
CREATE TABLE "asset_switches" (
    "assetId" TEXT NOT NULL,
    "portCount" INTEGER,
    "mgmtIp" TEXT,
    "vendor" TEXT,
    "switchRole" "SwitchRole" NOT NULL DEFAULT 'DISTRIBUCION',

    CONSTRAINT "asset_switches_pkey" PRIMARY KEY ("assetId")
);

-- CreateTable
CREATE TABLE "asset_wireless" (
    "assetId" TEXT NOT NULL,
    "vendor" TEXT,
    "frequency" TEXT,
    "mode" "WirelessMode" NOT NULL DEFAULT 'SUSCRIPTOR',
    "parentWirelessId" TEXT,
    "switchPortId" TEXT,
    "originPoint" TEXT,
    "destPoint" TEXT,
    "signalDbm" INTEGER,
    "linkStable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "asset_wireless_pkey" PRIMARY KEY ("assetId")
);

-- CreateTable
CREATE TABLE "vlans" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "subnet" TEXT,
    "role" TEXT,

    CONSTRAINT "vlans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "switch_ports" (
    "id" TEXT NOT NULL,
    "switchId" TEXT NOT NULL,
    "assetSwitchId" TEXT,
    "portNumber" INTEGER NOT NULL,
    "poe" BOOLEAN NOT NULL DEFAULT false,
    "vlanNumber" INTEGER,
    "connectedAssetId" TEXT,

    CONSTRAINT "switch_ports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_links" (
    "id" TEXT NOT NULL,
    "medium" "LinkMedium" NOT NULL,
    "endpointAId" TEXT NOT NULL,
    "endpointBId" TEXT NOT NULL,
    "isRing" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,

    CONSTRAINT "network_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credentials" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "secretEnc" TEXT NOT NULL,
    "type" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_orders" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "type" "WorkOrderType" NOT NULL,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'ABIERTA',
    "technicianId" TEXT,
    "scheduledDate" TIMESTAMP(3),
    "executedDate" TIMESTAMP(3),
    "activity" TEXT,
    "diagnosis" TEXT,
    "spareParts" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_evidences" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_evidences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "IncidentCategory" NOT NULL DEFAULT 'GENERAL',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIA',
    "status" "IncidentStatus" NOT NULL DEFAULT 'ABIERTA',
    "assetId" TEXT,
    "responsibleId" TEXT,
    "rootCause" TEXT,
    "concurrentSessions" INTEGER,
    "affectedCameras" INTEGER,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "visionDownMin" INTEGER,
    "mttrMinutes" INTEGER,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "DocumentCategory" NOT NULL,
    "fileId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "assetId" TEXT,
    "locationId" TEXT,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_history" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "locations_code_key" ON "locations"("code");

-- CreateIndex
CREATE INDEX "locations_parentId_idx" ON "locations"("parentId");

-- CreateIndex
CREATE INDEX "locations_path_idx" ON "locations"("path");

-- CreateIndex
CREATE UNIQUE INDEX "assets_assetCode_key" ON "assets"("assetCode");

-- CreateIndex
CREATE UNIQUE INDEX "assets_sapId_key" ON "assets"("sapId");

-- CreateIndex
CREATE INDEX "assets_type_idx" ON "assets"("type");

-- CreateIndex
CREATE INDEX "assets_status_idx" ON "assets"("status");

-- CreateIndex
CREATE INDEX "assets_locationId_idx" ON "assets"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "asset_cameras_switchPortId_key" ON "asset_cameras"("switchPortId");

-- CreateIndex
CREATE UNIQUE INDEX "asset_wireless_switchPortId_key" ON "asset_wireless"("switchPortId");

-- CreateIndex
CREATE UNIQUE INDEX "vlans_number_key" ON "vlans"("number");

-- CreateIndex
CREATE UNIQUE INDEX "switch_ports_connectedAssetId_key" ON "switch_ports"("connectedAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "switch_ports_switchId_portNumber_key" ON "switch_ports"("switchId", "portNumber");

-- CreateIndex
CREATE UNIQUE INDEX "work_orders_code_key" ON "work_orders"("code");

-- CreateIndex
CREATE INDEX "work_orders_assetId_idx" ON "work_orders"("assetId");

-- CreateIndex
CREATE INDEX "work_orders_status_idx" ON "work_orders"("status");

-- CreateIndex
CREATE UNIQUE INDEX "incidents_code_key" ON "incidents"("code");

-- CreateIndex
CREATE INDEX "incidents_assetId_idx" ON "incidents"("assetId");

-- CreateIndex
CREATE INDEX "incidents_status_idx" ON "incidents"("status");

-- CreateIndex
CREATE INDEX "incidents_category_idx" ON "incidents"("category");

-- CreateIndex
CREATE INDEX "documents_assetId_idx" ON "documents"("assetId");

-- CreateIndex
CREATE INDEX "documents_locationId_idx" ON "documents"("locationId");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "asset_history_assetId_idx" ON "asset_history"("assetId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_cameras" ADD CONSTRAINT "asset_cameras_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_cameras" ADD CONSTRAINT "asset_cameras_vlanId_fkey" FOREIGN KEY ("vlanId") REFERENCES "vlans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_cameras" ADD CONSTRAINT "asset_cameras_switchPortId_fkey" FOREIGN KEY ("switchPortId") REFERENCES "switch_ports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_nvrs" ADD CONSTRAINT "asset_nvrs_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_switches" ADD CONSTRAINT "asset_switches_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_wireless" ADD CONSTRAINT "asset_wireless_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_wireless" ADD CONSTRAINT "asset_wireless_switchPortId_fkey" FOREIGN KEY ("switchPortId") REFERENCES "switch_ports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "switch_ports" ADD CONSTRAINT "switch_ports_switchId_fkey" FOREIGN KEY ("switchId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "switch_ports" ADD CONSTRAINT "switch_ports_assetSwitchId_fkey" FOREIGN KEY ("assetSwitchId") REFERENCES "asset_switches"("assetId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "switch_ports" ADD CONSTRAINT "switch_ports_connectedAssetId_fkey" FOREIGN KEY ("connectedAssetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_links" ADD CONSTRAINT "network_links_endpointAId_fkey" FOREIGN KEY ("endpointAId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_links" ADD CONSTRAINT "network_links_endpointBId_fkey" FOREIGN KEY ("endpointBId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_evidences" ADD CONSTRAINT "work_order_evidences_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_history" ADD CONSTRAINT "asset_history_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

