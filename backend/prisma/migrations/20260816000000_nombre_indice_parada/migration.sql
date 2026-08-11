-- =========================================================================
--  ARREGLO DE NOMBRE DE ÍNDICE
--  -----------------------------------------------------------------------
--  En la migración 20260815000000 escribí el índice a mano como
--  `ventanas_parada_inicioPrev_idx`, abreviando el nombre del campo.
--
--  Prisma nombra los índices SIEMPRE así:  <tabla>_<campos>_idx
--  con el nombre COMPLETO del campo. Para `@@index([inicioPrevisto])` en la
--  tabla `ventanas_parada` eso es:  ventanas_parada_inicioPrevisto_idx
--
--  El índice funcionaba igual —a PostgreSQL el nombre le da lo mismo— pero la
--  comprobación de desfase del CI compara NOMBRES, y con razón: si el nombre
--  no coincide, el día que alguien corra `prisma migrate dev` Prisma cree que
--  falta el índice, lo vuelve a crear, y quedan dos índices iguales sobre la
--  misma columna. Cada escritura paga los dos.
--
--  POR QUÉ UNA MIGRACIÓN NUEVA Y NO EDITAR LA ANTERIOR
--  Porque la anterior YA SE APLICÓ —en la base local y en Railway al
--  desplegar— y una migración aplicada es inmutable: cambiarla deja la suma
--  de comprobación distinta y Prisma se planta.
--
--  Este SQL es IDEMPOTENTE a propósito: funciona tanto si el índice viejo
--  existe (lo renombra) como si la base es nueva y nunca lo tuvo (lo crea).
-- =========================================================================

ALTER INDEX IF EXISTS "ventanas_parada_inicioPrev_idx"
    RENAME TO "ventanas_parada_inicioPrevisto_idx";

CREATE INDEX IF NOT EXISTS "ventanas_parada_inicioPrevisto_idx"
    ON "ventanas_parada"("inicioPrevisto");
