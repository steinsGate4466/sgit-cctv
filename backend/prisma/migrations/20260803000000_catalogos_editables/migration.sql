-- ============================================================================
--  CATALOGOS EDITABLES DESDE LA INTERFAZ  (bloque 3E)
--
--  QUE RESUELVE
--  Las causas de cierre vivian en el enum RootCause: 17 valores fijos EN EL
--  CODIGO. Anadir una exigia migracion y despliegue, y en PostgreSQL los
--  valores de un enum solo se pueden anadir al final. Resultado: la gente de
--  planta no podia nombrar lo que ve sin pedirselo a un programador.
--
--  Es el mismo error que cometi inventandome las etapas del proceso. Aqui no
--  se repite: pasan a ser filas y las edita quien sabe como se llaman.
--
--  QUE DATOS SE CARGAN Y CUALES NO  -- esto importa
--
--  SE CARGAN las 17 CAUSAS que YA existen y que la gente lleva usando, con la
--  misma etiqueta y el mismo grupo que ya ve en pantalla. NO se inventa
--  ninguna: se migra lo que hay para que ninguna orden cerrada pierda
--  significado.
--
--  NO SE CARGA NADA en sintomas, acciones ni motivos. Estan vacios a
--  proposito. Yo no se que sintomas ve un tecnico en el Tren 2 ni como los
--  llama, y ya me equivoque una vez inventando nombres de planta. Los crea
--  ustedes desde Ubicaciones -> Catalogos.
--
--  EL ENUM RootCause SE CONSERVA. Las ordenes ya cerradas siguen guardando su
--  valor y se leen igual. El catalogo es lo que se ofrece de aqui en adelante.
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CatalogKind') THEN
        CREATE TYPE "CatalogKind" AS ENUM ('CAUSA', 'SINTOMA', 'ACCION', 'MOTIVO_AVANCE');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "catalog_items" (
    "id" TEXT NOT NULL,
    "kind" "CatalogKind" NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "group" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_items_pkey" PRIMARY KEY ("id")
);

-- El codigo es unico DENTRO de su tipo: puede haber una causa y un sintoma
-- que se llamen igual, y son cosas distintas.
CREATE UNIQUE INDEX IF NOT EXISTS "catalog_items_kind_code_key"
    ON "catalog_items"("kind", "code");
CREATE INDEX IF NOT EXISTS "catalog_items_kind_active_idx"
    ON "catalog_items"("kind", "active");

-- ---------------------------------------------------------------------------
--  Carga de las 17 causas que YA se usan.
--  ON CONFLICT DO NOTHING: si la migracion se repite, no duplica ni pisa lo
--  que alguien haya editado a mano despues.
-- ---------------------------------------------------------------------------
INSERT INTO "catalog_items" ("id", "kind", "code", "name", "group", "sequence", "updatedAt")
VALUES
    (gen_random_uuid(), 'CAUSA', 'ENERGIA_CORTE', 'Corte o falla eléctrica', 'Energía', 10, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'CAUSA', 'FUENTE_POE', 'Fuente / inyector PoE', 'Energía', 20, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'CAUSA', 'CABLE_DANADO', 'Cable dañado (cortado, aplastado, quemado)', 'Cableado', 30, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'CAUSA', 'CABLE_FUERA_NORMA', 'Tramo fuera de norma (más de 90 m)', 'Cableado', 40, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'CAUSA', 'CONECTOR', 'Conector RJ45 / empalme', 'Cableado', 50, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'CAUSA', 'EQUIPO_QUEMADO', 'Equipo quemado', 'Equipo', 60, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'CAUSA', 'EQUIPO_FIN_VIDA', 'Fin de vida útil / desgaste', 'Equipo', 70, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'CAUSA', 'PUERTO_SWITCH', 'Puerto del switch', 'Red', 80, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'CAUSA', 'ENLACE_INALAMBRICO', 'Enlace inalámbrico / antena', 'Red', 90, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'CAUSA', 'SATURACION_NVR', 'Sesiones del grabador agotadas', 'Red', 100, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'CAUSA', 'DISCO_NVR', 'Disco del grabador', 'Red', 110, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'CAUSA', 'CONFIGURACION', 'Configuración incorrecta', 'Equipo', 120, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'CAUSA', 'FIRMWARE', 'Firmware', 'Equipo', 130, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'CAUSA', 'AMBIENTAL', 'Ambiental (polvo, calor, humedad, escoria)', 'Entorno', 140, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'CAUSA', 'GOLPE_VANDALISMO', 'Golpe o vandalismo', 'Entorno', 150, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'CAUSA', 'SIN_FALLA_ENCONTRADA', 'No se encontró falla', 'Otros', 160, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'CAUSA', 'OTRO', 'Otra causa', 'Otros', 170, CURRENT_TIMESTAMP)
ON CONFLICT ("kind", "code") DO NOTHING;
