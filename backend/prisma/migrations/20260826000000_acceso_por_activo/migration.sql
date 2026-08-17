-- =============================================================================
--  BLOQUE 41 — CÓMO SE LLEGA A CADA EQUIPO
-- =============================================================================
--  Producción costea el manlift y hasta hoy no había forma de decirle cuántos
--  equipos de su tren exigen uno. El dato existía sólo a nivel de ZONA
--  (`locations.requiereAltura`), y la zona es demasiado gruesa: en la misma
--  zona hay una cámara en la pared a 2 m y otra en el poste del lecho a 8 m.
--
--  Esta migración baja el dato al ACTIVO.
--
-- -----------------------------------------------------------------------------
--  POR QUÉ NINGUNA COLUMNA TIENE VALOR POR DEFECTO
-- -----------------------------------------------------------------------------
--  NULL significa «nadie lo ha declarado todavía», y eso NO es «se llega a pie».
--
--  Si `medioAcceso` naciera con DEFAULT 'A_PIE', los cientos de activos ya
--  cargados aparecerían mañana como accesibles caminando sin que ninguna
--  persona lo haya mirado. Producción vería un número bajo, lo aprobaría, y el
--  día del trabajo faltaría el manlift.
--
--  Rellenar en blanco es exactamente lo que este proyecto tiene prohibido:
--  un dato inventado que parece un dato bueno.
--
-- -----------------------------------------------------------------------------
--  TAMPOCO SE COPIA `requiereAltura` DE LA ZONA
-- -----------------------------------------------------------------------------
--  Sería tentador (`UPDATE assets SET medioAcceso='MANLIFT' WHERE ...`) y sería
--  un error: convertiría una PROPUESTA del sistema en una DECLARACIÓN firmada,
--  sin que nadie la firmara. La aplicación sigue proponiendo desde la zona y lo
--  dice en voz alta; lo que no hace es contarlo como confirmado.
--
-- -----------------------------------------------------------------------------
--  ES UNA MIGRACIÓN ADITIVA
-- -----------------------------------------------------------------------------
--  Sólo añade un tipo, cinco columnas nulables y un índice. No toca ni una fila
--  existente, no borra nada y no reescribe la tabla. Se puede aplicar con la
--  planta trabajando.
-- =============================================================================

CREATE TYPE "MedioAcceso" AS ENUM (
  'A_PIE',
  'ESCALERA',
  'ANDAMIO',
  'MANLIFT',
  'GRUA',
  'LINEA_VIDA',
  'OTRO'
);

ALTER TABLE "assets"
  ADD COLUMN "medioAcceso"          "MedioAcceso",
  ADD COLUMN "alturaMetros"         DOUBLE PRECISION,
  ADD COLUMN "accesoNota"           TEXT,
  ADD COLUMN "accesoDeclaradoPorId" TEXT,
  ADD COLUMN "accesoDeclaradoEn"    TIMESTAMP(3);

-- ON DELETE SET NULL, igual que las declaraciones de zona del bloque 26: si la
-- persona se da de baja, la declaración sobrevive sin nombre. Borrarla dejaría
-- el equipo como «sin declarar» y alguien acabaría subiendo sin preparar nada.
ALTER TABLE "assets"
  ADD CONSTRAINT "assets_accesoDeclaradoPorId_fkey"
  FOREIGN KEY ("accesoDeclaradoPorId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- El índice de la clave foránea. Sin él, dar de baja un usuario obliga a un
-- recorrido completo de `assets` para poner los NULL.
CREATE INDEX "assets_accesoDeclaradoPorId_idx" ON "assets"("accesoDeclaradoPorId");

-- El tablero por tren filtra constantemente por este campo para separar
-- «exige elevador» de «sin declarar».
CREATE INDEX "assets_medioAcceso_idx" ON "assets"("medioAcceso");
