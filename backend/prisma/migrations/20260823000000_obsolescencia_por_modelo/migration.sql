-- =========================================================================
--  OBSOLESCENCIA POR MODELO DE EQUIPO — bloque 32
--  -----------------------------------------------------------------------
--  «¿Qué cámaras ya no se consiguen?» es una pregunta del MODELO, no del
--  activo. Si el campo colgara de cada cámara habría que marcarlo 300 veces
--  y en tres meses la mitad estaría sin marcar — que es como se llega a un
--  inventario donde el 60 % sale en verde por estar vacío.
--
--  Por modelo se averigua UNA vez con el fabricante y sirve para todas.
--  Es la misma decisión que se tomó con el procedimiento de restauración.
--
--  LO QUE ESTA TABLA NO HACE: inventarse fechas. El fin de soporte lo
--  escribe quien lo consulte con Hikvision. Sin ese dato el sistema dice
--  «sin datos», nunca «bajo riesgo»: un inventario que sale verde porque
--  está vacío es peor que uno que admite lo que no sabe.
--
--  Migración ADITIVA: una tabla nueva. Nada existente cambia.
-- =========================================================================

CREATE TABLE IF NOT EXISTS "modelos_equipo" (
    "id"            TEXT NOT NULL,
    "tipoActivo"    "AssetType" NOT NULL,
    "marca"         TEXT NOT NULL,
    "modelo"        TEXT NOT NULL,
    -- Cuándo el fabricante deja de dar soporte y parches de firmware.
    "finDeSoporte"  TIMESTAMP(3),
    -- Ya no se consigue en el mercado. Lo marca una persona, no se deduce.
    "sinRecambio"   BOOLEAN NOT NULL DEFAULT false,
    -- Con qué se reemplaza cuando toque. Es la respuesta que hará falta el
    -- día que falle, y averiguarla ese día cuesta una semana.
    "reemplazadoPor" TEXT,
    "notas"         TEXT,
    "verificadoPorId" TEXT,
    "verificadoEn"  TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "modelos_equipo_pkey" PRIMARY KEY ("id")
);

-- Un modelo se identifica por los tres juntos. Sin esto habría dos fichas
-- del mismo modelo diciendo cosas distintas, que es peor que no tener ficha.
CREATE UNIQUE INDEX IF NOT EXISTS "modelos_equipo_tipoActivo_marca_modelo_key"
  ON "modelos_equipo"("tipoActivo", "marca", "modelo");

ALTER TABLE "modelos_equipo" DROP CONSTRAINT IF EXISTS "modelos_equipo_verificadoPorId_fkey";
ALTER TABLE "modelos_equipo" ADD CONSTRAINT "modelos_equipo_verificadoPorId_fkey"
  FOREIGN KEY ("verificadoPorId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
