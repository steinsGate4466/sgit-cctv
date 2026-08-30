-- ============================================================================
-- BLOQUE 74 · SE BORRA «FIBRA» DE LA LISTA DE TIPOS DE EQUIPO
-- ----------------------------------------------------------------------------
-- POR QUÉ
--
-- Un cable NO es un activo. Es lo que CONECTA dos activos. No tiene marca ni
-- serie, no se le hace rutina, y no se pide como repuesto con código: se
-- compra por metro. Va en «Conexiones», que es donde vive un enlace entre dos
-- equipos.
--
-- `FIBER` estaba en la lista de tipos y se ofrecía al dar de alta un equipo,
-- así que se podía crear una fibra con ficha, QR e historial de mantenimiento.
--
-- ----------------------------------------------------------------------------
-- LA RED DE SEGURIDAD, Y ES LO IMPORTANTE DE ESTE ARCHIVO
--
-- Está escrito en CLAUDE.md desde el primer día: los valores de un enum de
-- PostgreSQL sólo se pueden AÑADIR. Borrar uno exige recrear el tipo entero, y
-- si alguna fila lo usa, la migración deja la tabla rota.
--
-- Por eso lo PRIMERO que hace este archivo es COMPROBARLO. Si encuentra una
-- sola fila usando FIBER en cualquiera de las cinco tablas, se PARA con un
-- mensaje que dice exactamente qué hacer. No borra nada a medias.
--
-- Es preferible que la migración falle a que la base quede inconsistente: un
-- fallo se lee y se arregla; una base rota se descubre tres días después.
--
-- ----------------------------------------------------------------------------
-- CINCO TABLAS USAN ESTA LISTA, y todas hay que pasarlas:
--   assets · instalaciones · procedimientos_restauracion ·
--   modelos_equipo · checklist_templates
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. FRENO DE SEGURIDAD. Si hay datos, se para y se explica.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  n_assets  INT;
  n_inst    INT;
  n_proc    INT;
  n_modelo  INT;
  n_check   INT;
BEGIN
  SELECT COUNT(*) INTO n_assets FROM "assets"                       WHERE "type"       = 'FIBER';
  SELECT COUNT(*) INTO n_inst   FROM "instalaciones"                WHERE "tipoEquipo" = 'FIBER';
  SELECT COUNT(*) INTO n_proc   FROM "procedimientos_restauracion"  WHERE "tipoActivo" = 'FIBER';
  SELECT COUNT(*) INTO n_modelo FROM "modelos_equipo"               WHERE "tipoActivo" = 'FIBER';
  SELECT COUNT(*) INTO n_check  FROM "checklist_templates"          WHERE "assetType"  = 'FIBER';

  IF (n_assets + n_inst + n_proc + n_modelo + n_check) > 0 THEN
    RAISE EXCEPTION
      'No se puede borrar FIBER: hay registros usandolo (activos=%, instalaciones=%, procedimientos=%, modelos=%, checklists=%). Conviertelos en CONEXIONES desde la pantalla de Conexiones y vuelve a aplicar esta migracion.',
      n_assets, n_inst, n_proc, n_modelo, n_check;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Se recrea la lista SIN «FIBER».
--    El orden de los valores se conserva tal cual estaba: cambiarlo no rompe
--    nada funcionalmente, pero hace ilegible cualquier comparación futura
--    entre el esquema y la base.
-- ---------------------------------------------------------------------------
ALTER TYPE "AssetType" RENAME TO "AssetType_viejo";

CREATE TYPE "AssetType" AS ENUM (
  'CAMERA', 'NVR', 'SWITCH', 'WIRELESS', 'ROUTER', 'FIREWALL', 'SERVER',
  'UPS', 'CABINET', 'DECODER', 'PC', 'PSU', 'PHONE', 'OTHER'
);

-- ---------------------------------------------------------------------------
-- 3. Las cinco columnas pasan al tipo nuevo.
--    El rodeo por `text` es obligatorio: PostgreSQL no convierte directamente
--    entre dos enums, aunque compartan los valores.
-- ---------------------------------------------------------------------------
ALTER TABLE "assets"
  ALTER COLUMN "type" TYPE "AssetType" USING ("type"::text::"AssetType");

ALTER TABLE "instalaciones"
  ALTER COLUMN "tipoEquipo" TYPE "AssetType" USING ("tipoEquipo"::text::"AssetType");

ALTER TABLE "procedimientos_restauracion"
  ALTER COLUMN "tipoActivo" TYPE "AssetType" USING ("tipoActivo"::text::"AssetType");

ALTER TABLE "modelos_equipo"
  ALTER COLUMN "tipoActivo" TYPE "AssetType" USING ("tipoActivo"::text::"AssetType");

ALTER TABLE "checklist_templates"
  ALTER COLUMN "assetType" TYPE "AssetType" USING ("assetType"::text::"AssetType");

-- ---------------------------------------------------------------------------
-- 4. Fuera la lista vieja.
-- ---------------------------------------------------------------------------
DROP TYPE "AssetType_viejo";
