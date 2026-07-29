-- Bloque 1: ejecucion de OM en campo
-- Aceros Arequipa - Planta Pisco - Laminacion
--
-- Que introduce:
--   * Tipo de orden MAPEO (el levantamiento de activos tambien es una OM).
--   * Recepcion: quien la pidio, por que via, cuando y su numero de SAP.
--   * Hora ESTIMADA de parada al crear + horas REALES al ejecutar.
--   * Firma de apertura y de cierre + acompanante declarado.
--   * Causa de cierre (lista) y marca de reincidencia.
--   * PIN por usuario para reanudar en campo.
--   * Trazabilidad: que activos se levantaron en que orden de mapeo.
--
-- Todos los campos nuevos son NULOS: ninguna orden existente se ve afectada.

-- AlterEnum
ALTER TYPE "WorkOrderType" ADD VALUE 'MAPEO';

-- CreateEnum
CREATE TYPE "RequestChannel" AS ENUM ('SAP', 'WHATSAPP', 'RADIO', 'CORREO', 'VERBAL', 'SISTEMA');

-- CreateEnum
CREATE TYPE "RootCause" AS ENUM ('ENERGIA_CORTE', 'FUENTE_POE', 'CABLE_DANADO', 'CABLE_FUERA_NORMA', 'CONECTOR', 'EQUIPO_QUEMADO', 'EQUIPO_FIN_VIDA', 'PUERTO_SWITCH', 'ENLACE_INALAMBRICO', 'SATURACION_NVR', 'DISCO_NVR', 'CONFIGURACION', 'FIRMWARE', 'AMBIENTAL', 'GOLPE_VANDALISMO', 'SIN_FALLA_ENCONTRADA', 'OTRO');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "pinHash" TEXT,
ADD COLUMN     "pinUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "mappedInWorkOrderId" TEXT;

-- El activo pasa de OBLIGATORIO a OPCIONAL en la orden.
-- La clave foranea hay que rehacerla: en Prisma una relacion obligatoria usa
-- ON DELETE RESTRICT y una opcional usa ON DELETE SET NULL. Si no se rehace,
-- el esquema y la base quedan desincronizados y el CI lo detecta.
ALTER TABLE "work_orders" DROP CONSTRAINT "work_orders_assetId_fkey";

-- AlterTable
ALTER TABLE "work_orders" ALTER COLUMN "assetId" DROP NOT NULL,
ADD COLUMN     "locationId" TEXT,
ADD COLUMN     "requestedBy" TEXT,
ADD COLUMN     "requestChannel" "RequestChannel",
ADD COLUMN     "receivedAt" TIMESTAMP(3),
ADD COLUMN     "externalRef" TEXT,
ADD COLUMN     "plannedStopAt" TIMESTAMP(3),
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "endedAt" TIMESTAMP(3),
ADD COLUMN     "openedById" TEXT,
ADD COLUMN     "closedById" TEXT,
ADD COLUMN     "companionId" TEXT,
ADD COLUMN     "rootCause" "RootCause",
ADD COLUMN     "rootCauseNote" TEXT,
ADD COLUMN     "isRecurrent" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "work_orders_locationId_idx" ON "work_orders"("locationId");

-- CreateIndex
CREATE INDEX "work_orders_type_status_idx" ON "work_orders"("type", "status");

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_companionId_fkey" FOREIGN KEY ("companionId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_mappedInWorkOrderId_fkey" FOREIGN KEY ("mappedInWorkOrderId") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
