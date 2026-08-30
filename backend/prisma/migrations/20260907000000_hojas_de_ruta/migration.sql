-- ============================================================================
-- BLOQUE 75 · HOJAS DE RUTA (SAP PM Task Lists)
-- ----------------------------------------------------------------------------
-- Los pasos de un mantenimiento preventivo, con el formato exacto del Excel
-- que usa el ingeniero para cargar a SAP.
--
-- UNA HOJA POR TIPO DE EQUIPO, no por equipo: una sola sirve para las
-- cuatrocientas cámaras. Por eso `tipoEquipo` es ÚNICO — dos hojas para las
-- cámaras significa que nadie sabe cuál es la buena.
--
-- LO QUE CIERRA: el preventivo ya sabía CUÁNDO tocar cada equipo, pero no QUÉ
-- hacer. El técnico recibía «toca revisar AA-CAM-T1-001» y el detalle vivía en
-- un Excel en el PC de alguien.
-- ============================================================================

CREATE TABLE "hojas_de_ruta" (
    "id"             TEXT NOT NULL,
    "tipoEquipo"     "AssetType" NOT NULL,
    "descripcion"    TEXT NOT NULL,
    "ubicacionSap"   TEXT,
    "grupoPlanif"    TEXT,
    "frecuencia"     TEXT NOT NULL,
    "frecuenciaDias" INTEGER,
    "puestoTrabajo"  TEXT,
    "centro"         TEXT,
    "trabajoTotalH"  DOUBLE PRECISION,
    "numPersonas"    INTEGER,
    "duracionH"      DOUBLE PRECISION,
    "activa"         BOOLEAN NOT NULL DEFAULT true,
    "aprobadaPorId"  TEXT,
    "aprobadaEn"     TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hojas_de_ruta_pkey" PRIMARY KEY ("id")
);

-- Un paso. `subOperacion` NULL = es la operación principal (clave PM01);
-- con número = es una suboperación (clave PM04).
CREATE TABLE "operaciones_hoja_ruta" (
    "id"            TEXT NOT NULL,
    "hojaId"        TEXT NOT NULL,
    "operacion"     INTEGER NOT NULL,
    "subOperacion"  INTEGER,
    "claveControl"  TEXT NOT NULL DEFAULT 'PM04',
    "descripcion"   TEXT NOT NULL,
    "puestoTrabajo" TEXT,
    "centro"        TEXT,
    "duracionH"     DOUBLE PRECISION,
    "numPersonas"   INTEGER,

    CONSTRAINT "operaciones_hoja_ruta_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "materiales_operacion" (
    "id"          TEXT NOT NULL,
    "operacionId" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad"    DOUBLE PRECISION,
    "unidad"      TEXT,
    "sparePartId" TEXT,

    CONSTRAINT "materiales_operacion_pkey" PRIMARY KEY ("id")
);

-- Los nombres de índice llevan el nombre COMPLETO del campo, que es como los
-- genera Prisma. Abreviarlos hizo que Prisma creyera que faltaba el índice y
-- lo creara otra vez — dos índices iguales sobre la misma columna (bloque 16.3).
CREATE UNIQUE INDEX "hojas_de_ruta_tipoEquipo_key" ON "hojas_de_ruta"("tipoEquipo");
CREATE INDEX "hojas_de_ruta_activa_idx" ON "hojas_de_ruta"("activa");
CREATE INDEX "operaciones_hoja_ruta_hojaId_idx" ON "operaciones_hoja_ruta"("hojaId");
CREATE UNIQUE INDEX "operaciones_hoja_ruta_hojaId_operacion_subOperacion_key"
    ON "operaciones_hoja_ruta"("hojaId", "operacion", "subOperacion");
CREATE INDEX "materiales_operacion_operacionId_idx" ON "materiales_operacion"("operacionId");

-- Prisma SIEMPRE emite `ON DELETE ... ON UPDATE ...`. Si se omite, la CI
-- detecta desfase entre el esquema y las migraciones.
ALTER TABLE "hojas_de_ruta" ADD CONSTRAINT "hojas_de_ruta_aprobadaPorId_fkey"
    FOREIGN KEY ("aprobadaPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CASCADE: borrar la hoja se lleva sus pasos. Un paso sin hoja no significa nada.
ALTER TABLE "operaciones_hoja_ruta" ADD CONSTRAINT "operaciones_hoja_ruta_hojaId_fkey"
    FOREIGN KEY ("hojaId") REFERENCES "hojas_de_ruta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "materiales_operacion" ADD CONSTRAINT "materiales_operacion_operacionId_fkey"
    FOREIGN KEY ("operacionId") REFERENCES "operaciones_hoja_ruta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL: si se retira un repuesto del almacén, la hoja de ruta conserva el
-- NOMBRE del material y sólo pierde el enlace. La hoja es un documento y tiene
-- que poder nombrar algo que ya no está en el catálogo.
ALTER TABLE "materiales_operacion" ADD CONSTRAINT "materiales_operacion_sparePartId_fkey"
    FOREIGN KEY ("sparePartId") REFERENCES "spare_parts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
