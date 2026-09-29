-- ===========================================================================
-- BLOQUE 136 · TIPO → SUBTIPO: EL FORMULARIO SE ARMA SOLO
-- ===========================================================================
-- «El OM lo seleccionamos Preventivo y luego que aparezca otro buscador que
--  diga qué va a hacer, para que el formulario cambie y se vaya
--  autocompletando» (usuario, 21/09/2026).
--
-- Tipo = Preventivo · Correctivo · Mejora. Subtipo = el trabajo concreto, de
-- un catálogo EDITABLE (TRABAJO_OM) que llena Mantenimiento. El sistema no
-- trae subtipos inventados: los declara quien conoce el trabajo.
--
-- ADITIVA. El valor nuevo del enum va AL FINAL (PostgreSQL sólo añade al
-- final). La columna nace NULL: las órdenes viejas no tienen subtipo.
-- ===========================================================================

ALTER TYPE "CatalogKind" ADD VALUE IF NOT EXISTS 'TRABAJO_OM';

ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "subtipo" TEXT;
