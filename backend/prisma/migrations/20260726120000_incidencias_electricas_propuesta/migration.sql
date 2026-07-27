-- Incidencias: categorías eléctricas de planta + propuesta técnica de solución (F7.2)

-- AlterEnum: categorías eléctricas específicas
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'TABLERO_ELECTRICO';
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'VARIACION_TENSION';
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'PUESTA_A_TIERRA';
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'CORTOCIRCUITO';
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'SOBRECARGA';
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'CABLEADO_ELECTRICO';
ALTER TYPE "IncidentCategory" ADD VALUE IF NOT EXISTS 'TRANSFORMADOR';

-- AlterTable: propuesta de solución documentada
ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "proposal" TEXT;
ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "proposalCost" TEXT;
ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "proposalRisk" TEXT;
ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "requiresThirdParty" BOOLEAN NOT NULL DEFAULT false;
