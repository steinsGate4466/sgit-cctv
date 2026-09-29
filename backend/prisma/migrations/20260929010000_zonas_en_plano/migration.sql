-- ===========================================================================
-- BLOQUE 165 · ZONAS DEL PLANO — sala eléctrica, púlpito, nave… sobre el mapa
-- ===========================================================================
-- «¿Cómo hago para ver por zonas, sala eléctrica y así, en todos lados y para
--  el Tren 2?» (usuario, 28/09/2026).
--
-- Una tabla nueva: `zonas_en_plano` (un polígono por ubicación y plano).
-- ADITIVA E IDEMPOTENTE: no toca ni una fila existente.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS "zonas_en_plano" (
  "id"            TEXT NOT NULL,
  "planoId"       TEXT NOT NULL,
  "locationId"    TEXT NOT NULL,
  "puntos"        JSONB NOT NULL,
  "dibujadoPorId" TEXT,
  "dibujadoEn"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "zonas_en_plano_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "zonas_en_plano_planoId_locationId_key" ON "zonas_en_plano"("planoId", "locationId");
CREATE INDEX IF NOT EXISTS "zonas_en_plano_locationId_idx" ON "zonas_en_plano"("locationId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'zonas_en_plano_planoId_fkey') THEN
    ALTER TABLE "zonas_en_plano" ADD CONSTRAINT "zonas_en_plano_planoId_fkey"
      FOREIGN KEY ("planoId") REFERENCES "planos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'zonas_en_plano_locationId_fkey') THEN
    ALTER TABLE "zonas_en_plano" ADD CONSTRAINT "zonas_en_plano_locationId_fkey"
      FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
