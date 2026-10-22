-- Bloque 180 · aviso → OM de SAP (decisiones de Cristhian del 22/10/2026).
-- Aditiva e idempotente: sólo añade; no toca nada de lo que ya existe.

-- La clase del aviso: ¿el equipo funciona?
DO $$ BEGIN
  CREATE TYPE "TipoAviso" AS ENUM ('FALLA', 'CONDICION', 'SOLICITUD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "tipoAviso" "TipoAviso";
ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "avisoSap" TEXT;
CREATE INDEX IF NOT EXISTS "incidents_avisoSap_idx" ON "incidents"("avisoSap");

-- El N° de la OM de SAP ya existía (`externalRef`); ahora se busca por él.
CREATE INDEX IF NOT EXISTS "work_orders_externalRef_idx" ON "work_orders"("externalRef");

-- Instalación: tipo propio, fuera del reparto. Al final del enum.
ALTER TYPE "WorkOrderType" ADD VALUE IF NOT EXISTS 'INSTALACION';

-- La inspección de grúa levanta un aviso, no una OM.
ALTER TABLE "inspecciones_grua" ADD COLUMN IF NOT EXISTS "incidentId" TEXT;
CREATE INDEX IF NOT EXISTS "inspecciones_grua_incidentId_idx" ON "inspecciones_grua"("incidentId");
DO $$ BEGIN
  ALTER TABLE "inspecciones_grua" ADD CONSTRAINT "inspecciones_grua_incidentId_fkey"
    FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
