-- ============================================================================
-- BLOQUE 94 · QUIÉN PIDIÓ LA ORDEN, Y LA META DE MANTENIMIENTO
-- ----------------------------------------------------------------------------
-- 1) `work_orders.createdById` — quién SOLICITÓ la orden, como usuario.
--
--    Hasta hoy sólo había `requestedBy` (texto libre, tecleado a mano) y
--    `openedById` (quien la ARRANCÓ en campo, al firmar). Ninguno de los dos
--    responde «¿quién pidió este trabajo?», que es lo que hace falta para que
--    quien abre una orden pueda seguirla después.
--
--    NULLABLE Y SIN RELLENAR EL HISTÓRICO. Las órdenes anteriores no lo tienen
--    y `NULL` dice la verdad: no se sabe. Rellenarlo con la auditoría diría
--    que sí se sabe, y sólo funcionaría dentro de los 90 días que ésta guarda.
--
--    El índice lleva el nombre EXACTO que generaría Prisma —
--    `<tabla>_<campo>_idx` con el campo COMPLETO — porque abreviarlo hace que
--    `prisma migrate dev` crea que falta y lo cree otra vez: dos índices
--    iguales sobre la misma columna, y cada escritura paga los dos (b16.3).
--
-- 2) `meta_mantenimiento` — la meta del reparto correctivo/preventivo y la
--    meta opcional de volumen mensual de órdenes.
--
--    NO SE INSERTA NINGUNA FILA. Mientras la tabla esté vacía se usa el valor
--    PROPUESTO del código y la pantalla lo dice así. Insertar una fila aquí
--    convertiría una propuesta en una decisión que nadie tomó (b76).
-- ============================================================================

ALTER TABLE "work_orders" ADD COLUMN "createdById" TEXT;

CREATE INDEX "work_orders_createdById_idx" ON "work_orders"("createdById");

ALTER TABLE "work_orders"
  ADD CONSTRAINT "work_orders_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "meta_mantenimiento" (
  "id" TEXT NOT NULL DEFAULT 'unico',
  "correctivoPct" INTEGER NOT NULL,
  "preventivoPct" INTEGER NOT NULL,
  "omPorMes" INTEGER,
  "fijadaPorId" TEXT,
  "fijadaEn" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "meta_mantenimiento_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "meta_mantenimiento_fijadaPorId_idx" ON "meta_mantenimiento"("fijadaPorId");

ALTER TABLE "meta_mantenimiento"
  ADD CONSTRAINT "meta_mantenimiento_fijadaPorId_fkey"
  FOREIGN KEY ("fijadaPorId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
