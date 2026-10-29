-- =========================================================================
--  BLOQUE 184 — FICHAS TÉCNICAS: LO QUE VE CADA CÁMARA, CON PRUEBA
--  -----------------------------------------------------------------------
--  Pedido de Cristhian: que el cono del mapa refleje lo que la cámara ve de
--  verdad (alcance, nitidez, zoom, infrarrojo), con datos que llena el
--  técnico «pero fehacientes».
--
--  · `fichas_opticas`: una por modelo y lente, con las distancias DORI COPIADAS
--    de la ficha del fabricante y su PDF obligatorio (`documentoId`). La
--    declara un técnico y la verifica otra persona.
--  · `asset_cameras.fichaOpticaId`: qué ficha tiene cada cámara.
--  · `posiciones_en_plano.zoom`: a qué zoom queda una PTZ o una varifocal.
--  · `modelos_equipo.declaradoPorId`: quién dio de alta el modelo.
--  · `DocumentCategory.FICHA_TECNICA`: el PDF como documento.
--
--  SQL generado por el motor de esquema de Prisma (el mismo que usa la CI),
--  no escrito a mano. Migración ADITIVA: no borra ni rellena nada.
-- =========================================================================

-- AlterEnum
ALTER TYPE "DocumentCategory" ADD VALUE 'FICHA_TECNICA';

-- AlterTable
ALTER TABLE "asset_cameras" ADD COLUMN     "fichaOpticaId" TEXT;

-- AlterTable
ALTER TABLE "modelos_equipo" ADD COLUMN     "declaradoPorId" TEXT;

-- AlterTable
ALTER TABLE "posiciones_en_plano" ADD COLUMN     "zoom" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "fichas_opticas" (
    "id" TEXT NOT NULL,
    "modeloId" TEXT NOT NULL,
    "lente" TEXT NOT NULL,
    "resolucionAncho" INTEGER NOT NULL,
    "resolucionAlto" INTEGER NOT NULL,
    "sensor" TEXT,
    "anguloH" DOUBLE PRECISION NOT NULL,
    "anguloV" DOUBLE PRECISION,
    "anguloHTele" DOUBLE PRECISION,
    "zoomOptico" DOUBLE PRECISION,
    "doriAnguloRef" DOUBLE PRECISION NOT NULL,
    "identificarM" DOUBLE PRECISION NOT NULL,
    "reconocerM" DOUBLE PRECISION NOT NULL,
    "observarM" DOUBLE PRECISION NOT NULL,
    "detectarM" DOUBLE PRECISION NOT NULL,
    "irM" DOUBLE PRECISION,
    "documentoId" TEXT NOT NULL,
    "declaradaPorId" TEXT,
    "declaradaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificadaPorId" TEXT,
    "verificadaEn" TIMESTAMP(3),
    "actualizadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fichas_opticas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fichas_opticas_documentoId_idx" ON "fichas_opticas"("documentoId");

-- CreateIndex
CREATE UNIQUE INDEX "fichas_opticas_modeloId_lente_key" ON "fichas_opticas"("modeloId", "lente");

-- CreateIndex
CREATE INDEX "asset_cameras_fichaOpticaId_idx" ON "asset_cameras"("fichaOpticaId");

-- AddForeignKey
ALTER TABLE "modelos_equipo" ADD CONSTRAINT "modelos_equipo_declaradoPorId_fkey" FOREIGN KEY ("declaradoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fichas_opticas" ADD CONSTRAINT "fichas_opticas_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "modelos_equipo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fichas_opticas" ADD CONSTRAINT "fichas_opticas_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fichas_opticas" ADD CONSTRAINT "fichas_opticas_declaradaPorId_fkey" FOREIGN KEY ("declaradaPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fichas_opticas" ADD CONSTRAINT "fichas_opticas_verificadaPorId_fkey" FOREIGN KEY ("verificadaPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_cameras" ADD CONSTRAINT "asset_cameras_fichaOpticaId_fkey" FOREIGN KEY ("fichaOpticaId") REFERENCES "fichas_opticas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

