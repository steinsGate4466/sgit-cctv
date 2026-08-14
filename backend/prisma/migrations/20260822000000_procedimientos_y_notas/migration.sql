-- =========================================================================
--  PROCEDIMIENTO DE RESTAURACIÓN Y NOTAS DE CAMPO — bloque 29
--  -----------------------------------------------------------------------
--  DOS PROBLEMAS, UNA MISMA PUERTA: EL QR DEL EQUIPO
--
--  1) LA ENTREGA DE TURNO SE PIERDE HABLANDO.
--     El técnico que sale sabe cosas que el que entra necesita: «la 12 la
--     dejé en el puerto 8 provisional», «no subas al poste 4, la escalera
--     está mal». Hoy eso se transmite en el relevo, y cuando el relevo no
--     coincide, desaparece.
--
--     Aquí NO se resuelve con un módulo de bitácora de turno. Se resuelve
--     pegando la nota AL EQUIPO. Nadie tiene que acordarse de llenar una
--     bitácora al final del turno, cansado y con ganas de irse: la nota se
--     escribe trabajando, y aparece sola cuando el siguiente escanea el QR.
--
--  2) LA EXPERIENCIA DE ARREGLAR UN EQUIPO NO SE ACUMULA.
--     El que ya restauró esa cámara tres veces sabe el atajo. El que llega
--     nuevo lo redescubre. El procedimiento va por MODELO, no por activo: si
--     colgara de cada cámara habría 300 procedimientos vacíos y nadie
--     llenaría ninguno. Por modelo se escribe UNA vez y sirve para las 300.
--
--     Y cada intervención puede proponer una mejora, que el Jefe acepta o
--     rechaza. Así el tiempo de reparación baja solo, con la experiencia
--     real, en vez de quedarse congelado en lo que alguien escribió el
--     primer día.
--
--  Migración ADITIVA: tres tablas nuevas. Nada existente cambia.
-- =========================================================================

