-- Bloque 2a: fichas por tipo de activo + tramos de cable
-- Aceros Arequipa - Planta Pisco - Laminacion
--
-- POR QUE
--   Hoy solo se puede registrar el activo BASE (codigo, marca, modelo,
--   ubicacion). No hay donde guardar el canal del grabador, el nombre que ve
--   el pulpito, de que puerto PoE se alimenta la camara, cuantos metros de
--   cable tiene ni si tenemos las credenciales de una antena.
--   Mapear 400 activos con eso produce 400 fichas vacias.
--
-- QUE INTRODUCE
--   * Tramos de CABLE entre dos puntos: categoria, metros (medido o estimado),
--     blindaje, ruta y estado. Base del aviso de los 90 m.
--   * DECODIFICADOR con sus salidas HDMI/VGA/DVI.
--   * PANTALLA como activo propio, con distribucion y que camara va en cada
--     cuadro. Traduce "el cuadro de arriba a la izquierda de la pantalla 2".
--   * PC del pulpito con iVMS-4200.
--   * Campos nuevos en camara, switch y antena.
--   * "Como llegar" en la ubicacion y marca de ficha incompleta en el activo.
--
-- Todo lo nuevo es NULO o con valor por defecto: ningun activo existente se
-- ve afectado.

-- AlterEnum
ALTER TYPE "AssetType" ADD VALUE 'PANTALLA';

-- CreateEnum
CREATE TYPE "CableCategory" AS ENUM ('CAT5E', 'CAT6', 'CAT6A', 'FIBRA_MONOMODO', 'FIBRA_MULTIMODO', 'COAXIAL', 'OTRO');

-- CreateEnum
CREATE TYPE "CableRoute" AS ENUM ('AEREA', 'CANALETA', 'BANDEJA', 'SUBTERRANEA', 'TUBERIA', 'INTEMPERIE');

-- CreateEnum
CREATE TYPE "CableStatus" AS ENUM ('INSTALADO', 'DANADO', 'A_REEMPLAZAR', 'RETIRADO');

-- CreateEnum
CREATE TYPE "VideoOutputType" AS ENUM ('HDMI', 'VGA', 'DVI', 'DISPLAYPORT', 'BNC');

-- CreateEnum
CREATE TYPE "ScreenLayout" AS ENUM ('UNO', 'DOS_X_DOS', 'TRES_X_TRES', 'CUATRO_X_CUATRO', 'OTRO');

-- CreateEnum
CREATE TYPE "ScreenSource" AS ENUM ('DECODIFICADOR', 'PC');

-- CreateEnum
CREATE TYPE "MgmtNetwork" AS ENUM ('GESTION', 'CAMARAS', 'OTRA');

-- AlterTable
ALTER TABLE "locations" ADD COLUMN     "howToGet" TEXT;

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "isDraft" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "asset_cameras" ADD COLUMN     "nvrChannel" INTEGER,
ADD COLUMN     "nvrName" TEXT,
ADD COLUMN     "cameraStyle" TEXT,
ADD COLUMN     "poeSourcePortId" TEXT;

-- AlterTable
ALTER TABLE "asset_switches" ADD COLUMN     "poePorts" INTEGER,
ADD COLUMN     "poeBudgetW" INTEGER,
ADD COLUMN     "mgmtNetwork" "MgmtNetwork";

-- AlterTable
ALTER TABLE "asset_wireless" ADD COLUMN     "ssid" TEXT,
ADD COLUMN     "hasCredentials" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "asset_cables" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "category" "CableCategory" NOT NULL,
    "meters" DOUBLE PRECISION,
    "metersEstimated" BOOLEAN NOT NULL DEFAULT true,
    "shielded" BOOLEAN NOT NULL DEFAULT false,
    "route" "CableRoute",
    "status" "CableStatus" NOT NULL DEFAULT 'INSTALADO',
    "fromAssetId" TEXT,
    "fromPortNumber" INTEGER,
    "toAssetId" TEXT,
    "installedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_cables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_decoders" (
    "assetId" TEXT NOT NULL,
    "outputCount" INTEGER,
    "sourceNvrId" TEXT,
    "mgmtIp" TEXT,

    CONSTRAINT "asset_decoders_pkey" PRIMARY KEY ("assetId")
);

-- CreateTable
CREATE TABLE "asset_screens" (
    "assetId" TEXT NOT NULL,
    "label" TEXT,
    "sizeInch" DOUBLE PRECISION,
    "layout" "ScreenLayout",
    "sourceKind" "ScreenSource",
    "sourcePcAssetId" TEXT,

    CONSTRAINT "asset_screens_pkey" PRIMARY KEY ("assetId")
);

-- CreateTable
CREATE TABLE "decoder_outputs" (
    "id" TEXT NOT NULL,
    "decoderAssetId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "type" "VideoOutputType" NOT NULL DEFAULT 'HDMI',
    "screenAssetId" TEXT,

    CONSTRAINT "decoder_outputs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "screen_cells" (
    "id" TEXT NOT NULL,
    "screenAssetId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "cameraAssetId" TEXT,

    CONSTRAINT "screen_cells_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_pcs" (
    "assetId" TEXT NOT NULL,
    "hostname" TEXT,
    "os" TEXT,
    "ivmsVersion" TEXT,
    "videoOutputs" INTEGER,
    "nvrsConfigured" TEXT,

    CONSTRAINT "asset_pcs_pkey" PRIMARY KEY ("assetId")
);

-- CreateIndex
CREATE INDEX "asset_cables_fromAssetId_idx" ON "asset_cables"("fromAssetId");

-- CreateIndex
CREATE INDEX "asset_cables_toAssetId_idx" ON "asset_cables"("toAssetId");

-- CreateIndex
CREATE INDEX "asset_cables_status_idx" ON "asset_cables"("status");

-- CreateIndex
CREATE UNIQUE INDEX "decoder_outputs_decoderAssetId_number_key" ON "decoder_outputs"("decoderAssetId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "screen_cells_screenAssetId_position_key" ON "screen_cells"("screenAssetId", "position");

-- AddForeignKey
ALTER TABLE "asset_cameras" ADD CONSTRAINT "asset_cameras_poeSourcePortId_fkey" FOREIGN KEY ("poeSourcePortId") REFERENCES "switch_ports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_cables" ADD CONSTRAINT "asset_cables_fromAssetId_fkey" FOREIGN KEY ("fromAssetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_cables" ADD CONSTRAINT "asset_cables_toAssetId_fkey" FOREIGN KEY ("toAssetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_decoders" ADD CONSTRAINT "asset_decoders_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_screens" ADD CONSTRAINT "asset_screens_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decoder_outputs" ADD CONSTRAINT "decoder_outputs_decoderAssetId_fkey" FOREIGN KEY ("decoderAssetId") REFERENCES "asset_decoders"("assetId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decoder_outputs" ADD CONSTRAINT "decoder_outputs_screenAssetId_fkey" FOREIGN KEY ("screenAssetId") REFERENCES "asset_screens"("assetId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screen_cells" ADD CONSTRAINT "screen_cells_screenAssetId_fkey" FOREIGN KEY ("screenAssetId") REFERENCES "asset_screens"("assetId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screen_cells" ADD CONSTRAINT "screen_cells_cameraAssetId_fkey" FOREIGN KEY ("cameraAssetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_pcs" ADD CONSTRAINT "asset_pcs_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
