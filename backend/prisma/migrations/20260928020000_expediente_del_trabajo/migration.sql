-- ===========================================================================
-- BLOQUE 155 · EL EXPEDIENTE DEL TRABAJO
-- ===========================================================================
-- «Dos pantallas, mantenimiento e instalación, y ahí debería almacenarse toda
--  la información, documentos, instalaciones, todo lo que está haciéndose»
-- (usuario, 28/09/2026).
--
-- Un documento puede colgar ahora de una INSTALACIÓN o de una ORDEN, además
-- de un equipo o una ubicación. Si se borra la instalación o la orden, el
-- documento NO se pierde: queda suelto (SET NULL) y se sigue encontrando en
-- Documentos.
--
-- ADITIVA E IDEMPOTENTE.
-- ===========================================================================

ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "instalacionId" TEXT;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "workOrderId" TEXT;

CREATE INDEX IF NOT EXISTS "documents_instalacionId_idx" ON "documents"("instalacionId");
CREATE INDEX IF NOT EXISTS "documents_workOrderId_idx" ON "documents"("workOrderId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_instalacionId_fkey') THEN
    ALTER TABLE "documents" ADD CONSTRAINT "documents_instalacionId_fkey"
      FOREIGN KEY ("instalacionId") REFERENCES "instalaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_workOrderId_fkey') THEN
    ALTER TABLE "documents" ADD CONSTRAINT "documents_workOrderId_fkey"
      FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;
