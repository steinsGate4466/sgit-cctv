-- =============================================================================
--  BLOQUE 62-A · CORREGIR EL REPARTO DE `infra.read` Y `red.read`
-- -----------------------------------------------------------------------------
--  QUÉ PASÓ, CON NOMBRES
--
--  La migración `20260901000000_partir_la_llave_maestra` repartió los permisos
--  nuevos identificando los roles POR SU NOMBRE ESCRITO A MANO:
--
--      WHERE r."name" NOT IN ('Jefe de Producción', 'Jefe de Tren')
--      ...
--      AND   r."name" =      'Jefe de Producción'
--
--  El rol de Producción NO se llama «Jefe de Producción». Se llama
--  «Jefe de línea (Producción)» — que es exactamente el nombre que la propia
--  plantilla de `catalogo-permisos.ts` genera. Nunca coincidió.
--
--  Consecuencia real, vista en pantalla por el usuario:
--    · «Jefe de Tren»               → SÍ coincidió → quedó bien acotado. ✅
--    · «Jefe de línea (Producción)» → NO coincidió → se le CONCEDIERON
--      `infra.read` y `red.read`. Producción abre hoy Cableado, Electricidad,
--      Rotulado, Grabadores, Conexiones, Mapa de red, Direccionamiento IP y
--      Puntos críticos. Es decir: la migración que existía para CERRAR ese
--      agujero fue la que lo ABRIÓ. ❌
--
-- -----------------------------------------------------------------------------
--  POR QUÉ FALLÓ, QUE ES LO QUE IMPORTA
--
--  Porque comparó contra un LITERAL. En este proyecto ya hay un verificador
--  —`verificar-roles`— nacido de este mismo error, que convierte en ERROR
--  cualquier nombre de rol escrito a mano en TypeScript. No mira SQL, así que
--  el fallo entró por la única puerta que quedaba abierta.
--
--  Y el nombre de un rol SE EDITA DESDE LA INTERFAZ. Cualquier control que
--  dependa de una cadena que el usuario puede cambiar es un control con fecha
--  de caducidad, y encima falla ABRIENDO: si el nombre no coincide, la regla
--  no se aplica y el permiso se queda puesto.
--
-- -----------------------------------------------------------------------------
--  LA REGLA NUEVA: NO SE MIRA CÓMO SE LLAMA, SE MIRA QUÉ PUEDE HACER
--
--  `infra.read` y `red.read` se quedan SÓLO en los roles que ya pueden TOCAR
--  la infraestructura, es decir que tienen alguno de:
--
--      asset.create · asset.update · asset.delete · location.manage
--
--  Quien únicamente LEE —Producción, Gerencia, Almacén, SSOMA, Auditoría,
--  Tercería, Contratista, Consulta— no construye nada, así que no necesita el
--  plano eléctrico ni el direccionamiento IP de la planta.
--
--  Comprobado contra las 11 plantillas de `catalogo-permisos.ts`: la regla
--  acierta exactamente a los tres perfiles que deben conservarlo
--  (Supervisor TI/Redes, Técnico de red, Técnico de campo) y no toca a los
--  otros ocho. No hay ni un solo nombre de rol en este archivo.
--
-- -----------------------------------------------------------------------------
--  POR QUÉ SE HACE CON UNA MIGRACIÓN NUEVA Y NO EDITANDO LA ANTERIOR
--
--  Porque la anterior YA SE APLICÓ, en local y en Railway. Una migración
--  aplicada es inmutable: Prisma guarda su checksum y editarla rompe el
--  despliegue con «migration was modified after it was applied».
--
-- -----------------------------------------------------------------------------
--  LO QUE ESTA MIGRACIÓN NO HACE, A PROPÓSITO
--
--  · NO toca `asset.read`. Producción lo necesita para ver SUS cámaras, y la
--    plantilla «Jefe de línea (Producción)» lo lleva por diseño. El DELETE de
--    la migración anterior apuntaba a un rol inexistente: no borró nada, y
--    tampoco había que borrarlo.
--
--  · NO devuelve `red.read` a nadie que no cumpla la regla. Si mañana hace
--    falta para un perfil concreto, se marca A MANO en la pantalla de Roles,
--    con firma y auditoría. Conceder de más es justo el fallo que se corrige
--    aquí; que el permiso se dé con un clic deliberado es la garantía.
--
--  · Es IDEMPOTENTE: si se corre dos veces, la segunda no borra nada más.
-- =============================================================================

DELETE FROM "role_permissions" rp
 USING "permissions" p
 WHERE rp."permissionId" = p."id"
   AND p."code" IN ('infra.read', 'red.read')
   -- Se conserva sólo si el rol tiene ALGUNA capacidad de escritura sobre la
   -- infraestructura. `NOT EXISTS` sobre esa lista = «este rol sólo mira».
   AND NOT EXISTS (
     SELECT 1
       FROM "role_permissions" rp2
       JOIN "permissions" p2 ON p2."id" = rp2."permissionId"
      WHERE rp2."roleId" = rp."roleId"
        AND p2."code" IN ('asset.create', 'asset.update', 'asset.delete', 'location.manage')
   );
