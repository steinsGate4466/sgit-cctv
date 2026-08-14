-- =========================================================================
--  ¿SE PUEDE INTERVENIR CON EL TREN EN MARCHA? — bloque 28
--  -----------------------------------------------------------------------
--  Hoy toda orden espera a una ventana de parada. Muchas no lo necesitan:
--  revisar la configuración de un grabador en el púlpito es trabajo de
--  cabina, lejos de la barra caliente. Hacerlas esperar tres semanas es
--  tiempo tirado, y además llena la ventana compitiendo con las que sí
--  exigen que el tren se detenga.
--
--  El sistema PROPONE la clasificación a partir del ambiente de la zona,
--  que ya se hereda del árbol de planta. No hace falta un campo nuevo por
--  activo ni una pregunta más al abrir el aviso.
--
--  LA REGLA QUE HACE QUE ESTO NO MATE A NADIE
--  La propuesta NO habilita. Sólo habilita la FIRMA. Mientras una zona no
--  esté firmada, sus órdenes se tratan como si exigieran parada: el sistema
--  falla hacia el lado seguro. Un error hace esperar a alguien; nunca hace
--  subir a alguien a una zona caliente creyendo que puede.
--
--  QUIÉN FIRMA: sólo el Supervisor Operativo de Tercería y el Jefe de
--  Mantenimiento. Queda con nombre, fecha y motivo en la auditoría, porque
--  esa decisión tiene dueño.
--
--  Migración ADITIVA: un enum y cinco columnas nulables sobre `locations`.
-- =========================================================================

DO $$ BEGIN
  CREATE TYPE "Intervencion" AS ENUM (
    'EN_MARCHA', 'CON_PERMISO_ELECTRICO', 'CON_PERMISO_ALTURA',
    'EXIGE_PARADA', 'SIN_CLASIFICAR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "intervencionFirmada"    "Intervencion";
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "intervencionMotivo"     TEXT;
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "intervencionFirmadaPorId" TEXT;
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "intervencionFirmadaEn"  TIMESTAMP(3);
-- Si llegar al equipo exige manlift o escalera. Sube la exigencia sin
-- importar lo fresca que esté la zona: subir es subir.
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "requiereAltura"         BOOLEAN NOT NULL DEFAULT false;

-- ON DELETE SET NULL: si el firmante se da de baja, la firma NO desaparece.
-- Borrarla dejaría zonas trabajándose en marcha sin que nadie lo respalde.
ALTER TABLE "locations" DROP CONSTRAINT IF EXISTS "locations_intervencionFirmadaPorId_fkey";
ALTER TABLE "locations" ADD CONSTRAINT "locations_intervencionFirmadaPorId_fkey"
  FOREIGN KEY ("intervencionFirmadaPorId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Firmar EN_MARCHA sin escribir por qué no entra. Igual que la criticidad
-- de Producción: una autorización sin motivo no es una autorización.
ALTER TABLE "locations" DROP CONSTRAINT IF EXISTS "locations_intervencion_exige_motivo";
ALTER TABLE "locations" ADD CONSTRAINT "locations_intervencion_exige_motivo" CHECK (
  "intervencionFirmada" IS NULL
  OR "intervencionFirmada" IN ('EXIGE_PARADA','SIN_CLASIFICAR')
  OR (btrim(COALESCE("intervencionMotivo", '')) <> '')
);

-- ---- Permiso y rol ------------------------------------------------------
INSERT INTO "permissions" ("id", "code", "description")
SELECT gen_random_uuid(), 'zona.intervencion',
       'Firmar si una zona se puede intervenir con el tren en marcha'
WHERE NOT EXISTS (SELECT 1 FROM "permissions" WHERE "code" = 'zona.intervencion');

INSERT INTO "roles" ("id", "name", "description", "sistema")
SELECT gen_random_uuid(), 'Supervisor Operativo de Tercería',
       'Responde por la cuadrilla contratada en los tres trenes. Firma en qué zonas se puede trabajar con el tren en marcha.',
       false
WHERE NOT EXISTS (SELECT 1 FROM "roles" WHERE "name" = 'Supervisor Operativo de Tercería');

-- El permiso de firma va SÓLO a esos dos. Nadie más.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
  FROM "roles" r
  CROSS JOIN "permissions" p
 WHERE p."code" = 'zona.intervencion'
   AND r."name" IN ('Jefe de Mantenimiento', 'Supervisor Operativo de Tercería')
   AND NOT EXISTS (
     SELECT 1 FROM "role_permissions" rp
      WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id");

-- El supervisor de tercería necesita además ver la planta para poder firmar
-- con criterio: sin ver el equipo y cómo se llega, la firma sería a ciegas.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
  FROM "roles" r
  CROSS JOIN "permissions" p
 WHERE r."name" = 'Supervisor Operativo de Tercería'
   AND p."code" IN ('dashboard.read','asset.read','location.read','incident.read',
                    'incident.create','wo.read','wo.update','wo.report',
                    'access.read','access.request','document.read')
   AND NOT EXISTS (
     SELECT 1 FROM "role_permissions" rp
      WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id");
