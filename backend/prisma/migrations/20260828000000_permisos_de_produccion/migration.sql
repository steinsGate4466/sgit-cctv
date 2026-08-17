-- =============================================================================
--  BLOQUE 42 — PRODUCCIÓN DEJA DE ENTRAR CON LAS LLAVES DE MANTENIMIENTO
-- =============================================================================
--  LO QUE SE VIO EN PANTALLA
--  Un jefe de línea con el menú lleno de Gabinetes, Cableado, Electricidad,
--  Campañas de mapeo, Conexiones, Mi bandeja, Dashboard e Indicadores. Nada de
--  eso es suyo.
--
--  Y no fue un descuido al armar el rol: fue el diseño. Para que viera «Mi
--  cobertura» había que darle `dashboard.read`, y `dashboard.read` abre el
--  TABLERO DE MANTENIMIENTO entero. Para que viera sus activos, `asset.read`,
--  que abre el módulo de Activos con doce columnas. Las pantallas de Producción
--  colgaban de permisos de Mantenimiento, así que Producción acababa con el
--  módulo de Mantenimiento.
--
--  Estos dos permisos son las llaves propias. Son estrechas por definición: si
--  alguien los concede por error, lo peor que puede pasar es que MIREN su tren.
--
-- -----------------------------------------------------------------------------
--  A QUIÉN SE LE CONCEDEN, Y POR QUÉ NADIE PIERDE NADA
-- -----------------------------------------------------------------------------
--  A todo rol que HOY podía entrar a esas pantallas:
--
--    cobertura.mirar -> a quien tiene `dashboard.read` (era su llave)
--    activos.mirar   -> a quien tiene `om.mirar` (el panel del jefe de tren)
--                       o `asset.read` (el ingeniero, que también la usa)
--
--  Resultado buscado: al aplicar esto NADIE deja de ver lo que veía. Lo que
--  cambia es que a partir de ahora SE PUEDE crear un rol que vea su cobertura
--  sin ver el tablero de mantenimiento — que antes era imposible.
--
--  No se concede por NOMBRE de rol. Es la lección del bloque 34: un
--  `WHERE name = 'Jefe de Producción'` no encuentra nada si alguien renombró
--  el rol, la migración pasa en verde y el permiso queda sin conceder a nadie.
-- =============================================================================

-- ---- 1. Los permisos ----------------------------------------------------
INSERT INTO "permissions" ("id", "code", "description")
SELECT gen_random_uuid(), 'cobertura.mirar',
       'Ver qué zonas del propio tren están sin vista, y qué se pierde en cada una'
WHERE NOT EXISTS (SELECT 1 FROM "permissions" WHERE "code" = 'cobertura.mirar');

INSERT INTO "permissions" ("id", "code", "description")
SELECT gen_random_uuid(), 'activos.mirar',
       'Ver el inventario del propio tren agrupado por gabinete, tablero y campo, con el medio de acceso'
WHERE NOT EXISTS (SELECT 1 FROM "permissions" WHERE "code" = 'activos.mirar');

-- ---- 2. cobertura.mirar, a quien ya veía el tablero ---------------------
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
  FROM "roles" r
 CROSS JOIN "permissions" p
 WHERE p."code" = 'cobertura.mirar'
   AND EXISTS (SELECT 1 FROM "role_permissions" rp JOIN "permissions" x ON x."id" = rp."permissionId"
                WHERE rp."roleId" = r."id" AND x."code" = 'dashboard.read')
   AND NOT EXISTS (SELECT 1 FROM "role_permissions" rp
                    WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id");

-- ---- 3. activos.mirar, a quien ya miraba sus cámaras o el inventario ----
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
  FROM "roles" r
 CROSS JOIN "permissions" p
 WHERE p."code" = 'activos.mirar'
   AND EXISTS (SELECT 1 FROM "role_permissions" rp JOIN "permissions" x ON x."id" = rp."permissionId"
                WHERE rp."roleId" = r."id" AND x."code" IN ('om.mirar', 'asset.read'))
   AND NOT EXISTS (SELECT 1 FROM "role_permissions" rp
                    WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id");

-- ---- 4. Que no quede muerto en silencio ---------------------------------
-- Si en una base YA POBLADA nadie recibiera `cobertura.mirar`, la pantalla de
-- cobertura quedaría inaccesible para todo el mundo y NADA lo diría: el menú
-- simplemente no la enseñaría.
--
-- La condición mira si HABÍA a quién dárselo. En una base nueva las migraciones
-- corren ANTES de la semilla y la tabla `roles` está vacía: ahí no hay nada que
-- conceder y de eso se encarga la semilla.
--
-- Y el mensaje manda a ejecutar la semilla, no a la pantalla de Roles. Lo
-- aprendí a base de tumbar un despliegue: al fallar se deshace la transacción
-- entera, incluido el INSERT que crea el permiso, así que mandar a concederlo
-- a mano es mandar a un sitio donde ese permiso todavía no existe.
DO $$
DECLARE candidatos INTEGER; agraciados INTEGER;
BEGIN
  SELECT COUNT(DISTINCT rp."roleId") INTO candidatos
    FROM "role_permissions" rp
    JOIN "permissions" p ON p."id" = rp."permissionId"
   WHERE p."code" = 'dashboard.read';

  SELECT COUNT(*) INTO agraciados
    FROM "role_permissions" rp
    JOIN "permissions" p ON p."id" = rp."permissionId"
   WHERE p."code" = 'cobertura.mirar';

  IF candidatos > 0 AND agraciados = 0 THEN
    RAISE EXCEPTION 'Hay % rol(es) con dashboard.read y ninguno recibio cobertura.mirar: '
      'la pantalla de cobertura quedaria inaccesible. Ejecuta la semilla '
      '(npm run prisma:seed) y vuelve a aplicar las migraciones.', candidatos;
  END IF;
END $$;
