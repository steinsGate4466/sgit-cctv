-- ===========================================================================
-- BLOQUE 137 · CÓMO VA EL CABLE EN UNA INSTALACIÓN
-- ===========================================================================
-- «Materiales, zona, manlift, 220 V, caja de paso, tuberías, canalización»
-- (usuario, 21/09/2026). Energía, manlift y zona ya existían; faltaba cómo va
-- el cable: tipo de canalización, metros de tubería y cajas de paso.
--
-- ADITIVA E IDEMPOTENTE. Todo nace NULL: «no se midió todavía».
-- ===========================================================================

ALTER TABLE "instalaciones" ADD COLUMN IF NOT EXISTS "canalizacion" TEXT;
ALTER TABLE "instalaciones" ADD COLUMN IF NOT EXISTS "metrosTuberia" DOUBLE PRECISION;
ALTER TABLE "instalaciones" ADD COLUMN IF NOT EXISTS "cajasDePaso" INTEGER;
