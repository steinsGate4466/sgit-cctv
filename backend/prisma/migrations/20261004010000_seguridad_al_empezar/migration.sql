-- ===========================================================================
-- BLOQUE 168 · SEGURIDAD AL EMPEZAR LA ORDEN
-- ===========================================================================
-- Lo que el técnico marca al abrir la OM (ATS, PETAR, LOTO, EPP, parada…)
-- contra lo que el sistema calcula de lo declarado. ADITIVA E IDEMPOTENTE.
-- ===========================================================================
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "seguridadInicio" JSONB;
