-- Bloque 174 · el límite de peticiones COMPARTIDO entre instancias.
-- Aditiva e idempotente: se puede lanzar dos veces sin romper nada.

-- CreateTable
CREATE TABLE IF NOT EXISTS "limite_peticiones" (
    "clave" TEXT NOT NULL,
    "ventana" BIGINT NOT NULL,
    "n" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "limite_peticiones_pkey" PRIMARY KEY ("clave","ventana")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "limite_peticiones_ventana_idx" ON "limite_peticiones"("ventana");
