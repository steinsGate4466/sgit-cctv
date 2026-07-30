-- Bloque 2f: materiales, herramientas y reemplazo de equipo
-- Aceros Arequipa - Planta Pisco - Laminacion
--
-- POR QUE
--   El modulo de inventario estaba DESCONECTADO de las ordenes: el tecnico
--   escribia "30 m Cat6" en un cuadro de texto, el almacen nunca se enteraba y
--   nadie podia saber cuanto costaba mantener un equipo ni si habia stock para
--   una campana de reemplazo.
--
-- QUE INTRODUCE
--   * tools / work_order_tools
--       Herramientas y la VERIFICACION al abrir la orden. Una herramienta no
--       es un repuesto: el engrimpador no se consume, se lleva y se devuelve.
--       Se guarda tambien el "no la llevo": es el dato que explica un viaje
--       perdido, y el Jefe de Mantenimiento lo ve.
--
--   * work_order_materials
--       Que se PREVIO y que se USO en cada orden, con su codigo SAP copiado al
--       momento. No descuenta stock automaticamente: el almacen de verdad esta
--       en SAP y descontar en dos lados haria que ninguno cuadre.
--
--   * work_order_swaps
--       Reemplazo de equipo: que salio y que entro. Cierra la cadena
--       STOCK -> asignado a la orden -> instalado -> OPERATIVO.
--
-- Todo lo nuevo son tablas nuevas: ninguna columna existente cambia y ningun
-- dato actual se ve afectado.

-- CreateTable
CREATE TABLE "tools" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "suggestedFor" "WorkOrderType"[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_tools" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "carried" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,

    CONSTRAINT "work_order_tools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_materials" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "sparePartId" TEXT,
    "sapCode" TEXT,
    "description" TEXT NOT NULL,
    "unit" TEXT,
    "plannedQty" DOUBLE PRECISION,
    "usedQty" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_order_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_swaps" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "removedAssetId" TEXT,
    "installedAssetId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_swaps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tools_code_key" ON "tools"("code");

-- CreateIndex
CREATE UNIQUE INDEX "work_order_tools_workOrderId_toolId_key" ON "work_order_tools"("workOrderId", "toolId");

-- CreateIndex
CREATE INDEX "work_order_tools_workOrderId_idx" ON "work_order_tools"("workOrderId");

-- CreateIndex
CREATE INDEX "work_order_materials_workOrderId_idx" ON "work_order_materials"("workOrderId");

-- CreateIndex
CREATE INDEX "work_order_materials_sparePartId_idx" ON "work_order_materials"("sparePartId");

-- CreateIndex
CREATE INDEX "work_order_swaps_workOrderId_idx" ON "work_order_swaps"("workOrderId");

-- AddForeignKey
ALTER TABLE "work_order_tools" ADD CONSTRAINT "work_order_tools_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_tools" ADD CONSTRAINT "work_order_tools_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "tools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_materials" ADD CONSTRAINT "work_order_materials_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_materials" ADD CONSTRAINT "work_order_materials_sparePartId_fkey" FOREIGN KEY ("sparePartId") REFERENCES "spare_parts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_swaps" ADD CONSTRAINT "work_order_swaps_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_swaps" ADD CONSTRAINT "work_order_swaps_removedAssetId_fkey" FOREIGN KEY ("removedAssetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_swaps" ADD CONSTRAINT "work_order_swaps_installedAssetId_fkey" FOREIGN KEY ("installedAssetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
