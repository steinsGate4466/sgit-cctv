-- =============================================================================
--  F8-C / F8-D  ·  Estructura de proceso de LAMINACION
--  SGIT-CCTV · Aceros Arequipa · Planta Pisco
--
--  QUE HACE
--   1. Crea el enum Environment y el catalogo process_stages.
--   2. Anade el nivel ETAPA al arbol de ubicaciones.
--   3. Siembra las 12 etapas del proceso (palanquilla -> producto terminado).
--   4. Instancia esas etapas bajo CADA tren existente (1, 2 y 3).
--   5. TRADUCE los activos existentes: cada activo que hoy cuelga
--      directamente del tren se reubica en la etapa que le corresponde
--      segun su tipo. NINGUN activo pierde su ubicacion.
--
--  SEGURIDAD
--   - No borra ninguna columna ni tabla.
--   - Asset.train se conserva intacto (permite revertir sin perdida).
--   - Todos los INSERT son idempotentes (ON CONFLICT DO NOTHING).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Tipos nuevos
-- ---------------------------------------------------------------------------
ALTER TYPE "LocationType" ADD VALUE IF NOT EXISTS 'ETAPA';

DO $$ BEGIN
  CREATE TYPE "Environment" AS ENUM (
    'CALOR_RADIANTE',
    'VAPOR_AGUA',
    'POLVO_METALICO',
    'INTEMPERIE_SALINA',
    'EMI_ALTA',
    'CLIMATIZADO'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 2) Catalogo de etapas del proceso
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "process_stages" (
  "id"                  TEXT NOT NULL,
  "code"                TEXT NOT NULL,
  "name"                TEXT NOT NULL,
  "sequence"            INTEGER NOT NULL,
  "environment"         "Environment" NOT NULL,
  "baseCriticality"     "Criticality" NOT NULL,
  "defaultIntervalDays" INTEGER NOT NULL,
  "watches"             TEXT,
  "active"              BOOLEAN NOT NULL DEFAULT true,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "process_stages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "process_stages_code_key" ON "process_stages"("code");
CREATE INDEX IF NOT EXISTS "process_stages_sequence_idx" ON "process_stages"("sequence");

-- ---------------------------------------------------------------------------
-- 3) Nivel ETAPA en el arbol de ubicaciones
-- ---------------------------------------------------------------------------
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "stageId"     TEXT;
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "environment" "Environment";

DO $$ BEGIN
  ALTER TABLE "locations"
    ADD CONSTRAINT "locations_stageId_fkey"
    FOREIGN KEY ("stageId") REFERENCES "process_stages"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "locations_stageId_idx" ON "locations"("stageId");
