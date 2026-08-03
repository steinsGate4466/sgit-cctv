-- =====================================================================
--  REPARAR ÍNDICES Y CLAVES FORÁNEAS
--
--  La CI fallaba en "Migraciones - sin desfase con el esquema" por CUATRO
--  cosas, todas escritas a mano por mí en las tres últimas migraciones.
--  Ninguna rompía nada en producción; todas hacían que Prisma viera una
--  base distinta de la que describe el esquema, y eso es exactamente lo
--  que ese paso existe para impedir.
--
--  Las migraciones ya aplicadas NO SE TOCAN. Lo que faltó va aquí.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. CLAVES FORÁNEAS SIN `ON UPDATE CASCADE`
--
--    Escribí `ON DELETE CASCADE` a secas. Prisma genera SIEMPRE las dos
--    cláusulas, así que veía una clave distinta y proponía rehacerla.
-- ---------------------------------------------------------------------
ALTER TABLE "asset_observations" DROP CONSTRAINT IF EXISTS "asset_observations_assetId_fkey";
ALTER TABLE "asset_observations"
  ADD CONSTRAINT "asset_observations_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sesiones" DROP CONSTRAINT IF EXISTS "sesiones_userId_fkey";
ALTER TABLE "sesiones"
  ADD CONSTRAINT "sesiones_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- 2. ÍNDICE COMPUESTO CON EL NOMBRE EQUIVOCADO
--
--    El índice es sobre (estado, proximoIntento), pero lo llamé como si
--    fuera sólo de `estado`. Prisma nombra los índices con TODAS sus
--    columnas, así que veía uno de más y otro de menos.
-- ---------------------------------------------------------------------
ALTER INDEX IF EXISTS "notificaciones_salientes_estado_idx"
  RENAME TO "notificaciones_salientes_estado_proximoIntento_idx";

-- ---------------------------------------------------------------------
-- 3. EL ÍNDICE GIN DE ambito_trenes
--
--    Lo creé para buscar dentro del array de trenes. Está bien pensado,
--    pero PRISMA NO SABE EXPRESAR un índice GIN en el esquema, así que
--    para él sobra y propone borrarlo en cada comprobación.
--
--    Se quita. Ese array tiene como mucho tres elementos y se consulta
--    sobre un puñado de usuarios: el índice no ahorraba nada medible, y
--    no compensa tener la CI en rojo para siempre a cambio de nada.
-- ---------------------------------------------------------------------
DROP INDEX IF EXISTS "users_ambito_trenes_idx";

-- ---------------------------------------------------------------------
-- 4. work_orders: detailedAt y rootCauseCode
--
--    Estos índices SÍ existen en la base —los creé en migraciones
--    anteriores— pero no estaban declarados en el esquema. Es el MISMO
--    fallo del 01/08 con (movementId) y (status): crear un índice en el
--    SQL y olvidar el @@index.
--
--    Aquí no hay nada que ejecutar: se arregla declarándolos en
--    schema.prisma, que es lo que se hace en este mismo cambio. Se deja
--    escrito para que quien lea esta migración entienda por qué la CI
--    los mencionaba.
-- ---------------------------------------------------------------------
