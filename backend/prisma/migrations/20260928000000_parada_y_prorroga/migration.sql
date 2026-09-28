-- ===========================================================================
-- BLOQUES 135 y 138 · LA PARADA DENTRO DE LA OM Y LA PRÓRROGA CON VISTO BUENO
-- ===========================================================================
--
-- 138 · «Empezó parada / estamos empezando a tal hora» (usuario, 21/09/2026).
--       La parada se declara en la orden, donde nace del trabajo real.
-- 135 · El técnico PIDE mover la fecha, con motivo; el supervisor la aprueba.
--       Sólo entonces cambia la fecha y la orden deja de salir fuera de plazo.
--
-- ADITIVA E IDEMPOTENTE: sólo añade columnas y una tabla; se puede lanzar dos
-- veces. No toca ni un dato existente. Todo nace NULL: «no se declaró».
-- ===========================================================================

ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "paradaInicioReal" TIMESTAMP(3);
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "paradaFinReal" TIMESTAMP(3);
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "fechaOriginal" TIMESTAMP(3);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EstadoProrroga') THEN
    CREATE TYPE "EstadoProrroga" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "prorrogas_om" (
  "id"            TEXT NOT NULL,
  "workOrderId"   TEXT NOT NULL,
  "fechaAnterior" TIMESTAMP(3),
  "fechaPedida"   TIMESTAMP(3) NOT NULL,
  "motivo"        TEXT NOT NULL,
  "estado"        "EstadoProrroga" NOT NULL DEFAULT 'PENDIENTE',
  "pedidaPorId"   TEXT,
  "pedidaEn"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resueltaPorId" TEXT,
  "resueltaEn"    TIMESTAMP(3),
  "nota"          TEXT,
  CONSTRAINT "prorrogas_om_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "prorrogas_om_workOrderId_idx" ON "prorrogas_om"("workOrderId");
CREATE INDEX IF NOT EXISTS "prorrogas_om_estado_idx" ON "prorrogas_om"("estado");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prorrogas_om_workOrderId_fkey') THEN
    ALTER TABLE "prorrogas_om" ADD CONSTRAINT "prorrogas_om_workOrderId_fkey"
      FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prorrogas_om_pedidaPorId_fkey') THEN
    ALTER TABLE "prorrogas_om" ADD CONSTRAINT "prorrogas_om_pedidaPorId_fkey"
      FOREIGN KEY ("pedidaPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prorrogas_om_resueltaPorId_fkey') THEN
    ALTER TABLE "prorrogas_om" ADD CONSTRAINT "prorrogas_om_resueltaPorId_fkey"
      FOREIGN KEY ("resueltaPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;
