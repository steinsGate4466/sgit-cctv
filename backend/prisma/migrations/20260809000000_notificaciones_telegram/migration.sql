-- =====================================================================
--  NOTIFICACIONES SALIENTES (bloque 4F) — montado y apagado
--
--  LA REGLA QUE MANDA SOBRE TODO EL DISENO:
--  CERRAR UNA ORDEN NO PUEDE FALLAR PORQUE TELEGRAM ESTE CAIDO.
--
--  Si el envio fuera parte de la transaccion de cierre, un corte de
--  internet dejaria al tecnico sin poder cerrar su orden a las once de la
--  noche, en planta, con el telefono en la mano. Por eso el aviso NO se
--  envia en el momento: se GUARDA aqui, dentro de la misma transaccion
--  (esto no puede fallar, es la misma base), y otro proceso lo manda.
--
--  Es el patron de "bandeja de salida". Nadie se entera de que Telegram
--  estaba caido salvo quien mire esta tabla.
-- =====================================================================

DO $$ BEGIN
  CREATE TYPE "NotificacionEstado" AS ENUM ('PENDIENTE', 'ENVIADA', 'FALLIDA', 'DESCARTADA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "NotificacionCanal" AS ENUM ('TELEGRAM', 'CORREO', 'TEAMS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "notificaciones_salientes" (
  "id"            TEXT PRIMARY KEY,
  "canal"         "NotificacionCanal" NOT NULL DEFAULT 'TELEGRAM',
  "estado"        "NotificacionEstado" NOT NULL DEFAULT 'PENDIENTE',
  "destino"       TEXT NOT NULL,
  "asunto"        TEXT NOT NULL,
  "cuerpo"        TEXT NOT NULL,
  "evento"        TEXT NOT NULL,
  "referenciaId"  TEXT,
  "intentos"      INTEGER NOT NULL DEFAULT 0,
  "proximoIntento" TIMESTAMP(3),
  "ultimoError"   TEXT,
  "silencioso"    BOOLEAN NOT NULL DEFAULT false,
  "creadaEn"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "enviadaEn"     TIMESTAMP(3)
);

CREATE INDEX IF NOT EXISTS "notificaciones_salientes_estado_idx"
  ON "notificaciones_salientes" ("estado", "proximoIntento");
CREATE INDEX IF NOT EXISTS "notificaciones_salientes_evento_idx"
  ON "notificaciones_salientes" ("evento");

-- A donde escribir. Telegram PROHIBE que un bot inicie conversacion: la
-- persona tiene que escribirle /start primero. Por eso el chat se guarda
-- cuando el bot lo recibe, no se puede rellenar a mano de antemano.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "telegram_chat_id" TEXT,
  ADD COLUMN IF NOT EXISTS "telegram_codigo" TEXT,
  ADD COLUMN IF NOT EXISTS "telegram_vinculado_en" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "users_telegram_chat_id_key"
  ON "users" ("telegram_chat_id");
CREATE UNIQUE INDEX IF NOT EXISTS "users_telegram_codigo_key"
  ON "users" ("telegram_codigo");

INSERT INTO "permissions" ("id", "code", "description") VALUES
  (gen_random_uuid(), 'notify.read',   'Ver las notificaciones enviadas y las que fallaron'),
  (gen_random_uuid(), 'notify.manage', 'Configurar avisos y reintentar envios')
ON CONFLICT ("code") DO NOTHING;

-- Quien administra usuarios administra los avisos: es la misma persona.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT rp."roleId", p."id"
  FROM "role_permissions" rp
  JOIN "permissions" pu ON pu."id" = rp."permissionId" AND pu."code" = 'user.manage'
  CROSS JOIN LATERAL (SELECT "id" FROM "permissions" WHERE "code" IN ('notify.read','notify.manage')) p
ON CONFLICT DO NOTHING;
