-- =============================================================================
--  BLOQUE 55 — `asset.read` DEJA DE SER UNA LLAVE MAESTRA
-- =============================================================================
--  CÓMO SE ENCONTRÓ
--  El propio usuario entró al sistema con su cuenta de Jefe de línea de
--  Producción y vio el módulo de infraestructura ENTERO: Cableado,
--  Electricidad, Direccionamiento IP, Mapa de red, Puntos críticos, Rotulado.
--  Preguntó si eso estaba bien. No lo estaba.
--
--  Al contarlo salió el número: `asset.read` abría DIECISÉIS pantallas y 66
--  endpoints. No le habían dado permisos de más al armar el rol — es que NO
--  EXISTÍA forma de conceder «ver activos» sin conceder todo lo demás.
--
--  Y para Aceros Arequipa eso importa: la sectorización por tren no significa
--  nada si un jefe de línea puede listar el direccionamiento IP de las otras
--  dos líneas.
--
-- -----------------------------------------------------------------------------
--  EL CORTE: POR LO QUE ENSEÑA LA PANTALLA, NO POR LA CARPETA
--
--    asset.read   ¿QUÉ hay?              Activos, Ubicaciones, Gabinetes,
--                 (el inventario)         Instalaciones, Mapeo, Campañas,
--                                         Equipos conocidos
--
--    infra.read   ¿CÓMO está construido? Cableado, Electricidad, Rotulado,
--                 (la obra física)        Riesgo
--
--    red.read     ¿CÓMO está conectado?  Conexiones, Mapa de red, Puntos
--                 (la red)                críticos, Grabadores, IPAM
--
-- -----------------------------------------------------------------------------
--  LA REGLA QUE GOBIERNA ESTA MIGRACIÓN: NO CERRAR DE MÁS
--
--  Cerrar de más se nota TARDE — cuando alguien está en planta, de noche, y no
--  puede abrir la pantalla que necesita. Cerrar de menos se corrige mañana.
--
--  Por eso esta migración **CONCEDE, no quita**. Todo rol que hoy tenga
--  `asset.read` recibe los dos permisos nuevos y sigue viendo exactamente lo
--  mismo que veía ayer.
--
--  La única EXCEPCIÓN es deliberada y es el motivo del bloque: los roles de
--  PRODUCCIÓN no reciben `infra.read` ni `red.read`. Son quienes miran su
--  línea, no quienes sostienen la planta. Es el agujero que se viene a cerrar.
--
--  Consecuencia concreta al desplegar: quien tenga el rol «Jefe de Producción»
--  dejará de ver nueve pantallas. Es EXACTAMENTE lo que se busca, pero conviene
--  avisarle antes de que abra el sistema y piense que se rompió algo.
-- =============================================================================

-- 1) Los dos permisos nuevos.
INSERT INTO "permissions" ("id", "code", "description")
SELECT gen_random_uuid(), v.code, v.descripcion
  FROM (VALUES
    ('infra.read', 'Ver la obra física: cableado, tableros eléctricos, rotulado y obsolescencia'),
    ('red.read',   'Ver la red: conexiones, mapa, puntos críticos y direccionamiento IP')
  ) AS v(code, descripcion)
 WHERE NOT EXISTS (SELECT 1 FROM "permissions" p WHERE p."code" = v.code);

-- 2) Se conceden a TODO rol que hoy tenga `asset.read`, MENOS a los de
--    Producción. Así nadie pierde acceso salvo donde es el objetivo.
--
--    Se excluye por NOMBRE del rol y no por permiso, porque aquí no hay otra
--    señal: los roles de Producción se distinguen por lo que son, no por lo
--    que tienen. Está acotado a esta migración y no vive en el código —donde
--    comparar nombres de rol está prohibido y hay un verificador que lo caza.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT rp."roleId", nuevo."id"
  FROM "role_permissions" rp
  JOIN "permissions" viejo ON viejo."id" = rp."permissionId" AND viejo."code" = 'asset.read'
  JOIN "roles" r           ON r."id" = rp."roleId"
  CROSS JOIN LATERAL (
    SELECT "id" FROM "permissions" WHERE "code" IN ('infra.read', 'red.read')
  ) AS nuevo
 WHERE r."name" NOT IN ('Jefe de Producción', 'Jefe de Tren')
   AND NOT EXISTS (
     SELECT 1 FROM "role_permissions" x
      WHERE x."roleId" = rp."roleId" AND x."permissionId" = nuevo."id"
   );

-- 3) Y se le RETIRA `asset.read` al Jefe de Producción.
--
--    Es la línea que cierra el agujero. Ese rol ya tiene sus propias llaves
--    estrechas —`activos.mirar`, `cobertura.mirar`, `om.mirar`, creadas en el
--    bloque 42 para esto exactamente— así que sigue viendo SU tren: sus
--    cámaras, su cobertura, sus órdenes.
--
--    Lo que deja de ver es el inventario técnico de la planta entera.
DELETE FROM "role_permissions" rp
 USING "roles" r, "permissions" p
 WHERE rp."roleId" = r."id"
   AND rp."permissionId" = p."id"
   AND r."name" = 'Jefe de Producción'
   AND p."code" = 'asset.read';