DO $$ BEGIN
  CREATE TYPE "EstadoMejora" AS ENUM ('PROPUESTA','ACEPTADA','RECHAZADA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "TipoNotaCampo" AS ENUM (
    'DEJADO_A_MEDIAS',   -- lo que quedó provisional y hay que terminar
    'VIGILAR',           -- algo que puede volver a fallar
    'RIESGO_ACCESO',     -- la escalera, el poste, el paso bloqueado
    'ESPERANDO_A_OTRO'   -- almacén, TI, Producción, un tercero
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---- 1. Procedimiento de restauración, por MODELO de equipo -------------
CREATE TABLE IF NOT EXISTS "procedimientos_restauracion" (
    "id"          TEXT NOT NULL,
    "tipoActivo"  "AssetType" NOT NULL,
    -- Marca y modelo vacíos = vale para todo ese tipo. Es la red de abajo:
    -- siempre hay algo que enseñar aunque nadie haya escrito el del modelo.
    "marca"       TEXT,
    "modelo"      TEXT,
    "titulo"      TEXT NOT NULL,
    "pasos"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "advertencias" TEXT,
    -- Cuánto suele llevar. Sirve para dos cosas: que el técnico sepa si le
    -- entra en la ventana, y para comparar con el tiempo real y ver si el
    -- procedimiento está mejorando de verdad o sólo sobre el papel.
    "minutosEstimados" INTEGER,
    "activo"      BOOLEAN NOT NULL DEFAULT true,
    "creadoPorId" TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "procedimientos_restauracion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "procedimientos_restauracion_tipoActivo_marca_modelo_idx"
  ON "procedimientos_restauracion"("tipoActivo", "marca", "modelo");

ALTER TABLE "procedimientos_restauracion" DROP CONSTRAINT IF EXISTS "procedimientos_restauracion_creadoPorId_fkey";
ALTER TABLE "procedimientos_restauracion" ADD CONSTRAINT "procedimientos_restauracion_creadoPorId_fkey"
  FOREIGN KEY ("creadoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---- 2. Mejoras propuestas desde una intervención real ------------------
CREATE TABLE IF NOT EXISTS "mejoras_procedimiento" (
    "id"              TEXT NOT NULL,
    "procedimientoId" TEXT NOT NULL,
    -- De qué orden salió. Una mejora sin trabajo detrás es una opinión.
    "workOrderId"     TEXT,
    "texto"           TEXT NOT NULL,
    "minutosReales"   INTEGER,
    "estado"          "EstadoMejora" NOT NULL DEFAULT 'PROPUESTA',
    "propuestaPorId"  TEXT,
    "decididaPorId"   TEXT,
    "decididaEn"      TIMESTAMP(3),
    "motivoDecision"  TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mejoras_procedimiento_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mejoras_procedimiento_procedimientoId_estado_idx"
  ON "mejoras_procedimiento"("procedimientoId", "estado");

ALTER TABLE "mejoras_procedimiento" DROP CONSTRAINT IF EXISTS "mejoras_procedimiento_procedimientoId_fkey";
ALTER TABLE "mejoras_procedimiento" ADD CONSTRAINT "mejoras_procedimiento_procedimientoId_fkey"
  FOREIGN KEY ("procedimientoId") REFERENCES "procedimientos_restauracion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mejoras_procedimiento" DROP CONSTRAINT IF EXISTS "mejoras_procedimiento_workOrderId_fkey";
ALTER TABLE "mejoras_procedimiento" ADD CONSTRAINT "mejoras_procedimiento_workOrderId_fkey"
  FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "mejoras_procedimiento" DROP CONSTRAINT IF EXISTS "mejoras_procedimiento_propuestaPorId_fkey";
ALTER TABLE "mejoras_procedimiento" ADD CONSTRAINT "mejoras_procedimiento_propuestaPorId_fkey"
  FOREIGN KEY ("propuestaPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "mejoras_procedimiento" DROP CONSTRAINT IF EXISTS "mejoras_procedimiento_decididaPorId_fkey";
ALTER TABLE "mejoras_procedimiento" ADD CONSTRAINT "mejoras_procedimiento_decididaPorId_fkey"
  FOREIGN KEY ("decididaPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---- 3. Notas de campo: la entrega de turno, pegada al equipo -----------
CREATE TABLE IF NOT EXISTS "notas_de_campo" (
    "id"          TEXT NOT NULL,
    "assetId"     TEXT NOT NULL,
    "tipo"        "TipoNotaCampo" NOT NULL,
    "texto"       TEXT NOT NULL,
    -- La nota MUERE SOLA. Sin esto, en seis meses el QR devuelve veinte
    -- avisos viejos y el técnico deja de leerlos — que es peor que no
    -- tenerlos, porque el aviso que sí importa queda enterrado.
    "vigenteHasta" TIMESTAMP(3),
    "resuelta"     BOOLEAN NOT NULL DEFAULT false,
    "resueltaPorId" TEXT,
    "resueltaEn"    TIMESTAMP(3),
    "workOrderId"  TEXT,
    "autorId"      TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notas_de_campo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "notas_de_campo_assetId_resuelta_idx"
  ON "notas_de_campo"("assetId", "resuelta");

ALTER TABLE "notas_de_campo" DROP CONSTRAINT IF EXISTS "notas_de_campo_assetId_fkey";
ALTER TABLE "notas_de_campo" ADD CONSTRAINT "notas_de_campo_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notas_de_campo" DROP CONSTRAINT IF EXISTS "notas_de_campo_autorId_fkey";
ALTER TABLE "notas_de_campo" ADD CONSTRAINT "notas_de_campo_autorId_fkey"
  FOREIGN KEY ("autorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notas_de_campo" DROP CONSTRAINT IF EXISTS "notas_de_campo_resueltaPorId_fkey";
ALTER TABLE "notas_de_campo" ADD CONSTRAINT "notas_de_campo_resueltaPorId_fkey"
  FOREIGN KEY ("resueltaPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notas_de_campo" DROP CONSTRAINT IF EXISTS "notas_de_campo_workOrderId_fkey";
ALTER TABLE "notas_de_campo" ADD CONSTRAINT "notas_de_campo_workOrderId_fkey"
  FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---- Permiso: escribir procedimientos ------------------------------------
-- Las NOTAS no llevan permiso propio: quien puede tocar una orden (wo.update)
-- puede dejar una nota. Pedir un permiso aparte para avisar «no subas por
-- esa escalera» sería la forma más tonta de que nadie avise.
INSERT INTO "permissions" ("id", "code", "description")
SELECT gen_random_uuid(), 'procedimiento.manage',
       'Escribir y aprobar los procedimientos de restauración por modelo de equipo'
WHERE NOT EXISTS (SELECT 1 FROM "permissions" WHERE "code" = 'procedimiento.manage');

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
  FROM "roles" r CROSS JOIN "permissions" p
 WHERE p."code" = 'procedimiento.manage'
   AND r."name" IN ('Jefe de Mantenimiento', 'Supervisor TI')
   AND NOT EXISTS (SELECT 1 FROM "role_permissions" rp
                    WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id");
