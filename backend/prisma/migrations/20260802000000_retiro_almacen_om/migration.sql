-- ============================================================================
--  RETIRO DE ALMACÉN DESDE LA ORDEN DE TRABAJO (bloque 3D)
--
--  EL FLUJO REAL DE PLANTA, tal como lo describió el ingeniero:
--    1. El técnico lista lo que necesita, con su código SAP.
--    2. El ingeniero lo autoriza y se saca de almacén — de una vez, con firma.
--    3. Lo que sobra VUELVE.
--
--  El paso 3 no existía. Sin él el almacén miente: se descuenta lo que salió y
--  nunca se acredita lo que regresó, así que en tres meses el stock del sistema
--  no se parece al del estante y nadie se fía de la alerta de mínimos.
--
--  TODO ES ADITIVO. No borra ni modifica ningún dato existente. Las líneas de
--  material que ya están en la base quedan como SOLICITADO, que es exactamente
--  lo que son: pedidas y todavía sin retirar.
--
--  Se usa IF NOT EXISTS por costumbre adquirida a base de golpes: el 30/07 una
--  migración editada después de aplicarse dejó producción sin dos columnas.
-- ============================================================================

-- ---------------------------------------------------------------------------
--  1. Estado de la línea de material
--     PostgreSQL no admite CREATE TYPE IF NOT EXISTS, así que se comprueba el
--     catálogo. Crear el tipo y usarlo en la misma transacción SÍ es válido;
--     lo que no se puede es AÑADIR VALORES a un enum y usarlos a la vez.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MaterialStatus') THEN
        CREATE TYPE "MaterialStatus" AS ENUM ('SOLICITADO', 'RETIRADO', 'DEVUELTO', 'RECHAZADO');
    END IF;
END $$;

-- ---------------------------------------------------------------------------
--  2. Campos del retiro en la línea de material
-- ---------------------------------------------------------------------------
ALTER TABLE "work_order_materials"
    ADD COLUMN IF NOT EXISTS "status" "MaterialStatus" NOT NULL DEFAULT 'SOLICITADO';

-- Cantidad que salió de almacén. Puede no coincidir con lo previsto: el
-- ingeniero entrega lo que hay, no lo que se pidió.
ALTER TABLE "work_order_materials" ADD COLUMN IF NOT EXISTS "withdrawnQty" DOUBLE PRECISION;

-- Cantidad que volvió. Se guarda y no se recalcula: el dato tiene que quedar.
ALTER TABLE "work_order_materials" ADD COLUMN IF NOT EXISTS "returnedQty" DOUBLE PRECISION;

-- El hilo que une la orden con el almacén. Sin él, "se retiró" sería una
-- afirmación sin respaldo.
ALTER TABLE "work_order_materials" ADD COLUMN IF NOT EXISTS "movementId" TEXT;
ALTER TABLE "work_order_materials" ADD COLUMN IF NOT EXISTS "returnMovementId" TEXT;

-- Quién firmó el retiro y cuándo. El ingeniero, no el técnico.
ALTER TABLE "work_order_materials" ADD COLUMN IF NOT EXISTS "withdrawnById" TEXT;
ALTER TABLE "work_order_materials" ADD COLUMN IF NOT EXISTS "withdrawnAt" TIMESTAMP(3);

-- Motivo del rechazo. Un "no" sin explicación hace que el técnico vuelva a
-- pedir lo mismo la semana siguiente.
ALTER TABLE "work_order_materials" ADD COLUMN IF NOT EXISTS "rejectedReason" TEXT;

-- ---------------------------------------------------------------------------
--  3. Índices
--     Por estado, porque la consulta que se hará mil veces es "qué hay
--     pendiente de retirar", no "dame todas las líneas".
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "work_order_materials_status_idx"
    ON "work_order_materials"("status");
CREATE INDEX IF NOT EXISTS "work_order_materials_movementId_idx"
    ON "work_order_materials"("movementId");

-- ---------------------------------------------------------------------------
--  4. Claves foráneas
--     TODAS con ON DELETE SET NULL, y es deliberado: si alguien borra un
--     movimiento de stock o se da de baja un usuario, la línea de material NO
--     se borra. Es historial de una orden ejecutada; quién lo firmó puede
--     desaparecer, lo que se retiró no.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_order_materials_movementId_fkey') THEN
        ALTER TABLE "work_order_materials" ADD CONSTRAINT "work_order_materials_movementId_fkey"
            FOREIGN KEY ("movementId") REFERENCES "stock_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_order_materials_returnMovementId_fkey') THEN
        ALTER TABLE "work_order_materials" ADD CONSTRAINT "work_order_materials_returnMovementId_fkey"
            FOREIGN KEY ("returnMovementId") REFERENCES "stock_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_order_materials_withdrawnById_fkey') THEN
        ALTER TABLE "work_order_materials" ADD CONSTRAINT "work_order_materials_withdrawnById_fkey"
            FOREIGN KEY ("withdrawnById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
