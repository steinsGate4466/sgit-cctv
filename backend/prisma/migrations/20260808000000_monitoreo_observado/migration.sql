-- =====================================================================
--  MONITOREO: ESTADO OBSERVADO (bloque 8, preparado y apagado)
--
--  POR QUE AHORA, SI TODAVIA NO HAY LUZ VERDE DE TI
--  Porque lo que tarda no es hacer ping: es acordar el modelo de datos,
--  decidir quien manda a quien, y repasar la seguridad. Todo eso se hace
--  ahora y queda listo. El dia que TI autorice, se instala el agente y
--  empieza a llegar informacion. Cero cambios de esquema ese dia.
--
--  QUE GUARDA
--  Lo OBSERVADO, separado de lo DECLARADO. Son dos cosas distintas y
--  mezclarlas seria el peor error posible:
--    - declarado : lo que dice el sistema (assets.status). Lo pone una
--                  persona y refleja una DECISION: "esta de baja".
--    - observado : lo que se ve en la red. Lo pone una maquina y refleja
--                  un HECHO: "no responde desde hace 14 minutos".
--  Una camara puede estar declarada OPERATIVO y no responder: eso no es
--  una contradiccion, es exactamente la informacion valiosa.
--
--  NO SE TOCA assets.status. Ni una columna. El estado observado vive en
--  su propia tabla y el sistema sigue funcionando igual que hoy si nunca
--  llega ni un solo reporte.
-- =====================================================================

DO $$ BEGIN
  CREATE TYPE "ProbeSource" AS ENUM ('AGENTE', 'ZABBIX', 'HIKCENTRAL', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ProbeResult" AS ENUM ('RESPONDE', 'NO_RESPONDE', 'DEGRADADO', 'DESCONOCIDO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Ultima observacion por activo. UNA fila por activo, no un historico:
-- el historico de pings de 2.000 camaras cada minuto son 2.8 millones de
-- filas al dia y no aporta nada que no diga la ultima. El historico que
-- importa -cuando se cayo y cuanto duro- son las incidencias, que ya
-- existen.
CREATE TABLE IF NOT EXISTS "asset_observations" (
  "assetId"      TEXT PRIMARY KEY,
  "result"       "ProbeResult" NOT NULL DEFAULT 'DESCONOCIDO',
  "source"       "ProbeSource" NOT NULL DEFAULT 'AGENTE',
  "latencyMs"    INTEGER,
  "lastSeenAt"   TIMESTAMP(3),
  "checkedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "consecutiveFails" INTEGER NOT NULL DEFAULT 0,
  "note"         TEXT
);

DO $$ BEGIN
  ALTER TABLE "asset_observations"
    ADD CONSTRAINT "asset_observations_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "asset_observations_result_idx" ON "asset_observations" ("result");
CREATE INDEX IF NOT EXISTS "asset_observations_checkedAt_idx" ON "asset_observations" ("checkedAt");

-- Registro de los agentes autorizados a reportar. Sin esto, el endpoint de
-- ingesta seria un buzon abierto donde cualquiera podria declarar que media
-- planta esta caida.
CREATE TABLE IF NOT EXISTS "monitor_agents" (
  "id"          TEXT PRIMARY KEY,
  "name"        TEXT NOT NULL,
  "tokenHash"   TEXT NOT NULL,
  "active"      BOOLEAN NOT NULL DEFAULT true,
  "lastReportAt" TIMESTAMP(3),
  "lastIp"      TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "monitor_agents_name_key" ON "monitor_agents" ("name");

-- Permiso para ver y administrar el monitoreo.
INSERT INTO "permissions" ("id", "code", "description") VALUES
  (gen_random_uuid(), 'monitor.read',   'Ver el estado observado de la red'),
  (gen_random_uuid(), 'monitor.manage', 'Dar de alta agentes de monitoreo')
ON CONFLICT ("code") DO NOTHING;

-- Quien ya ve activos, ve el estado observado: es el mismo dato con otra
-- fuente. Administrar agentes NO se reparte: se da a mano.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT rp."roleId", p."id"
  FROM "role_permissions" rp
  JOIN "permissions" pa ON pa."id" = rp."permissionId" AND pa."code" = 'asset.read'
  CROSS JOIN LATERAL (SELECT "id" FROM "permissions" WHERE "code" = 'monitor.read') p
ON CONFLICT DO NOTHING;
