-- ============================================================================
--  EL INGENIERO ASIGNA, EL TECNICO DE RED DETALLA  (bloque 4A)
--
--  EL PROBLEMA MEDIDO
--  El alta de una orden tenia 15 campos, y los rellenaba el ingeniero. Pero el
--  ingeniero no sabe cual camara exactamente, ni que tramo, ni que materiales:
--  eso lo sabe el tecnico de red. Obligarle a rellenarlo le hacia inventar
--  datos que despues alguien corregia.
--
--  EL MODELO NUEVO
--    ASIGNAR (ingeniero): que hay que hacer, sobre que, a quien, para cuando.
--    DETALLAR (tecnico de red): equipo exacto, materiales, herramientas.
--    EJECUTAR: lo que ya existia.
--
--  POR QUE NO HAY UN ESTADO NUEVO EN EL ENUM
--  En PostgreSQL los valores de un enum solo se pueden anadir AL FINAL. Meter
--  ASIGNADA antes de ABIERTA obligaria a recrear el tipo con todas las
--  columnas y vistas que cuelgan. Con la marca detailedAt el flujo se lee
--  igual y la migracion es aditiva. Es la misma leccion del enum de etapas.
--
--  EL ALCANCE SE PUEDE CAMBIAR, PERO QUEDA MARCADO
--  Si el tecnico llega y ve que el problema es el switch y no la camara,
--  arreglar la camara no sirve de nada. Se le deja cambiarlo y se anota, para
--  que el ingeniero vea QUE SE PIDIO frente a QUE SE HIZO.
--
--  LAS ORDENES QUE YA EXISTEN se marcan como DETALLADAS con su fecha de
--  creacion: se crearon con todo relleno, que es exactamente lo que significa.
--  Si no, apareceria de golpe un tablero lleno de trabajo "sin detallar" que
--  nadie dejo a medias.
--
--  TODO ADITIVO Y NULABLE.
-- ============================================================================

ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "assignedById" TEXT;
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "assignedAssetId" TEXT;
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "detailedAt" TIMESTAMP(3);
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "detailedById" TEXT;
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "scopeChanged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "scopeNote" TEXT;

-- La consulta que se hara todos los dias es "que hay sin detallar".
CREATE INDEX IF NOT EXISTS "work_orders_detailedAt_idx" ON "work_orders"("detailedAt");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_orders_assignedById_fkey') THEN
        ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_assignedById_fkey"
            FOREIGN KEY ("assignedById") REFERENCES "users"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_orders_detailedById_fkey') THEN
        ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_detailedById_fkey"
            FOREIGN KEY ("detailedById") REFERENCES "users"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- Lo ya existente nacio con todo relleno: es trabajo detallado, no pendiente.
UPDATE "work_orders"
   SET "detailedAt" = "createdAt"
 WHERE "detailedAt" IS NULL;
