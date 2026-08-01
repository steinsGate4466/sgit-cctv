-- ============================================================================
--  EL CIERRE DE LA ORDEN DEJA DE SER TEXTO LIBRE  (bloque 3F-1)
--
--  QUE CAMBIA
--  Al cerrar, el tecnico elegia una causa de una lista fija de 17 y escribia
--  el resto a mano. Ahora elige tres cosas de catalogos editables:
--     - SINTOMA  lo que vio ANTES de tocar nada
--     - CAUSA    lo que descubrio
--     - ACCION   lo que hizo
--  y el texto libre queda como observacion opcional.
--
--  POR QUE SEPARAR SINTOMA DE CAUSA
--  Son cosas distintas y mezclarlas es lo que hace que "no hay imagen" figure
--  como CAUSA de 40 ordenes. "No hay imagen" es lo que se ve; la causa puede
--  ser el conector, la fuente o un tramo de 120 m. Sin separarlos, la
--  estadistica no sirve para decidir nada.
--
--  POR QUE CONVIVE rootCauseCode CON EL ENUM rootCause
--  Las ordenes cerradas antes de 3E guardaron su valor en el enum. Borrarlo
--  las dejaria sin causa. Las 17 opciones del catalogo tienen EXACTAMENTE los
--  mismos codigos, asi que al cerrar se escriben las dos cuando coinciden. Una
--  causa nueva creada por el usuario solo cabe en la columna de texto.
--  Al leer siempre: rootCauseCode ?? rootCause.
--
--  TODO ADITIVO Y NULABLE. Ninguna orden existente cambia.
-- ============================================================================

ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "rootCauseCode" TEXT;
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "symptomCode" TEXT;
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "actionCode" TEXT;

ALTER TABLE "work_order_progress" ADD COLUMN IF NOT EXISTS "reasonCode" TEXT;

-- Se consulta por causa para el informe de "por que se repite esto".
CREATE INDEX IF NOT EXISTS "work_orders_rootCauseCode_idx"
    ON "work_orders"("rootCauseCode");

-- ---------------------------------------------------------------------------
--  Las ordenes YA cerradas copian su causa del enum a la columna nueva, para
--  que los informes puedan leer una sola columna sin casos especiales.
--  Es una copia, no un borrado: el enum se queda como estaba.
-- ---------------------------------------------------------------------------
UPDATE "work_orders"
   SET "rootCauseCode" = "rootCause"::text
 WHERE "rootCause" IS NOT NULL
   AND "rootCauseCode" IS NULL;
