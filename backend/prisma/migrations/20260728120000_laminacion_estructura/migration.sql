-- Estructura de proceso de LAMINACION (F8)
-- Aceros Arequipa - Planta Pisco
--
-- Crea SOLO la estructura vacia. El catalogo de etapas lo llena el Jefe de
-- Mantenimiento desde el modulo de Ubicaciones, con los nombres reales del
-- tren. Esta migracion NO inserta ningun dato.

-- AlterEnum
ALTER TYPE "LocationType" ADD VALUE 'ETAPA';

-- CreateEnum
CREATE TYPE "Environment" AS ENUM ('CALOR_RADIANTE', 'VAPOR_AGUA', 'POLVO_METALICO', 'INTEMPERIE_SALINA', 'EMI_ALTA', 'CLIMATIZADO');

-- AlterTable
ALTER TABLE "locations" ADD COLUMN     "environment" "Environment",
ADD COLUMN     "stageId" TEXT;

-- CreateTable
CREATE TABLE "process_stages" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "environment" "Environment" NOT NULL,
    "baseCriticality" "Criticality" NOT NULL,
    "defaultIntervalDays" INTEGER NOT NULL,
    "watches" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "process_stages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "process_stages_code_key" ON "process_stages"("code");

-- CreateIndex
CREATE INDEX "process_stages_sequence_idx" ON "process_stages"("sequence");

-- CreateIndex
CREATE INDEX "locations_stageId_idx" ON "locations"("stageId");

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "process_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
