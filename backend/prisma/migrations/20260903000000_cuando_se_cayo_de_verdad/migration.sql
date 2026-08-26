-- ============================================================================
-- BLOQUE 68 · «CUÁNDO SE CAYÓ» NO ES «CUÁNDO SE REPORTÓ»
-- ----------------------------------------------------------------------------
-- Hasta hoy la incidencia guardaba UNA fecha: `reportedAt`, la de cuando
-- alguien lo dijo. El MTTR se calcula desde ahí.
--
-- El problema es de planta, no de software: una cámara que se apaga a las 3
-- de la madrugada y se reporta a las 8 carga cinco horas en las que nadie
-- podía hacer nada, porque nadie estaba mirando ese monitor. Con una sola
-- fecha, esas cinco horas parecen lentitud de mantenimiento.
--
-- Con las dos, se separan dos problemas que tienen dos dueños distintos:
--
--     occurredAt → reportedAt   =  DEMORA EN AVISAR   (detección)
--     reportedAt → resolvedAt   =  MTTR               (mantenimiento)
--
-- ES OPCIONAL A PROPÓSITO. La mayoría de las veces no se sabe la hora exacta,
-- y un campo obligatorio que no se sabe acaba relleno con cualquier cosa —que
-- es peor que vacío, porque un dato inventado no se distingue de uno bueno.
-- Cuando está vacío se usa `reportedAt`, que es la mejor estimación que hay.
--
-- NO SE RELLENA EL HISTÓRICO. Poner `occurredAt = reportedAt` en las
-- incidencias viejas diría que todas se reportaron en el instante en que
-- ocurrieron, y eso es falso. NULL dice la verdad: no se sabe.
-- ============================================================================

ALTER TABLE "incidents" ADD COLUMN "occurredAt" TIMESTAMP(3);

-- El nombre lo genera Prisma como <tabla>_<campos>_idx con el nombre COMPLETO
-- del campo. Abreviarlo hizo que Prisma creyera que faltaba el índice y lo
-- creara otra vez: dos índices iguales sobre la misma columna, y cada
-- escritura pagando los dos (bloque 16.3).
CREATE INDEX IF NOT EXISTS "incidents_occurredAt_idx" ON "incidents"("occurredAt");
