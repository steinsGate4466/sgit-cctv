-- ============================================================================
-- ARREGLO DEL DESPLIEGUE CAÍDO — bloque 75
-- ----------------------------------------------------------------------------
-- QUÉ PASÓ
--
-- Esta migración añadía DOS valores al enum `AssetType` de golpe. En Railway
-- se aplicó a medias: entró `PANTALLA` y falló en `TABLERO_ELECTRICO`, o al
-- revés. Prisma la marcó como FALLIDA.
--
-- Y a partir de ahí, cada despliegue nuevo hace lo mismo: intenta reaplicarla,
-- se encuentra con que el valor YA EXISTE, y muere con P3009 —
-- «migrate found failed migrations in the target database». El backend no
-- arranca y no vuelve a arrancar solo.
--
-- ----------------------------------------------------------------------------
-- EL ARREGLO: `IF NOT EXISTS`
--
-- Con esto la migración se puede correr las veces que haga falta y siempre
-- deja la base igual. Si el valor ya está, no hace nada; si falta, lo añade.
--
-- Es la regla que hay que aplicar SIEMPRE a un `ADD VALUE` de enum: media
-- aplicación es el estado del que no se sale sin tocar la base a mano.
--
-- (Se edita una migración ya aplicada, que normalmente NO se hace. Aquí sí,
-- porque está marcada como FALLIDA: nunca llegó a aplicarse entera, así que
-- no hay checksum bueno que respetar.)
-- ============================================================================

ALTER TYPE "AssetType" ADD VALUE IF NOT EXISTS 'PANTALLA';
ALTER TYPE "AssetType" ADD VALUE IF NOT EXISTS 'TABLERO_ELECTRICO';
