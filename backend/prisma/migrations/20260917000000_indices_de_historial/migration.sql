-- BLOQUE 105 · ÍNDICES PARA EL HISTORIAL POR ACTIVO
--
-- Las pantallas de historial piden siempre lo mismo: «lo de ESTE activo, por
-- fecha, lo más reciente arriba». Sin un índice compuesto eso obliga a recorrer
-- la tabla entera y ordenar en memoria — invisible con 400 filas, caro con
-- treinta mil y con cincuenta personas a la vez.
--
-- Los nombres son EXACTAMENTE los que generaría Prisma (<tabla>_<campos>_idx,
-- con el nombre COMPLETO de cada campo). Abreviarlos hace que el día que
-- alguien corra `prisma migrate dev` Prisma crea que falta el índice, lo cree
-- otra vez, y queden dos iguales sobre la misma columna — cada escritura paga
-- los dos. Es el fallo del bloque 16.3.
--
-- ===========================================================================
--  POR QUÉ ESTE SQL ES IDEMPOTENTE, Y NO ES MANÍA
-- ===========================================================================
--  La primera versión de esta migración declaraba un índice sobre
--  `stock_movements("assetId")`, columna que NO EXISTE en esa tabla. Al
--  aplicarla, PostgreSQL creó los cinco índices anteriores y reventó en el
--  sexto.
--
--  Y AQUÍ ESTÁ LO QUE HAY QUE DEJAR ESCRITO: se dio por hecho que Prisma
--  envuelve la migración en una transacción y que un fallo lo deshace todo.
--  **No fue así.** Los índices anteriores quedaron creados, y el segundo
--  intento murió con `42P07 · relation ... already exists`.
--
--  De ahí el `IF NOT EXISTS`: esta migración tiene que poder aplicarse tanto
--  sobre una base virgen como sobre la del usuario, que ya tiene cinco de los
--  seis. Es la misma decisión del bloque 16.3.
--
--  REGLA: una migración escrita a mano que pueda quedarse a medias se escribe
--  idempotente. No porque se espere que falle, sino porque el coste de que lo
--  sea es cero y el de que no lo sea es una base bloqueada.

-- CreateIndex
CREATE INDEX IF NOT EXISTS "work_orders_assetId_createdAt_idx" ON "work_orders"("assetId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "work_orders_createdAt_idx" ON "work_orders"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "incidents_assetId_reportedAt_idx" ON "incidents"("assetId", "reportedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "incidents_reportedAt_idx" ON "incidents"("reportedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "asset_history_assetId_createdAt_idx" ON "asset_history"("assetId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "stock_movements_sparePartId_createdAt_idx" ON "stock_movements"("sparePartId", "createdAt");
