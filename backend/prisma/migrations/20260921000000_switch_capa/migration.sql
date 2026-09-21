-- ===========================================================================
-- BLOQUE 145 · LA CAPA DEL SWITCH
-- ===========================================================================
--
-- POR QUÉ EXISTE
-- --------------
-- Palabras del usuario, 21/09/2026:
--
--   «Existen dos tipos de switch, el capa 2 y el capa 3. El capa 3 son los
--    Fortinet; los capa 2 vendrían siendo los TP-Link, los switch que reparten
--    power, los que están dispersados en los tableros o en los pequeños
--    gabinetes. Todo eso hay que estandarizarlo de forma correcta y lineal,
--    que no se pueda salir: la idea es evitar errores de información por parte
--    de los técnicos.»
--
-- No es una etiqueta académica. Cambia qué se puede hacer con el equipo en una
-- intervención: en un capa 3 se entra, se mira una VLAN y se corrige; en un
-- capa 2 plano no hay nada que mirar — se comprueba el cable y se cambia la
-- caja. Sin el dato, el técnico va a campo sin saber si le espera una
-- configuración o un reemplazo.
--
-- IDEMPOTENTE A PROPÓSITO
-- -----------------------
-- Como todas las migraciones de este proyecto desde el bloque 110-A: se puede
-- lanzar dos veces sin romper nada. Una migración que sólo funciona la primera
-- vez es una bomba para el día que haya que restaurar un respaldo.
--
-- NADA SE RELLENA SOLO. Los tres campos nacen NULL, y NULL aquí significa «no
-- se ha declarado todavía», que es distinto de «no es gestionable». Deducir la
-- capa por la marca —Fortinet luego capa 3— sería inventar un dato de planta,
-- y este sistema no inventa datos de planta.
-- ===========================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CapaDeRed') THEN
    CREATE TYPE "CapaDeRed" AS ENUM ('CAPA_2', 'CAPA_3');
  END IF;
END
$$;

ALTER TABLE "asset_switches" ADD COLUMN IF NOT EXISTS "capa" "CapaDeRed";
ALTER TABLE "asset_switches" ADD COLUMN IF NOT EXISTS "gestionable" BOOLEAN;
ALTER TABLE "asset_switches" ADD COLUMN IF NOT EXISTS "soportaVlan" BOOLEAN;
