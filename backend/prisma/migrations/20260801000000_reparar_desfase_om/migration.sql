-- ============================================================================
--  REPARACIÓN DE DESFASE ENTRE EL ESQUEMA Y LA BASE DE PRODUCCIÓN
--
--  QUÉ PASÓ
--  El endpoint /dashboard/infra/tren/:code falló con:
--    P2022 · The column work_orders.progressPct does not exist
--  El diagnóstico contra la base real (scripts/diagnostico-bd.js) encontró que
--  faltaban exactamente tres cosas:
--      · tabla    work_order_progress
--      · columna  work_orders.plannedDurationMin
--      · columna  work_orders.progressPct
--  Todas ellas las declara la migración 20260729120000_om_ejecucion_campo, que
--  en el registro figura como APLICADA.
--
--  POR QUÉ FALTABAN SI LA MIGRACIÓN ESTÁ APLICADA
--  Un ALTER TABLE con varias columnas es UNA sola sentencia: se aplica entera o
--  no se aplica. Que falten solo las DOS ÚLTIMAS de la lista, y justo después
--  la tabla que venía a continuación, solo tiene una explicación: el archivo de
--  la migración se EDITÓ DESPUÉS de haberse aplicado. Prisma ya la tenía
--  registrada, así que las sentencias añadidas nunca se ejecutaron.
--
--  Es un error de proceso mío: una migración aplicada es inmutable. Lo que se
--  olvidó va en una migración NUEVA, nunca editando la anterior.
--
--  POR QUÉ ESTA MIGRACIÓN ES IDEMPOTENTE
--  Tiene que funcionar en DOS bases distintas:
--    · la de producción, donde faltan esos tres objetos;
--    · una base limpia (el CI), donde la migración anterior YA los creó.
--  Por eso todo va con IF NOT EXISTS y, para las claves foráneas —que no
--  admiten IF NOT EXISTS— con un bloque que comprueba pg_constraint.
--
--  NO BORRA NI MODIFICA NINGÚN DATO. Solo añade lo que falta.
-- ============================================================================

-- ---------------------------------------------------------------------------
--  1. Columnas que faltan en work_orders
--     Con DEFAULT y NOT NULL: las órdenes existentes quedan con avance 0, que
--     es lo correcto —ninguna había declarado avance porque la columna no
--     existía—. plannedDurationMin queda nula: nadie la estimó.
-- ---------------------------------------------------------------------------
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "plannedDurationMin" INTEGER;
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "progressPct" INTEGER NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
--  2. Historial de avance de la orden
--     Una orden no siempre se termina el mismo día: la parada se acorta, falta
--     el manlift, no llega el repuesto. En vez de forzar el cierre, queda
--     EN PROCESO con su avance y el motivo, a la vista del Jefe.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "work_order_progress" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "pct" INTEGER NOT NULL,
    "note" TEXT,
    "reportedById" TEXT,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_progress_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "work_order_progress_workOrderId_idx"
    ON "work_order_progress"("workOrderId");

-- ---------------------------------------------------------------------------
--  3. Índices de work_orders que venían en la misma migración
--     El diagnóstico comprobó tablas, columnas y enums, pero NO índices ni
--     claves foráneas. Como estas sentencias estaban después del punto donde se
--     truncó el archivo, se recrean por si acaso: con IF NOT EXISTS no cuesta
--     nada y cierra la duda.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "work_orders_locationId_idx" ON "work_orders"("locationId");
CREATE INDEX IF NOT EXISTS "work_orders_type_status_idx" ON "work_orders"("type", "status");

-- ---------------------------------------------------------------------------
--  4. Claves foráneas
--     PostgreSQL no admite ADD CONSTRAINT IF NOT EXISTS, así que se comprueba
--     el catálogo antes de crearla. Se respeta EXACTAMENTE la regla de borrado
--     de cada relación del esquema: opcional -> SET NULL, requerida -> CASCADE.
--     Si se cambiara, la comprobación de desfase del CI fallaría.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_orders_assetId_fkey') THEN
        ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_assetId_fkey"
            FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_orders_locationId_fkey') THEN
        ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_locationId_fkey"
            FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_orders_openedById_fkey') THEN
        ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_openedById_fkey"
            FOREIGN KEY ("openedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_orders_closedById_fkey') THEN
        ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_closedById_fkey"
            FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_orders_companionId_fkey') THEN
        ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_companionId_fkey"
            FOREIGN KEY ("companionId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assets_mappedInWorkOrderId_fkey') THEN
        ALTER TABLE "assets" ADD CONSTRAINT "assets_mappedInWorkOrderId_fkey"
            FOREIGN KEY ("mappedInWorkOrderId") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    -- Requerida en el esquema (workOrderId no es opcional) -> CASCADE:
    -- si se borra la orden, su historial de avance se va con ella.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_order_progress_workOrderId_fkey') THEN
        ALTER TABLE "work_order_progress" ADD CONSTRAINT "work_order_progress_workOrderId_fkey"
            FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    -- Opcional (reportedById puede ser nulo) -> SET NULL: si se borra el
    -- usuario, el reporte de avance NO se borra. Es historial: quién lo puso
    -- puede desaparecer, lo que declaró no.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_order_progress_reportedById_fkey') THEN
        ALTER TABLE "work_order_progress" ADD CONSTRAINT "work_order_progress_reportedById_fkey"
            FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
