-- =========================================================================
--  BLOQUE 34 — LA SEGUNDA LLAVE DEL BORRADO DEFINITIVO DEJA DE SER UN NOMBRE
--  -----------------------------------------------------------------------
--  QUÉ ESTABA MAL
--  El borrado definitivo siempre pidió dos llaves: un permiso amplio
--  (`asset.delete` / `wo.approve`) y, además, ser «Jefe de Mantenimiento».
--  La segunda llave estaba escrita como una CADENA DE TEXTO, repetida a mano
--  en cinco archivos entre backend y frontend.
--
--  El nombre de un rol se edita desde la propia pantalla de Roles. Cambiarlo
--  a «Jefe de Mantto.» no habría dado ningún error: los botones desaparecen y
--  el servidor empieza a rechazar a todo el mundo, incluida la persona que
--  acaba de renombrarlo. Y al revés: crear un rol nuevo con ese nombre exacto
--  heredaba la llave sin que nadie se la concediera.
--
--  Lo encontró `verificar-roles.js`, sección F, que hasta hoy sólo avisaba.
--
--  -----------------------------------------------------------------------
--  POR QUÉ NO SE CONCEDE POR NOMBRE DE ROL
--  Sería repetir el error dentro de la migración. Si la base de Pisco ya
--  tiene el rol renombrado, un `WHERE name = 'Jefe de Mantenimiento'` no
--  encuentra nada, la migración pasa en verde y el borrado queda muerto.
--
--  Se concede POR LO QUE EL ROL YA PUEDE HACER: quien hoy administra usuarios
--  y roles y además puede eliminar activos, ya tenía de hecho el poder que
--  esta llave representa. Se le da nombre propio, no se le da poder nuevo.
--
--  Migración ADITIVA: no borra ni modifica nada existente.
-- =========================================================================

-- ---- 1. El permiso ------------------------------------------------------
INSERT INTO "permissions" ("id", "code", "description")
SELECT gen_random_uuid(), 'purga.definitiva',
       'Segunda llave del borrado definitivo: eliminar de la base registros que nunca debieron existir'
WHERE NOT EXISTS (SELECT 1 FROM "permissions" WHERE "code" = 'purga.definitiva');

-- ---- 2. Concederlo a quien ya ejercía de administrador ------------------
-- Los tres permisos juntos describen al administrador del sistema con
-- independencia de cómo se llame el rol.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
  FROM "roles" r
 CROSS JOIN "permissions" p
 WHERE p."code" = 'purga.definitiva'
   AND EXISTS (SELECT 1 FROM "role_permissions" rp JOIN "permissions" x ON x."id" = rp."permissionId"
                WHERE rp."roleId" = r."id" AND x."code" = 'asset.delete')
   AND EXISTS (SELECT 1 FROM "role_permissions" rp JOIN "permissions" x ON x."id" = rp."permissionId"
                WHERE rp."roleId" = r."id" AND x."code" = 'user.manage')
   AND EXISTS (SELECT 1 FROM "role_permissions" rp JOIN "permissions" x ON x."id" = rp."permissionId"
                WHERE rp."roleId" = r."id" AND x."code" = 'role.manage')
   AND NOT EXISTS (SELECT 1 FROM "role_permissions" rp
                    WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id");

-- ---- 3. Que no quede muerto en silencio ---------------------------------
-- Si en una base YA POBLADA ningún rol recibiera la llave, el borrado
-- definitivo se quedaría sin nadie que pueda ejecutarlo y NADA lo diría: los
-- botones simplemente no aparecen. Esa es la clase de fallo mudo que este
-- bloque viene a eliminar, así que aquí la migración FALLA en vez de pasar.
--
-- OJO CON LA CONDICIÓN, QUE ES LA PARTE QUE IMPORTA.
-- La primera versión de esta comprobación decía «si nadie tiene la llave,
-- falla», a secas. Eso habría reventado el arranque de CUALQUIER BASE NUEVA:
-- las migraciones corren ANTES de la semilla, así que en una base limpia la
-- tabla `roles` está vacía, nadie puede tener nada, y la migración habría
-- abortado el primer despliegue y el trabajo `migraciones` del CI.
--
-- La pregunta correcta no es «¿alguien tiene la llave?» sino «¿había alguien
-- a quien dársela y se quedó sin ella?». Si no hay ni un rol con
-- `asset.delete`, la base está recién creada y de esto se encarga la semilla.
DO $$
DECLARE candidatos INTEGER; agraciados INTEGER;
BEGIN
  SELECT COUNT(DISTINCT rp."roleId") INTO candidatos
    FROM "role_permissions" rp
    JOIN "permissions" p ON p."id" = rp."permissionId"
   WHERE p."code" = 'asset.delete';

  SELECT COUNT(*) INTO agraciados
    FROM "role_permissions" rp
    JOIN "permissions" p ON p."id" = rp."permissionId"
   WHERE p."code" = 'purga.definitiva';

  IF candidatos > 0 AND agraciados = 0 THEN
    RAISE EXCEPTION 'Hay roles que pueden eliminar activos, pero ninguno reune '
      'asset.delete + user.manage + role.manage, asi que nadie podria ejecutar '
      'el borrado definitivo. Concede "purga.definitiva" a mano desde la '
      'pantalla de Roles y vuelve a desplegar.';
  END IF;
END $$;
