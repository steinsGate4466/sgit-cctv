-- ===========================================================================
-- BLOQUE 151 · PLANO VIVO — el plano real con cada equipo en su sitio
-- ===========================================================================
-- «Quiero como si fuese un plano real, ubicación exacta, métricas, para que
--  los técnicos vayan rápido» (usuario, 28/09/2026).
--
-- Dos tablas nuevas: `planos` (la imagen, su escala y su versión) y
-- `posiciones_en_plano` (dónde está cada equipo, en píxeles de la imagen).
--
-- ADITIVA E IDEMPOTENTE: no toca ni una fila existente.
-- ===========================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EstadoPlano') THEN
    CREATE TYPE "EstadoPlano" AS ENUM ('BORRADOR', 'PUBLICADO', 'ARCHIVADO');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "planos" (
  "id"             TEXT NOT NULL,
  "nombre"         TEXT NOT NULL,
  "locationId"     TEXT NOT NULL,
  "version"        INTEGER NOT NULL DEFAULT 1,
  "estado"         "EstadoPlano" NOT NULL DEFAULT 'BORRADOR',
  "archivoFileId"  TEXT NOT NULL,
  "archivoMime"    TEXT NOT NULL,
  "anchoPx"        INTEGER NOT NULL,
  "altoPx"         INTEGER NOT NULL,
  "metrosPorPx"    DOUBLE PRECISION,
  "rotacionNorte"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "notas"          TEXT,
  "creadoPorId"    TEXT,
  "publicadoPorId" TEXT,
  "publicadoEn"    TIMESTAMP(3),
  "creadoEn"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "planos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "planos_locationId_version_key" ON "planos"("locationId", "version");
CREATE INDEX IF NOT EXISTS "planos_estado_idx" ON "planos"("estado");

CREATE TABLE IF NOT EXISTS "posiciones_en_plano" (
  "planoId"       TEXT NOT NULL,
  "assetId"       TEXT NOT NULL,
  "xPx"           DOUBLE PRECISION NOT NULL,
  "yPx"           DOUBLE PRECISION NOT NULL,
  "alturaM"       DOUBLE PRECISION,
  "rumbo"         DOUBLE PRECISION,
  "anguloVision"  DOUBLE PRECISION,
  "alcanceM"      DOUBLE PRECISION,
  "colocadoPorId" TEXT,
  "colocadoEn"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "posiciones_en_plano_pkey" PRIMARY KEY ("planoId", "assetId")
);

CREATE INDEX IF NOT EXISTS "posiciones_en_plano_assetId_idx" ON "posiciones_en_plano"("assetId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planos_locationId_fkey') THEN
    ALTER TABLE "planos" ADD CONSTRAINT "planos_locationId_fkey"
      FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planos_creadoPorId_fkey') THEN
    ALTER TABLE "planos" ADD CONSTRAINT "planos_creadoPorId_fkey"
      FOREIGN KEY ("creadoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'planos_publicadoPorId_fkey') THEN
    ALTER TABLE "planos" ADD CONSTRAINT "planos_publicadoPorId_fkey"
      FOREIGN KEY ("publicadoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'posiciones_en_plano_planoId_fkey') THEN
    ALTER TABLE "posiciones_en_plano" ADD CONSTRAINT "posiciones_en_plano_planoId_fkey"
      FOREIGN KEY ("planoId") REFERENCES "planos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'posiciones_en_plano_assetId_fkey') THEN
    ALTER TABLE "posiciones_en_plano" ADD CONSTRAINT "posiciones_en_plano_assetId_fkey"
      FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'posiciones_en_plano_colocadoPorId_fkey') THEN
    ALTER TABLE "posiciones_en_plano" ADD CONSTRAINT "posiciones_en_plano_colocadoPorId_fkey"
      FOREIGN KEY ("colocadoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;
