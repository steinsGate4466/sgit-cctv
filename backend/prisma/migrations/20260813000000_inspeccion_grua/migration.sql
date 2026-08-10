-- Bloque 14: inspeccion de camaras de grua.
-- Idempotente y NO destructiva: solo crea.
-- Los enums se crean con IF NOT EXISTS via DO para poder reejecutar sin error.

DO $$ BEGIN
  CREATE TYPE "ComponenteEstado" AS ENUM ('NO_REVISADO', 'CONFORME', 'OBSERVADO', 'NO_CONFORME');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ResultadoInspeccion" AS ENUM ('OPERATIVA', 'OPERATIVA_CON_OBSERVACIONES', 'FUERA_DE_SERVICIO', 'NO_SE_PUDO_ACCEDER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "inspecciones_grua" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "workOrderId" TEXT,
    "grua" TEXT NOT NULL,
    "posicionEnGrua" TEXT,
    "requiereManlift" BOOLEAN NOT NULL DEFAULT true,
    "alturaMetros" DOUBLE PRECISION,
    "seBajaAPiso" BOOLEAN NOT NULL DEFAULT false,
    "requiereParada" BOOLEAN NOT NULL DEFAULT false,
    "accessRequestId" TEXT,
    "camaraEstado" "ComponenteEstado" NOT NULL DEFAULT 'NO_REVISADO',
    "camaraObs" TEXT,
    "lenteSucio" BOOLEAN NOT NULL DEFAULT false,
    "carcasaDanada" BOOLEAN NOT NULL DEFAULT false,
    "soporteFlojo" BOOLEAN NOT NULL DEFAULT false,
    "antenaAssetId" TEXT,
    "antenaEstado" "ComponenteEstado" NOT NULL DEFAULT 'NO_REVISADO',
    "senalDbm" INTEGER,
    "senalDbmAnterior" INTEGER,
    "antenaAlineada" BOOLEAN NOT NULL DEFAULT true,
    "antenaObs" TEXT,
    "cableEstado" "ComponenteEstado" NOT NULL DEFAULT 'NO_REVISADO',
    "enCadenaPortacables" BOOLEAN NOT NULL DEFAULT false,
    "chicoteDanado" BOOLEAN NOT NULL DEFAULT false,
    "prensaestopaOk" BOOLEAN NOT NULL DEFAULT true,
    "conectorOxidado" BOOLEAN NOT NULL DEFAULT false,
    "metrosAproximados" DOUBLE PRECISION,
    "cableObs" TEXT,
    "alimentacionEstado" "ComponenteEstado" NOT NULL DEFAULT 'NO_REVISADO',
    "poe" BOOLEAN NOT NULL DEFAULT true,
    "fuenteAssetId" TEXT,
    "alimentacionObs" TEXT,
    "grabadorLocal" BOOLEAN NOT NULL DEFAULT false,
    "nvrAssetId" TEXT,
    "canalNvr" INTEGER,
    "grabaOk" BOOLEAN NOT NULL DEFAULT true,
    "diasRetencion" INTEGER,
    "grabacionObs" TEXT,
    "gabineteEstado" "ComponenteEstado" NOT NULL DEFAULT 'NO_REVISADO',
    "gabineteHermetico" BOOLEAN NOT NULL DEFAULT true,
    "gabineteObs" TEXT,
    "resultado" "ResultadoInspeccion" NOT NULL DEFAULT 'OPERATIVA',
    "hallazgos" TEXT,
    "accionesRealizadas" TEXT,
    "requiereSeguimiento" BOOLEAN NOT NULL DEFAULT false,
    "proximaRevision" TIMESTAMP(3),
    "inspeccionadoPorId" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "inspecciones_grua_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "inspecciones_grua_code_key" ON "inspecciones_grua"("code");
CREATE INDEX IF NOT EXISTS "inspecciones_grua_assetId_idx" ON "inspecciones_grua"("assetId");
CREATE INDEX IF NOT EXISTS "inspecciones_grua_grua_idx" ON "inspecciones_grua"("grua");
CREATE INDEX IF NOT EXISTS "inspecciones_grua_fecha_idx" ON "inspecciones_grua"("fecha");

-- Prisma SIEMPRE emite ON DELETE y ON UPDATE. Si se omiten, `verificar:migraciones`
-- y la CI detectan desfase. Ya paso dos veces.
DO $$ BEGIN
  ALTER TABLE "inspecciones_grua" ADD CONSTRAINT "inspecciones_grua_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "inspecciones_grua" ADD CONSTRAINT "inspecciones_grua_workOrderId_fkey"
    FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "inspecciones_grua" ADD CONSTRAINT "inspecciones_grua_inspeccionadoPorId_fkey"
    FOREIGN KEY ("inspeccionadoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
