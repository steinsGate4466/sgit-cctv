-- Zona productiva (Tren) como dato explícito del activo — F7.3

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PlantTrain" AS ENUM ('TREN_1', 'TREN_2', 'TREN_3', 'PATIO', 'PLANTA_GENERAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "train" "PlantTrain";

-- CreateIndex
CREATE INDEX IF NOT EXISTS "assets_train_idx" ON "assets"("train");

-- Backfill: los activos ya registrados heredan el tren desde la ruta de su ubicación
-- (AASA/PISCO/T1 → TREN_1). Así no se pierde la clasificación existente.
UPDATE "assets" a SET "train" = 'TREN_1'
  FROM "locations" l WHERE a."locationId" = l."id" AND a."train" IS NULL AND l."path" LIKE '%/T1%';
UPDATE "assets" a SET "train" = 'TREN_2'
  FROM "locations" l WHERE a."locationId" = l."id" AND a."train" IS NULL AND l."path" LIKE '%/T2%';
UPDATE "assets" a SET "train" = 'TREN_3'
  FROM "locations" l WHERE a."locationId" = l."id" AND a."train" IS NULL AND l."path" LIKE '%/T3%';
