-- Bloque 176 · zonas de riesgo dibujadas en el plano y trazado del cable.
-- Aditiva e idempotente: sólo crea; no toca nada de lo que ya existe.
DO $$ BEGIN
  CREATE TYPE "NivelRiesgoMapa" AS ENUM ('ALTO_RIESGO', 'ALTURA', 'ELECTRICO', 'CALOR', 'VITAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "zonas_de_riesgo" (
    "id" TEXT NOT NULL,
    "planoId" TEXT NOT NULL,
    "nivel" "NivelRiesgoMapa" NOT NULL,
    "nombre" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "puntos" JSONB NOT NULL,
    "dibujadoPorId" TEXT,
    "dibujadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "zonas_de_riesgo_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "zonas_de_riesgo_planoId_idx" ON "zonas_de_riesgo"("planoId");

CREATE TABLE IF NOT EXISTS "trazados_de_cable" (
    "planoId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "puntos" JSONB NOT NULL,
    "trazadoPorId" TEXT,
    "trazadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trazados_de_cable_pkey" PRIMARY KEY ("planoId","assetId")
);
CREATE INDEX IF NOT EXISTS "trazados_de_cable_assetId_idx" ON "trazados_de_cable"("assetId");

DO $$ BEGIN
  ALTER TABLE "zonas_de_riesgo" ADD CONSTRAINT "zonas_de_riesgo_planoId_fkey"
    FOREIGN KEY ("planoId") REFERENCES "planos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "trazados_de_cable" ADD CONSTRAINT "trazados_de_cable_planoId_fkey"
    FOREIGN KEY ("planoId") REFERENCES "planos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "trazados_de_cable" ADD CONSTRAINT "trazados_de_cable_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
