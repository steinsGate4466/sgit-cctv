-- =========================================================================
--  CAMPAÑAS DE MAPEO (12.5) — el control de calidad del levantamiento
--  -----------------------------------------------------------------------
--  Contra un dato mal cargado ningún respaldo sirve: el respaldo devuelve
--  fielmente el dato equivocado. La única defensa es que alguien DISTINTO
--  del que cargó revise antes de dar la zona por buena.
--
--  Migración ADITIVA: dos tablas nuevas, dos enums nuevos y UNA columna
--  opcional en `assets`. No modifica nada existente.
-- =========================================================================

CREATE TYPE "EstadoCampana" AS ENUM ('PLANIFICADA','EN_CURSO','EN_REVISION','CERRADA','CANCELADA');
CREATE TYPE "EstadoZona"    AS ENUM ('PENDIENTE','EN_CAMPO','CARGADA','EN_REVISION','APROBADA','DEVUELTA');

CREATE TABLE "campanas_mapeo" (
    "id"           TEXT NOT NULL,
    "codigo"       TEXT NOT NULL,
    "nombre"       TEXT NOT NULL,
    "estado"       "EstadoCampana" NOT NULL DEFAULT 'PLANIFICADA',
    "tren"         "PlantTrain",
    "descripcion"  TEXT,
    "responsableId" TEXT,
    "inicioPrevisto" TIMESTAMP(3),
    "finPrevisto"  TIMESTAMP(3),
    "cerradaEn"    TIMESTAMP(3),
    "creadoPorId"  TEXT,
    "creadoEn"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editadoEn"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "campanas_mapeo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "campanas_mapeo_codigo_key" ON "campanas_mapeo"("codigo");
CREATE INDEX "campanas_mapeo_estado_idx" ON "campanas_mapeo"("estado");
CREATE INDEX "campanas_mapeo_tren_idx"   ON "campanas_mapeo"("tren");

-- La unidad de reparto: una zona (ubicación) asignada a una persona.
CREATE TABLE "zonas_campana" (
    "id"            TEXT NOT NULL,
    "campanaId"     TEXT NOT NULL,
    "locationId"    TEXT NOT NULL,
    "estado"        "EstadoZona" NOT NULL DEFAULT 'PENDIENTE',
    "asignadoAId"   TEXT,
    "esperados"     INTEGER,
    "notas"         TEXT,
    -- Quién declaró la zona terminada, y quién la revisó. TIENEN QUE SER
    -- PERSONAS DISTINTAS: sin eso no es control de calidad, es una barra de
    -- progreso que se rellena sola.
    "cargadaPorId"  TEXT,
    "cargadaEn"     TIMESTAMP(3),
    "revisadaPorId" TEXT,
    "revisadaEn"    TIMESTAMP(3),
    "observaciones" TEXT,
    "creadoEn"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editadoEn"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "zonas_campana_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "zonas_campana_campanaId_locationId_key" ON "zonas_campana"("campanaId","locationId");
CREATE INDEX "zonas_campana_campanaId_idx"  ON "zonas_campana"("campanaId");
CREATE INDEX "zonas_campana_estado_idx"     ON "zonas_campana"("estado");
CREATE INDEX "zonas_campana_asignadoAId_idx" ON "zonas_campana"("asignadoAId");

ALTER TABLE "zonas_campana" ADD CONSTRAINT "zonas_campana_campanaId_fkey"
    FOREIGN KEY ("campanaId") REFERENCES "campanas_mapeo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "zonas_campana" ADD CONSTRAINT "zonas_campana_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- El activo recuerda en qué campaña se levantó. OPCIONAL: los que ya existen
-- no vienen de ninguna campaña, y eso está bien.
ALTER TABLE "assets" ADD COLUMN "campanaId" TEXT;
CREATE INDEX "assets_campanaId_idx" ON "assets"("campanaId");
ALTER TABLE "assets" ADD CONSTRAINT "assets_campanaId_fkey"
    FOREIGN KEY ("campanaId") REFERENCES "campanas_mapeo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
