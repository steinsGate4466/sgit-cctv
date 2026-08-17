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
--
-- ¡OJO! ESTE CRITERIO SE CORRIGIÓ, Y LA CORRECCIÓN ES LA PARTE INTERESANTE.
--
-- La primera versión exigía TRES permisos: asset.delete + user.manage +
-- role.manage. Reventó al aplicarla contra una base real (16/08) con este
-- mensaje: «hay roles que pueden eliminar activos, pero ninguno reúne los
-- tres». Y el consejo que daba —«concédelo a mano desde la pantalla de
-- Roles»— era IMPOSIBLE DE SEGUIR: la transacción se deshace entera al
-- fallar, así que el permiso que te pide conceder ni siquiera existe todavía.
-- Un callejón sin salida escrito por mí.
--
-- La causa de fondo: `role.manage` se añadió a la semilla en el bloque 34, y
-- desde el 33 la semilla YA NO CORRE EN CADA ARRANQUE. Cualquier base sembrada
-- antes de esa fecha tiene un Jefe de Mantenimiento con 32 permisos y sin
-- `role.manage`. El código decía una cosa y la base decía otra.
--
-- LA LECCIÓN: no se identifica a alguien por un permiso que llegó tarde.
-- `role.manage` da acceso a una PANTALLA. Los otros dos describen lo que la
-- persona PUEDE HACER con la planta: quien crea usuarios y borra activos ya es
-- el administrador, se llame como se llame su rol y tenga o no abierta la
-- pantalla de Roles. Con dos permisos el criterio sigue siendo estrecho —nadie
-- más en la planta los tiene juntos— y deja de depender de cuándo se sembró
-- la base.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
  FROM "roles" r
 CROSS JOIN "permissions" p
 WHERE p."code" = 'purga.definitiva'
   AND EXISTS (SELECT 1 FROM "role_permissions" rp JOIN "permissions" x ON x."id" = rp."permissionId"
                WHERE rp."roleId" = r."id" AND x."code" = 'asset.delete')
   AND EXISTS (SELECT 1 FROM "role_permissions" rp JOIN "permissions" x ON x."id" = rp."permissionId"
                WHERE rp."roleId" = r."id" AND x."code" = 'user.manage')
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
    -- El mensaje dice QUÉ HACER y que se puede hacer de verdad. El anterior
    -- mandaba a una pantalla donde el permiso todavia no existe, porque al
    -- fallar se deshace hasta el INSERT que lo crea.
    RAISE EXCEPTION 'Hay % rol(es) que pueden eliminar activos y ninguno reune ademas '
      'user.manage, asi que nadie podria ejecutar el borrado definitivo. '
      'Ejecuta primero la semilla (npm run prisma:seed) para poner la base al dia '
      'con los permisos declarados, y vuelve a aplicar las migraciones.', candidatos;
  END IF;
END $$;
