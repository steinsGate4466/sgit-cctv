-- =========================================================================
--  BLOQUE 18 — CONTROL DE ACCESO POR DISPOSITIVO + ELECTRICIDAD
--  -----------------------------------------------------------------------
--  Aditiva: tablas y enums nuevos, un valor nuevo al FINAL del enum AssetType
--  (PostgreSQL sólo deja añadir al final) y dos columnas opcionales.
-- =========================================================================

-- ------------------------------------------------- ACCESO POR DISPOSITIVO
CREATE TYPE "EstadoDispositivo" AS ENUM ('PENDIENTE','APROBADO','BLOQUEADO');

CREATE TABLE "dispositivos_autorizados" (
    "id"              TEXT NOT NULL,
    -- El identificador que manda el navegador en la cabecera X-Dispositivo.
    "dispositivoId"   TEXT NOT NULL,
    "estado"          "EstadoDispositivo" NOT NULL DEFAULT 'PENDIENTE',
    "nombre"          TEXT,
    "equipoConocidoId" TEXT,
    "userAgent"       TEXT,
    "ultimaIp"        TEXT,
    "ipsVistas"       TEXT,
    "usuarioId"       TEXT,
    "primerVistoEn"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoVistoEn"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vistas"          INTEGER NOT NULL DEFAULT 1,
    "aprobadoPorId"   TEXT,
    "aprobadoEn"      TIMESTAMP(3),
    "motivo"          TEXT,
    CONSTRAINT "dispositivos_autorizados_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "dispositivos_autorizados_dispositivoId_key" ON "dispositivos_autorizados"("dispositivoId");
CREATE INDEX "dispositivos_autorizados_estado_idx" ON "dispositivos_autorizados"("estado");
ALTER TABLE "dispositivos_autorizados" ADD CONSTRAINT "dispositivos_autorizados_equipoConocidoId_fkey"
    FOREIGN KEY ("equipoConocidoId") REFERENCES "equipos_conocidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- El equipo conocido puede exigir que SÓLO se entre desde él.
ALTER TABLE "equipos_conocidos" ADD COLUMN "soloDesdeAqui" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "equipos_conocidos" ADD COLUMN "redPermitida" TEXT;

-- ------------------------------------------------------------ ELECTRICIDAD
ALTER TYPE "AssetType" ADD VALUE IF NOT EXISTS 'TABLERO_ELECTRICO';

CREATE TYPE "TipoTablero"    AS ENUM ('MCC','DISTRIBUCION','CONTROL','ILUMINACION','UPS','TRANSFORMADOR','OTRO');
CREATE TYPE "TipoProteccion" AS ENUM ('TERMOMAGNETICO','DIFERENCIAL','FUSIBLE','GUARDAMOTOR','SECCIONADOR','OTRO');
CREATE TYPE "EstadoCircuito" AS ENUM ('ACTIVO','FUERA_SERVICIO','RESERVA','DESCONOCIDO');

CREATE TABLE "tableros_electricos" (
    "id"           TEXT NOT NULL,
    "codigo"       TEXT NOT NULL,
    "nombre"       TEXT NOT NULL,
    "tipo"         "TipoTablero" NOT NULL DEFAULT 'DISTRIBUCION',
    "locationId"   TEXT,
    "tren"         "PlantTrain",
    "referencia"   TEXT,
    "comoLlegar"   TEXT,
    "tensionV"     INTEGER,
    "fases"        INTEGER,
    "corrienteNominalA" DOUBLE PRECISION,
    "alimentadoDeId" TEXT,
    "assetId"      TEXT,
    "fotoFileId"   TEXT,
    "riesgos"      TEXT,
    "requierePermiso" BOOLEAN NOT NULL DEFAULT true,
    "notas"        TEXT,
    "creadoPorId"  TEXT,
    "creadoEn"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editadoEn"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tableros_electricos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tableros_electricos_codigo_key" ON "tableros_electricos"("codigo");
CREATE INDEX "tableros_electricos_locationId_idx" ON "tableros_electricos"("locationId");
CREATE INDEX "tableros_electricos_tren_idx" ON "tableros_electricos"("tren");
ALTER TABLE "tableros_electricos" ADD CONSTRAINT "tableros_electricos_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tableros_electricos" ADD CONSTRAINT "tableros_electricos_alimentadoDeId_fkey"
    FOREIGN KEY ("alimentadoDeId") REFERENCES "tableros_electricos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tableros_electricos" ADD CONSTRAINT "tableros_electricos_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "circuitos_electricos" (
    "id"          TEXT NOT NULL,
    "tableroId"   TEXT NOT NULL,
    "numero"      TEXT NOT NULL,
    "designacion" TEXT,
    "proteccion"  "TipoProteccion" NOT NULL DEFAULT 'TERMOMAGNETICO',
    "amperajeA"   DOUBLE PRECISION,
    "curva"       TEXT,
    "polos"       INTEGER,
    "tensionV"    INTEGER,
    "estado"      "EstadoCircuito" NOT NULL DEFAULT 'ACTIVO',
    "esCctv"      BOOLEAN NOT NULL DEFAULT false,
    "notas"       TEXT,
    "creadoEn"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editadoEn"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "circuitos_electricos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "circuitos_electricos_tableroId_numero_key" ON "circuitos_electricos"("tableroId","numero");
CREATE INDEX "circuitos_electricos_tableroId_idx" ON "circuitos_electricos"("tableroId");
CREATE INDEX "circuitos_electricos_esCctv_idx" ON "circuitos_electricos"("esCctv");
ALTER TABLE "circuitos_electricos" ADD CONSTRAINT "circuitos_electricos_tableroId_fkey"
    FOREIGN KEY ("tableroId") REFERENCES "tableros_electricos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- LA TABLA QUE DE VERDAD IMPORTA: qué equipo cuelga de qué llave.
-- Cuando salta un térmico, esto contesta "se te fueron estas 14 cámaras".
CREATE TABLE "alimentacion_activo" (
    "id"         TEXT NOT NULL,
    "circuitoId" TEXT NOT NULL,
    "assetId"    TEXT NOT NULL,
    "viaPoe"     BOOLEAN NOT NULL DEFAULT false,
    "notas"      TEXT,
    "creadoEn"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "alimentacion_activo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "alimentacion_activo_circuitoId_assetId_key" ON "alimentacion_activo"("circuitoId","assetId");
CREATE INDEX "alimentacion_activo_assetId_idx" ON "alimentacion_activo"("assetId");
ALTER TABLE "alimentacion_activo" ADD CONSTRAINT "alimentacion_activo_circuitoId_fkey"
    FOREIGN KEY ("circuitoId") REFERENCES "circuitos_electricos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alimentacion_activo" ADD CONSTRAINT "alimentacion_activo_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "mediciones_electricas" (
    "id"         TEXT NOT NULL,
    "circuitoId" TEXT,
    "tableroId"  TEXT,
    "fecha"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tensionV"   DOUBLE PRECISION,
    "corrienteA" DOUBLE PRECISION,
    "temperaturaC" DOUBLE PRECISION,
    "observacion" TEXT,
    "medidoPorId" TEXT,
    CONSTRAINT "mediciones_electricas_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "mediciones_electricas_circuitoId_idx" ON "mediciones_electricas"("circuitoId");
CREATE INDEX "mediciones_electricas_tableroId_idx" ON "mediciones_electricas"("tableroId");
ALTER TABLE "mediciones_electricas" ADD CONSTRAINT "mediciones_electricas_circuitoId_fkey"
    FOREIGN KEY ("circuitoId") REFERENCES "circuitos_electricos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mediciones_electricas" ADD CONSTRAINT "mediciones_electricas_tableroId_fkey"
    FOREIGN KEY ("tableroId") REFERENCES "tableros_electricos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =========================================================================
--  UN SWITCH DENTRO DE UN TABLERO ELÉCTRICO
--  -----------------------------------------------------------------------
--  En planta hay tableros eléctricos que llevan dentro switches pequeños
--  (los Hikvision de 4-8 puertos). Ese switch NO está en un gabinete de
--  comunicaciones: está atornillado dentro del tablero.
--
--  LA ALTERNATIVA QUE SE DESCARTÓ: crear un "gabinete" falso por cada
--  tablero. Eso deja DOS registros para UNA sola cosa física, y a los tres
--  meses nadie sabe cuál es el bueno. Uno se actualiza y el otro no.
--
--  Así que el activo puede decir dónde está montado: en un gabinete O en un
--  tablero. Los dos campos son opcionales y se excluyen en la práctica.
-- =========================================================================
ALTER TABLE "assets" ADD COLUMN "tableroId" TEXT;
CREATE INDEX "assets_tableroId_idx" ON "assets"("tableroId");
ALTER TABLE "assets" ADD CONSTRAINT "assets_tableroId_fkey"
    FOREIGN KEY ("tableroId") REFERENCES "tableros_electricos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
