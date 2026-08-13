-- =========================================================================
--  DIRECCIONAMIENTO IP (IPAM) — bloque 20
--  -----------------------------------------------------------------------
--  LA PREGUNTA QUE HOY NADIE PUEDE CONTESTAR
--  «Voy a instalar una cámara. ¿Qué IP le pongo?»
--
--  Hoy se contesta mirando un Excel desactualizado, o peor: haciendo ping a
--  una IP y, si no responde, usándola. Eso funciona hasta el día que el
--  equipo que la tenía estaba apagado por mantenimiento — y entonces hay dos
--  equipos con la misma IP, que se tumban entre ellos de forma intermitente.
--
--  Es el fallo más difícil de diagnosticar de una red: funciona a ratos.
--
--  Migración aditiva: dos tablas nuevas.
-- =========================================================================

CREATE TYPE "PropositoSubred" AS ENUM ('CCTV','GESTION','CORPORATIVA','PROCESO','WIFI','OTRO');
CREATE TYPE "TipoAsignacion"  AS ENUM ('ESTATICA','RESERVA_DHCP','DHCP','RESERVADA','LIBRE');

CREATE TABLE "subredes" (
    "id"           TEXT NOT NULL,
    "cidr"         TEXT NOT NULL,
    "nombre"       TEXT NOT NULL,
    "proposito"    "PropositoSubred" NOT NULL DEFAULT 'CCTV',
    "vlan"         INTEGER,
    "gateway"      TEXT,
    "dns1"         TEXT,
    "dns2"         TEXT,
    "tren"         "PlantTrain",
    "locationId"   TEXT,
    -- Rango que gestiona el DHCP. Fuera de ahi van las estaticas.
    "dhcpDesde"    TEXT,
    "dhcpHasta"    TEXT,
    "descripcion"  TEXT,
    "activa"       BOOLEAN NOT NULL DEFAULT true,
    "creadoPorId"  TEXT,
    "creadoEn"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editadoEn"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "subredes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "subredes_cidr_key" ON "subredes"("cidr");
CREATE INDEX "subredes_tren_idx" ON "subredes"("tren");
ALTER TABLE "subredes" ADD CONSTRAINT "subredes_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Reservas DECLARADAS. La ocupacion real se cruza ademas con `assets.ipAddress`,
-- porque un equipo puede tener IP y no estar reservada aqui: eso es
-- justamente lo que hay que sacar a la luz.
CREATE TABLE "reservas_ip" (
    "id"          TEXT NOT NULL,
    "ip"          TEXT NOT NULL,
    "subredId"    TEXT,
    "tipo"        "TipoAsignacion" NOT NULL DEFAULT 'ESTATICA',
    "assetId"     TEXT,
    "hostname"    TEXT,
    "mac"         TEXT,
    "descripcion" TEXT,
    "notas"       TEXT,
    "creadoPorId" TEXT,
    "creadoEn"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editadoEn"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reservas_ip_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "reservas_ip_ip_key" ON "reservas_ip"("ip");
CREATE INDEX "reservas_ip_subredId_idx" ON "reservas_ip"("subredId");
CREATE INDEX "reservas_ip_assetId_idx"  ON "reservas_ip"("assetId");
ALTER TABLE "reservas_ip" ADD CONSTRAINT "reservas_ip_subredId_fkey"
    FOREIGN KEY ("subredId") REFERENCES "subredes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reservas_ip" ADD CONSTRAINT "reservas_ip_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
