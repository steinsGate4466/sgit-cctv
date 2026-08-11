-- =========================================================================
--  BLOQUE 16 — VENTANAS DE PARADA + INSTALACIONES
--  -----------------------------------------------------------------------
--  Migración ADITIVA: tablas y enums nuevos. No modifica ninguna columna
--  existente, no borra nada, no cambia ningún tipo. Las dos FK hacia
--  work_orders y assets son OPCIONALES.
-- =========================================================================

-- ---------------------------------------------------------------- PARADAS
CREATE TYPE "EstadoParada" AS ENUM ('ANUNCIADA','CONFIRMADA','EN_CURSO','TERMINADA','CANCELADA');
CREATE TYPE "OrigenParada" AS ENUM ('PRODUCCION','MANTENIMIENTO','FALLA','PROGRAMADA');

CREATE TABLE "ventanas_parada" (
    "id"              TEXT NOT NULL,
    "tren"            "PlantTrain" NOT NULL,
    "estado"          "EstadoParada" NOT NULL DEFAULT 'ANUNCIADA',
    "origen"          "OrigenParada" NOT NULL DEFAULT 'PRODUCCION',
    -- Lo que dijo Producción. Cambia, y por eso está separado de lo real.
    "inicioPrevisto"  TIMESTAMP(3) NOT NULL,
    "finPrevisto"     TIMESTAMP(3),
    "duracionPrevMin" INTEGER,
    -- Lo que pasó de verdad. Se llena en campo.
    "inicioReal"      TIMESTAMP(3),
    "finReal"         TIMESTAMP(3),
    "motivo"          TEXT,
    "avisadoPor"      TEXT,
    "canalAviso"      TEXT,
    "notas"           TEXT,
    "creadoPorId"     TEXT,
    "creadoEn"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editadoEn"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ventanas_parada_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ventanas_parada_tren_estado_idx"  ON "ventanas_parada"("tren","estado");
CREATE INDEX "ventanas_parada_inicioPrev_idx"   ON "ventanas_parada"("inicioPrevisto");

-- CADA CAMBIO DE HORA QUEDA. Producción avisa a última hora y mueve la
-- parada dos o tres veces; sin este registro nadie puede demostrar que la
-- ventana se movió, y el trabajo no hecho parece culpa de mantenimiento.
CREATE TABLE "cambios_parada" (
    "id"          TEXT NOT NULL,
    "paradaId"    TEXT NOT NULL,
    "campo"       TEXT NOT NULL,
    "valorAntes"  TEXT,
    "valorDespues" TEXT,
    "motivo"      TEXT,
    "porId"       TEXT,
    "en"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cambios_parada_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cambios_parada_paradaId_idx" ON "cambios_parada"("paradaId");
ALTER TABLE "cambios_parada" ADD CONSTRAINT "cambios_parada_paradaId_fkey"
    FOREIGN KEY ("paradaId") REFERENCES "ventanas_parada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- La OM puede colgarse de una ventana. OPCIONAL: hay trabajo que no la necesita.
ALTER TABLE "work_orders" ADD COLUMN "paradaId" TEXT;
CREATE INDEX "work_orders_paradaId_idx" ON "work_orders"("paradaId");
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_paradaId_fkey"
    FOREIGN KEY ("paradaId") REFERENCES "ventanas_parada"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ----------------------------------------------------------- INSTALACIONES
CREATE TYPE "TipoSitio" AS ENUM (
    'OFICINA','PULPITO','GRUA','SALA_ELECTRICA','NAVE','PATIO','ALMACEN',
    'CASETA','SUBESTACION','LABORATORIO','OTRO'
);
CREATE TYPE "EstadoInstalacion" AS ENUM (
    'SOLICITADA','EN_EVALUACION','EVALUADA','APROBADA','RECHAZADA',
    'EN_EJECUCION','INSTALADA','CANCELADA'
);

CREATE TABLE "instalaciones" (
    "id"             TEXT NOT NULL,
    "codigo"         TEXT NOT NULL,
    "estado"         "EstadoInstalacion" NOT NULL DEFAULT 'SOLICITADA',
    "tipoSitio"      "TipoSitio" NOT NULL,
    "tipoEquipo"     "AssetType" NOT NULL,
    "cantidad"       INTEGER NOT NULL DEFAULT 1,
    "tren"           "PlantTrain",
    "locationId"     TEXT,
    "referenciaSitio" TEXT,
    "comoLlegar"     TEXT,
    "justificacion"  TEXT NOT NULL,
    "solicitadaPor"  TEXT,
    "areaSolicitante" TEXT,

    -- ---- Lo que se mide EN LA VISITA, no se supone desde la oficina ----
    "hayEnergia"        BOOLEAN,
    "tipoEnergia"       TEXT,
    "hayPuntoRed"       BOOLEAN,
    "gabineteCercano"   TEXT,
    "metrosCable"       DOUBLE PRECISION,
    "rutaCable"         TEXT,
    "necesitaPoe"       BOOLEAN,
    "switchDestinoId"   TEXT,
    "nvrDestinoId"      TEXT,
    "canalNvr"          INTEGER,

    -- ---- Acceso y seguridad. Cambia TODO segun el tipo de sitio ----
    "alturaMetros"      DOUBLE PRECISION,
    "necesitaManlift"   BOOLEAN,
    "necesitaAndamio"   BOOLEAN,
    "necesitaParada"    BOOLEAN,
    "necesitaLoto"      BOOLEAN,
    "necesitaPermisoAltura" BOOLEAN,
    "necesitaPermisoCaliente" BOOLEAN,
    "riesgos"           TEXT,
    "quienAutoriza"     TEXT,

    -- ---- Especifico de GRUA ----
    "gruaNombre"        TEXT,
    "gruaSeDetiene"     BOOLEAN,
    "porCadenaPortacables" BOOLEAN,
    "porAntena"         BOOLEAN,
    "antenaModelo"      TEXT,
    "distanciaEnlaceM"  DOUBLE PRECISION,
    "hayLineaVista"     BOOLEAN,

    -- ---- Especifico de OFICINA / PULPITO ----
    "hayFalsoTecho"     BOOLEAN,
    "hayCanaleta"       BOOLEAN,
    "esClimatizado"     BOOLEAN,
    "pantallaExistente" TEXT,
    "puestoOperador"    TEXT,

    -- ---- Ambiente e intemperie ----
    "ambiente"          "Environment",
    "necesitaGabineteEstanco" BOOLEAN,
    "gradoIpRequerido"  TEXT,

    "materialesEstimados" TEXT,
    "costoEstimado"     DOUBLE PRECISION,
    "moneda"            TEXT DEFAULT 'PEN',

    "evaluadaPorId"     TEXT,
    "evaluadaEn"        TIMESTAMP(3),
    "aprobadaPorId"     TEXT,
    "aprobadaEn"        TIMESTAMP(3),
    "motivoRechazo"     TEXT,

    "workOrderId"       TEXT,
    "assetCreadoId"     TEXT,
    "instaladaEn"       TIMESTAMP(3),
    "notas"             TEXT,
    "creadoPorId"       TEXT,
    "creadoEn"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editadoEn"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "instalaciones_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "instalaciones_codigo_key" ON "instalaciones"("codigo");
CREATE INDEX "instalaciones_estado_idx"        ON "instalaciones"("estado");
CREATE INDEX "instalaciones_tipoSitio_idx"     ON "instalaciones"("tipoSitio");
CREATE INDEX "instalaciones_tren_idx"          ON "instalaciones"("tren");
CREATE INDEX "instalaciones_locationId_idx"    ON "instalaciones"("locationId");

ALTER TABLE "instalaciones" ADD CONSTRAINT "instalaciones_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "instalaciones" ADD CONSTRAINT "instalaciones_workOrderId_fkey"
    FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "instalaciones" ADD CONSTRAINT "instalaciones_assetCreadoId_fkey"
    FOREIGN KEY ("assetCreadoId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Fotos del sitio ANTES de instalar. Una foto del techo del pulpito ahorra
-- la segunda visita: se ve si hay canaleta sin volver a subir.
CREATE TABLE "fotos_instalacion" (
    "id"             TEXT NOT NULL,
    "instalacionId"  TEXT NOT NULL,
    "fileId"         TEXT NOT NULL,
    "descripcion"    TEXT,
    "momento"        TEXT NOT NULL DEFAULT 'ANTES',
    "creadoEn"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fotos_instalacion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "fotos_instalacion_instalacionId_idx" ON "fotos_instalacion"("instalacionId");
ALTER TABLE "fotos_instalacion" ADD CONSTRAINT "fotos_instalacion_instalacionId_fkey"
    FOREIGN KEY ("instalacionId") REFERENCES "instalaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
