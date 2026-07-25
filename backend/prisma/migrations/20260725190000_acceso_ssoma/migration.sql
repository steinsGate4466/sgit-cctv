-- Accesibilidad / trabajo en altura (SSOMA) — F6.9
-- Solicitudes de manlift/izaje con sustento fotográfico y aprobación del Jefe.

-- CreateEnum
CREATE TYPE "AccessMeans" AS ENUM ('MANLIFT', 'GRUA', 'ANDAMIO', 'ESCALERA', 'LINEA_VIDA', 'OTRO');

-- CreateEnum
CREATE TYPE "AccessRequestStatus" AS ENUM ('SOLICITADO', 'EN_REVISION', 'APROBADO', 'RECHAZADO');

-- CreateTable
CREATE TABLE "access_requests" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "requestedById" TEXT,
    "heightMeters" DOUBLE PRECISION,
    "means" "AccessMeans" NOT NULL DEFAULT 'MANLIFT',
    "locationKind" TEXT,
    "justification" TEXT NOT NULL,
    "accessRoute" TEXT,
    "requiresPetar" BOOLEAN NOT NULL DEFAULT true,
    "hasIperc" BOOLEAN NOT NULL DEFAULT false,
    "hasAts" BOOLEAN NOT NULL DEFAULT false,
    "personnelCount" INTEGER DEFAULT 2,
    "eppDetail" TEXT,
    "risks" TEXT,
    "productionImpact" TEXT,
    "status" "AccessRequestStatus" NOT NULL DEFAULT 'SOLICITADO',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "decisionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "access_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_request_photos" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_request_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "access_requests_code_key" ON "access_requests"("code");

-- CreateIndex
CREATE INDEX "access_requests_assetId_idx" ON "access_requests"("assetId");

-- CreateIndex
CREATE INDEX "access_requests_status_idx" ON "access_requests"("status");

-- CreateIndex
CREATE INDEX "access_request_photos_requestId_idx" ON "access_request_photos"("requestId");

-- AddForeignKey
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_request_photos" ADD CONSTRAINT "access_request_photos_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "access_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
