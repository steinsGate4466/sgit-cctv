-- =====================================================================
--  ROLES EDITABLES Y ÁMBITO POR TREN
--
--  Dos cosas, ninguna destructiva:
--
--  1. roles.sistema  — marca los roles que NO se pueden borrar ni vaciar.
--     Sin esto, el ingeniero puede quitarle 'user.manage' a su propio rol
--     y quedarse fuera de la administración sin forma de volver a entrar.
--     Es un fallo del que solo se sale por base de datos.
--
--  2. users.ambito_trenes — a qué trenes puede mirar cada usuario.
--     ARRAY VACÍO = TODOS. Es deliberado: los usuarios que ya existen
--     quedan con '{}' y siguen viéndolo todo exactamente igual que hoy.
--     Si el valor por defecto fuese "ninguno", esta migración dejaría a
--     toda la planta sin ver nada al desplegar.
--
--  Idempotente: se puede ejecutar dos veces sin romper nada.
-- =====================================================================

ALTER TABLE "roles"
  ADD COLUMN IF NOT EXISTS "sistema" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "ambito_trenes" TEXT[] NOT NULL DEFAULT '{}';

-- Los roles que venían con el sistema quedan protegidos.
UPDATE "roles" SET "sistema" = true
 WHERE "name" IN ('Administrador', 'Jefe de Área', 'Jefe de Area', 'Supervisor TI',
                  'Técnico', 'Tecnico', 'Técnico de Red', 'Tecnico de Red', 'Consulta');

-- Permisos nuevos. ON CONFLICT: si ya existen, no pasa nada.
INSERT INTO "permissions" ("id", "code", "description") VALUES
  (gen_random_uuid(), 'role.manage', 'Crear y editar roles y sus permisos'),
  (gen_random_uuid(), 'wo.report',   'Descargar el informe PDF de una orden')
ON CONFLICT ("code") DO NOTHING;

-- Quien ya administra usuarios, administra roles: es la misma persona.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT rp."roleId", p."id"
  FROM "role_permissions" rp
  JOIN "permissions" pu ON pu."id" = rp."permissionId" AND pu."code" = 'user.manage'
  CROSS JOIN LATERAL (SELECT "id" FROM "permissions" WHERE "code" = 'role.manage') p
ON CONFLICT DO NOTHING;

-- Quien puede leer una orden, puede descargar su informe. No se le quita
-- capacidad a nadie con este despliegue.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT rp."roleId", p."id"
  FROM "role_permissions" rp
  JOIN "permissions" pu ON pu."id" = rp."permissionId" AND pu."code" = 'wo.read'
  CROSS JOIN LATERAL (SELECT "id" FROM "permissions" WHERE "code" = 'wo.report') p
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS "users_ambito_trenes_idx" ON "users" USING GIN ("ambito_trenes");
