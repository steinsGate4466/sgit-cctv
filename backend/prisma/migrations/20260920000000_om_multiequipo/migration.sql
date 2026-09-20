-- =============================================================================
--  BLOQUE 110-A · UNA ORDEN PUEDE TOCAR VARIOS EQUIPOS
-- =============================================================================
--  ADITIVA. No se toca ni una columna de `work_orders`: `assetId` se queda como
--  el equipo PRINCIPAL y esta tabla añade los demás. Lo leen 353 rutas; moverlo
--  sería otro bloque, con riesgo en cada esquina.
--
--  IDEMPOTENTE DE PRINCIPIO A FIN. La lección del bloque 105 salió cara: una
--  migración que falla a medias deja índices creados y, al reintentar, revienta
--  con 42P07. Aquí todo lleva `IF NOT EXISTS` y el traspaso va con
--  `ON CONFLICT DO NOTHING`, así que volver a pasarla no rompe ni duplica.
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE "PapelEnOm" AS ENUM ('REPORTADO', 'INTERVENIDO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "om_equipos" (
  "id"            TEXT NOT NULL,
  "workOrderId"   TEXT NOT NULL,
  "assetId"       TEXT NOT NULL,
  "papel"         "PapelEnOm" NOT NULL,
  "accionCode"    TEXT,
  "nota"          TEXT,
  "apuntadoPorId" TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "om_equipos_pkey" PRIMARY KEY ("id")
);

-- El mismo equipo, en la misma orden, con el mismo papel, UNA vez.
CREATE UNIQUE INDEX IF NOT EXISTS "om_equipos_workOrderId_assetId_papel_key"
  ON "om_equipos" ("workOrderId", "assetId", "papel");
CREATE INDEX IF NOT EXISTS "om_equipos_workOrderId_idx" ON "om_equipos" ("workOrderId");
-- «¿En qué órdenes sale esta cámara?»: lo suyo, por fecha (bloque 105).
CREATE INDEX IF NOT EXISTS "om_equipos_assetId_createdAt_idx" ON "om_equipos" ("assetId", "createdAt");
CREATE INDEX IF NOT EXISTS "om_equipos_createdAt_idx" ON "om_equipos" ("createdAt");

DO $$ BEGIN
  ALTER TABLE "om_equipos" ADD CONSTRAINT "om_equipos_workOrderId_fkey"
    FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "om_equipos" ADD CONSTRAINT "om_equipos_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "om_equipos" ADD CONSTRAINT "om_equipos_apuntadoPorId_fkey"
    FOREIGN KEY ("apuntadoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
--  TRASPASO DE LO QUE YA HAY
-- =============================================================================
--  TRES ORÍGENES, Y SÓLO TRES. Lo que no está escrito en la base NO se inventa:
--  una orden sin equipo asignado se queda sin fila de REPORTADO, porque
--  rellenarla con el equipo intervenido diría que Producción reportó algo que
--  quizá nunca reportó — y ese dato inventado viajaría después a un informe.

-- 1 · El equipo principal de cada orden: se tocó, luego es INTERVENIDO.
INSERT INTO "om_equipos" ("id", "workOrderId", "assetId", "papel", "createdAt")
SELECT gen_random_uuid(), w."id", w."assetId", 'INTERVENIDO', w."createdAt"
FROM "work_orders" w
WHERE w."assetId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- 2 · El equipo que el ingeniero ASIGNÓ al abrir: eso es lo REPORTADO.
--     Cuando difiere del principal, la orden ya cuenta la historia entera:
--     se pidió A y se tocó B. Ese cruce es justo lo que el bloque viene a
--     conservar y hasta hoy sólo vivía en un booleano (`scopeChanged`).
INSERT INTO "om_equipos" ("id", "workOrderId", "assetId", "papel", "createdAt")
SELECT gen_random_uuid(), w."id", w."assignedAssetId", 'REPORTADO', w."createdAt"
FROM "work_orders" w
WHERE w."assignedAssetId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- 3 · Los activos levantados en una orden de MAPEO. AQUÍ ESTÁ EL GRUESO DE LO
--     QUE FALTABA: una campaña que levantó 12 cámaras contaba como UNA orden
--     sobre un solo equipo. A partir de esta fila, cuenta las 12.
INSERT INTO "om_equipos" ("id", "workOrderId", "assetId", "papel", "createdAt")
SELECT gen_random_uuid(), a."mappedInWorkOrderId", a."id", 'INTERVENIDO', a."createdAt"
FROM "assets" a
WHERE a."mappedInWorkOrderId" IS NOT NULL
ON CONFLICT DO NOTHING;
