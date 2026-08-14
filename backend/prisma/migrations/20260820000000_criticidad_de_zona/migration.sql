-- =========================================================================
--  CRITICIDAD PRODUCTIVA DE LA ZONA — bloque 26
--  -----------------------------------------------------------------------
--  EL PROBLEMA QUE RESUELVE
--  Hasta hoy la criticidad de una cámara la ponía Mantenimiento, y salía de
--  criterio técnico: qué tan cara es, qué tan expuesta está. Pero la pregunta
--  que importa no es técnica:
--
--      «Si perdemos la vista AQUÍ, ¿qué le pasa a la producción?»
--
--  Eso no lo sabe Mantenimiento ni lo sabe TI. Lo sabe PRODUCCIÓN. Y hoy no
--  tiene dónde decirlo, así que no se dice, y las tres áreas priorizan por
--  intuición y cada una la suya.
--
--  Con esto Producción declara, por ZONA, qué pasa si esa zona se queda a
--  ciegas. Esa declaración sube la criticidad de todas las cámaras de la
--  zona, y con ella el orden de las órdenes de trabajo. Nadie tiene que
--  acordarse: se deriva.
--
--  DOS DECISIONES QUE NO SON DE PROGRAMACIÓN
--
--  1. LA CRITICIDAD ALTA EXIGE UN PORQUÉ ESCRITO.
--     Sin esa regla, en tres meses todas las zonas son críticas y el campo
--     deja de ordenar nada. La restricción está en la base, no sólo en la
--     pantalla: si algún día se carga por script, la regla sigue puesta.
--
--  2. LA DECLARACIÓN CADUCA.
--     La planta cambia: se mueve una línea, se instala un lecho nuevo. Una
--     criticidad de 2026 aplicada en 2029 es una mentira con fecha. Se guarda
--     hasta cuándo vale, y quién la firmó.
--
--  Migración ADITIVA: siete columnas nulables sobre `locations`. Ninguna fila
--  existente cambia de comportamiento — sin declaración, la criticidad se
--  sigue calculando exactamente como hasta ahora.
-- =========================================================================

ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "criticidadProduccion" "Criticality";
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "porQueEsVital"        TEXT;
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "impactoSiSeCae"       TEXT;
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "queSeVigila"          TEXT;
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "declaradoPorId"       TEXT;
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "declaradoEn"          TIMESTAMP(3);
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "revisarAntesDe"       TIMESTAMP(3);

-- Quién firmó la declaración. ON DELETE SET NULL: si el usuario se da de
-- baja, la declaración NO se borra — sigue siendo válida, sólo pierde el
-- nombre. Borrarla dejaría zonas críticas silenciosamente sin criticidad.
ALTER TABLE "locations" DROP CONSTRAINT IF EXISTS "locations_declaradoPorId_fkey";
ALTER TABLE "locations" ADD CONSTRAINT "locations_declaradoPorId_fkey"
  FOREIGN KEY ("declaradoPorId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ALTA o CRÍTICA sin motivo escrito no entra. Ni por pantalla ni por script.
ALTER TABLE "locations" DROP CONSTRAINT IF EXISTS "locations_vital_exige_motivo";
ALTER TABLE "locations" ADD CONSTRAINT "locations_vital_exige_motivo" CHECK (
  "criticidadProduccion" IS NULL
  OR "criticidadProduccion" IN ('BAJA','MEDIA')
  OR (btrim(COALESCE("porQueEsVital", '')) <> '')
);

CREATE INDEX IF NOT EXISTS "locations_criticidadProduccion_idx"
  ON "locations"("criticidadProduccion");

-- Permiso nuevo: declarar la criticidad de una zona. Se lo damos a
-- Producción y al Jefe de Mantenimiento. TI la LEE, no la declara: puede
-- ver por qué una zona manda, pero no decidirlo por Producción.
INSERT INTO "permissions" ("id", "code", "description")
SELECT gen_random_uuid(), 'zona.criticidad',
       'Declarar qué zonas son vitales para la producción y por qué'
WHERE NOT EXISTS (SELECT 1 FROM "permissions" WHERE "code" = 'zona.criticidad');

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
  FROM "roles" r
  CROSS JOIN "permissions" p
 WHERE p."code" = 'zona.criticidad'
   AND r."name" IN ('Jefe de Mantenimiento', 'Jefe de Producción')
   AND NOT EXISTS (
     SELECT 1 FROM "role_permissions" rp
      WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id");
