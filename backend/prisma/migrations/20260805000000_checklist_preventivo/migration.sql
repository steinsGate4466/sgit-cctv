-- ============================================================================
--  RUTINA PREVENTIVA POR TIPO DE ACTIVO  (bloque 3F-2)
--
--  QUE RESUELVE
--  La rutina del preventivo NO EXISTIA como dato. PreventivePlan solo guardaba
--  el intervalo y la proxima fecha; QUE se hace en esa visita vivia en la
--  cabeza del tecnico. Consecuencia: cada uno hacia lo que recordaba, el que
--  entraba nuevo no sabia por donde empezar, y no habia forma de comprobar si
--  se hizo lo que habia que hacer.
--
--  POR QUE POR TIPO DE ACTIVO
--  Una camara, un grabador y una antena no se mantienen igual. Una lista unica
--  obligaria al tecnico a ir descartando lo que no toca, que es justo el
--  trabajo mental que queremos quitarle.
--
--  LO QUE NO HAY AQUI: NI UN SOLO PUNTO DE RUTINA.
--  Las plantillas nacen VACIAS. Yo no se que se revisa en una camara del Tren
--  2 ni con que se limpia. Se llenan desde la pantalla, igual que las etapas y
--  los catalogos. Ya me equivoque una vez inventando datos de planta.
--
--  TODO ADITIVO. Ninguna orden ni plan existente cambia.
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ChecklistResult') THEN
        CREATE TYPE "ChecklistResult" AS ENUM ('OK', 'NO_OK', 'NO_APLICA');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "checklist_templates" (
    "id" TEXT NOT NULL,
    "assetType" "AssetType" NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checklist_templates_pkey" PRIMARY KEY ("id")
);

-- Una rutina por tipo de activo: dos rutinas para camaras acabarian
-- divergiendo y nadie sabria cual es la buena.
CREATE UNIQUE INDEX IF NOT EXISTS "checklist_templates_assetType_key"
    ON "checklist_templates"("assetType");

CREATE TABLE IF NOT EXISTS "checklist_items" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "help" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "critical" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checklist_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "checklist_items_templateId_active_idx"
    ON "checklist_items"("templateId", "active");

CREATE TABLE IF NOT EXISTS "work_order_checklist" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "result" "ChecklistResult" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_order_checklist_pkey" PRIMARY KEY ("id")
);

-- Una respuesta por punto y orden: responder otra vez ACTUALIZA, no duplica.
CREATE UNIQUE INDEX IF NOT EXISTS "work_order_checklist_workOrderId_itemId_key"
    ON "work_order_checklist"("workOrderId", "itemId");
CREATE INDEX IF NOT EXISTS "work_order_checklist_workOrderId_idx"
    ON "work_order_checklist"("workOrderId");

-- ---------------------------------------------------------------------------
--  Claves foraneas.
--  Los puntos se borran CON su plantilla (CASCADE): un punto sin rutina no
--  significa nada. Las respuestas tambien: si se borra la orden, se van con
--  ella, porque son parte de esa orden y de ninguna otra.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checklist_items_templateId_fkey') THEN
        ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_templateId_fkey"
            FOREIGN KEY ("templateId") REFERENCES "checklist_templates"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_order_checklist_workOrderId_fkey') THEN
        ALTER TABLE "work_order_checklist" ADD CONSTRAINT "work_order_checklist_workOrderId_fkey"
            FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_order_checklist_itemId_fkey') THEN
        ALTER TABLE "work_order_checklist" ADD CONSTRAINT "work_order_checklist_itemId_fkey"
            FOREIGN KEY ("itemId") REFERENCES "checklist_items"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
