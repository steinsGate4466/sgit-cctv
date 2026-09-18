-- BLOQUE 106 · EL SITIO Y EL APARATO DEJAN DE SER LA MISMA COSA
--
-- `Asset` pasa a ser la UBICACIÓN FUNCIONAL —«la cámara del foso del Tren 2»—
-- y el aparato concreto que hay ahí vive en `equipos_instalados`. Es la
-- distinción Ubicación Funcional / Equipo de SAP PM y los niveles 6-9 de la
-- taxonomía de ISO 14224.
--
-- ES UNA MIGRACIÓN ADITIVA: no se toca ninguna columna existente y ninguna de
-- las 102 llamadas a `prisma.asset` cambia. Partir la tabla habría sido
-- reescribir 76 archivos del backend y 42 pantallas; esto cuesta una tabla.
--
-- IDEMPOTENTE a propósito (lección del bloque 105): si esta migración se
-- queda a medias, el segundo intento tiene que poder terminarla en vez de
-- morir con «already exists» y dejar la base bloqueada.

-- CreateTable
CREATE TABLE IF NOT EXISTS "equipos_instalados" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "marca" TEXT,
    "modelo" TEXT,
    "serie" TEXT,
    "firmware" TEXT,
    "desde" TIMESTAMP(3) NOT NULL,
    "desdeEsEstimado" BOOLEAN NOT NULL DEFAULT false,
    "hasta" TIMESTAMP(3),
    "motivoRetiro" TEXT,
    "instaladoPorId" TEXT,
    "retiradoPorId" TEXT,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipos_instalados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "equipos_instalados_assetId_desde_idx" ON "equipos_instalados"("assetId", "desde");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "equipos_instalados_hasta_idx" ON "equipos_instalados"("hasta");

-- UN SOLO APARATO PUESTO A LA VEZ, GARANTIZADO POR LA BASE.
--
-- Índice único PARCIAL: la unicidad sólo aplica a las filas sin `hasta`, o sea
-- a las que están instaladas AHORA. Un sitio puede haber tenido diez cámaras a
-- lo largo de los años, pero sólo una puesta en cada momento.
--
-- Va en la base y no sólo en el servicio a propósito: una comprobación en
-- código se salta con dos peticiones a la vez, y entonces el sitio queda con
-- dos aparatos «actuales» y ninguna pantalla sabe cuál enseñar.
--
-- Prisma NO sabe expresar índices parciales, así que este índice no aparece en
-- `schema.prisma` y queda documentado AQUÍ, como manda el §3 del CLAUDE.md.
CREATE UNIQUE INDEX IF NOT EXISTS "equipos_instalados_uno_puesto_por_sitio"
    ON "equipos_instalados"("assetId") WHERE "hasta" IS NULL;

-- AddForeignKey
ALTER TABLE "equipos_instalados" DROP CONSTRAINT IF EXISTS "equipos_instalados_assetId_fkey";
ALTER TABLE "equipos_instalados" ADD CONSTRAINT "equipos_instalados_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipos_instalados" DROP CONSTRAINT IF EXISTS "equipos_instalados_instaladoPorId_fkey";
ALTER TABLE "equipos_instalados" ADD CONSTRAINT "equipos_instalados_instaladoPorId_fkey" FOREIGN KEY ("instaladoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipos_instalados" DROP CONSTRAINT IF EXISTS "equipos_instalados_retiradoPorId_fkey";
ALTER TABLE "equipos_instalados" ADD CONSTRAINT "equipos_instalados_retiradoPorId_fkey" FOREIGN KEY ("retiradoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ===========================================================================
--  RELLENO: CADA SITIO QUE YA EXISTE ESTRENA SU APARATO ACTUAL
-- ===========================================================================
--  NO se inventa nada. La marca, el modelo y la serie que hoy están escritos
--  en `assets` SON los del aparato que está puesto ahora mismo: copiarlos es
--  decir la verdad, no rellenar hueco.
--
--  La FECHA sí puede faltar. Cuando no hay `installDate` se usa el alta del
--  sitio y se marca `desdeEsEstimado = true`, en vez de inventar un día: un
--  dato estimado que no se distingue de uno medido envenena cualquier cálculo
--  de vida útil (regla del bloque 78 con el `occurredAt`).
--
--  `WHERE NOT EXISTS` para que sea repetible: si la migración se corre dos
--  veces, no duplica.
INSERT INTO "equipos_instalados" (
    "id", "assetId", "marca", "modelo", "serie", "firmware",
    "desde", "desdeEsEstimado", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid(),
    a."id",
    a."brand",
    a."model",
    a."serialNumber",
    a."firmware",
    COALESCE(a."installDate", a."createdAt"),
    (a."installDate" IS NULL),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "assets" a
WHERE a."deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "equipos_instalados" e
    WHERE e."assetId" = a."id" AND e."hasta" IS NULL
  );
