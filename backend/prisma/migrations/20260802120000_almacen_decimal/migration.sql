-- ============================================================================
--  EL ALMACÉN PASA A DECIMALES
--
--  EL PROBLEMA
--  La orden de trabajo ya guardaba cantidades con decimales (plannedQty,
--  usedQty, withdrawnQty son Float), pero el ALMACÉN era entero:
--     stock_movements.quantity     INTEGER
--     spare_parts.currentStock     INTEGER
--     spare_parts.minStock         INTEGER
--
--  El código unía las dos cosas con Math.round(). Consecuencia real: retirar
--  12,5 m de cable UTP registraba 13, y devolver 5,2 acreditaba 5. Cada
--  operación perdía décimas, y el cable se consume SIEMPRE por tramos: sobra
--  casi siempre. En pocos meses el stock dejaba de parecerse al estante.
--
--  LA CONVERSIÓN ES SEGURA
--  INTEGER -> DOUBLE PRECISION es ENSANCHAR el tipo: todo entero cabe exacto
--  en un doble, así que ningún dato existente se altera ni se pierde. La
--  operación inversa sí perdería información; esta no.
--
--  POR QUÉ DOUBLE Y NO NUMERIC
--  NUMERIC sería más exacto para dinero, pero esto son metros y unidades, no
--  importes. DOUBLE PRECISION es lo que Prisma mapea a Float, y mezclar tipos
--  entre el esquema y la base es exactamente lo que provocó el desfase del 30
--  de julio. Coherencia por encima de precisión que aquí no hace falta.
-- ============================================================================

ALTER TABLE "spare_parts"
    ALTER COLUMN "currentStock" TYPE DOUBLE PRECISION,
    ALTER COLUMN "currentStock" SET DEFAULT 0;

ALTER TABLE "spare_parts"
    ALTER COLUMN "minStock" TYPE DOUBLE PRECISION,
    ALTER COLUMN "minStock" SET DEFAULT 0;

ALTER TABLE "stock_movements"
    ALTER COLUMN "quantity" TYPE DOUBLE PRECISION;
