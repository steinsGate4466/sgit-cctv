-- =========================================================================
--  BLOQUE 39 — PRODUCCIÓN MIRA LA ORDEN, NO LA TOCA
--  -----------------------------------------------------------------------
--  El jefe de tren necesita ver qué se está haciendo con SUS cámaras: el
--  avance, la última nota del técnico, y qué material falta para poder mover
--  una compra el mismo día en vez de enterarse dos semanas después.
--
--  Darle `wo.read` para eso le abriría el módulo de Mantenimiento ENTERO: las
--  trescientas órdenes de la planta, los filtros, las de otros trenes. Y le
--  metería en el menú pantallas que no va a usar nunca — que es la forma más
--  rápida de que deje de entrar al sistema.
--
--  `om.mirar` es una llave estrecha: sólo el panel de su tren, sólo lectura,
--  sólo su ámbito. Si alguien se la concede por error, lo peor que puede
--  hacer es MIRAR.
--
--  -----------------------------------------------------------------------
--  A QUIÉN SE LE CONCEDE, Y POR QUÉ ASÍ
--  A todo rol que YA pueda ver el tablero (`dashboard.read`). El criterio es
--  deliberado: quien ya ve el estado por tren no gana información nueva sobre
--  la planta, gana DETALLE sobre lo que ya veía en resumen.
--
--  No se concede por NOMBRE de rol. Ésa fue la lección del bloque 34: un
--  `WHERE name = 'Jefe de Producción'` no encuentra nada si el rol se
--  renombró, la migración pasa en verde y el permiso queda sin conceder a
--  nadie. Se concede por lo que el rol ya puede hacer.
--
--  Migración ADITIVA: no borra ni modifica nada existente.
-- =========================================================================

-- ---- 1. El permiso ------------------------------------------------------
INSERT INTO "permissions" ("id", "code", "description")
SELECT gen_random_uuid(), 'om.mirar',
       'Ver en sólo lectura la orden de mantenimiento sobre las cámaras del propio tren'
WHERE NOT EXISTS (SELECT 1 FROM "permissions" WHERE "code" = 'om.mirar');

-- ---- 2. A quien ya puede ver el tablero ---------------------------------
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
  FROM "roles" r
 CROSS JOIN "permissions" p
 WHERE p."code" = 'om.mirar'
   AND EXISTS (SELECT 1 FROM "role_permissions" rp
                 JOIN "permissions" x ON x."id" = rp."permissionId"
                WHERE rp."roleId" = r."id" AND x."code" = 'dashboard.read')
   AND NOT EXISTS (SELECT 1 FROM "role_permissions" rp
                    WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id");

-- ---- 3. Que no quede muerto en silencio ---------------------------------
-- Si en una base YA POBLADA nadie lo recibiera, el panel del jefe de tren
-- quedaría inaccesible y NADA lo diría: la pantalla simplemente no aparece
-- en el menú.
--
-- La condición mira si HABÍA a quién dárselo. En una base nueva las
-- migraciones corren ANTES de la semilla, así que la tabla `roles` está
-- vacía: ahí no hay nada que conceder y de eso se encarga la semilla. Esa
-- distinción es la que faltó en la primera versión de la migración del
-- bloque 34 y habría tumbado el primer despliegue.
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
   WHERE p."code" = 'om.mirar';

  IF candidatos > 0 AND agraciados = 0 THEN
    RAISE EXCEPTION 'Hay roles que ven el tablero pero ninguno recibio "om.mirar": '
      'el panel del jefe de tren quedaria inaccesible. Concedelo a mano desde '
      'la pantalla de Roles y vuelve a desplegar.';
  END IF;
END $$;
