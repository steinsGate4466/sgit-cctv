-- =============================================================================
-- BLOQUE 76 · CRITICIDAD A/B/C POR DISPOSITIVO — lo que declara una persona
-- =============================================================================
--
-- El cálculo ya existía (`src/common/criticidad-abc.ts`, bloque 73) y no
-- estaba enchufado a nada: ni pantalla, ni datos reales. Era exactamente el
-- error que este proyecto tiene escrito tres veces —*modelo + cálculo ≠
-- función; sin pantalla, no existe*— y esta migración es el primer paso para
-- cerrarlo.
--
-- De los cinco factores del método CTR, el sistema puede calcular cuatro:
-- cuántos equipos cubren lo mismo, cómo se llega, cuántas veces falló y de
-- quién depende. Sólo dos los tiene que decir una persona, y son los únicos
-- que se guardan aquí. Regla del proyecto: *lo que se puede calcular, no se
-- guarda* — la letra NO se almacena, se recalcula en cada consulta, porque
-- guardarla significaría que se queda vieja el día que alguien añada una
-- cámara a la zona.
--
-- NINGUNA COLUMNA LLEVA VALOR POR DEFECTO, y es deliberado: NULL significa
-- «nadie lo ha dicho» y saca el equipo en la lista de pendientes. Un `false`
-- por defecto en el riesgo para personas haría que un sitio peligroso sin
-- declarar pareciera seguro, y un `1` en el impacto diría que si esa cámara
-- se cae no pasa nada. Es la regla de siempre: *sin datos, nunca cero*.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. EL RIESGO PARA PERSONAS ES DEL SITIO, NO DE LA CÁMARA
-- ---------------------------------------------------------------------------
-- Va en la ubicación porque el peligro lo tiene el lugar: la barra caliente,
-- el paso de grúa, el foso. Declararlo cámara por cámara sería escribir el
-- mismo dato cuatrocientas veces y que a la número treinta ya no coincida con
-- la número tres.
ALTER TABLE "locations"
  ADD COLUMN "riesgoPersonas" BOOLEAN,
  ADD COLUMN "riesgoPersonasMotivo" TEXT;

-- ---------------------------------------------------------------------------
-- 2. EL ACTIVO PUEDE ANULARLO, PARA EL CASO REAL
-- ---------------------------------------------------------------------------
-- Dos cámaras de la misma zona pueden mirar cosas distintas: una al paso de
-- grúa y otra a un pasillo. Sin esto habría que elegir entre subir de más
-- toda la zona o dejar sin proteger la que de verdad lo necesita.
ALTER TABLE "assets"
  ADD COLUMN "impactoOperacional" INTEGER,
  ADD COLUMN "riesgoPersonas" BOOLEAN,
  ADD COLUMN "criticidadDeclaradaPorId" TEXT,
  ADD COLUMN "criticidadDeclaradaEn" TIMESTAMP(3);

-- Se borra el nombre, nunca la declaración: quitarla devolvería el equipo a
-- «sin clasificar» y alguien dejaría de revisarlo por una baja de personal.
ALTER TABLE "assets"
  ADD CONSTRAINT "assets_criticidadDeclaradaPorId_fkey"
  FOREIGN KEY ("criticidadDeclaradaPorId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Los nombres de índice son los EXACTOS que generaría Prisma —tabla, campos
-- completos, `_idx`—. Abreviar un campo hizo que en el bloque 16.3 quedaran
-- dos índices iguales sobre la misma columna, y cada escritura pagaba los dos.
CREATE INDEX "assets_impactoOperacional_idx" ON "assets"("impactoOperacional");
CREATE INDEX "assets_criticidadDeclaradaPorId_idx" ON "assets"("criticidadDeclaradaPorId");

-- ---------------------------------------------------------------------------
-- 3. LOS NÚMEROS DE LA PLANTA, EN UNA TABLA Y NO EN EL CÓDIGO
-- ---------------------------------------------------------------------------
-- Dónde se corta entre A, B y C y cada cuántos días se revisa cada letra. Si
-- el ingeniero decide que una A se revisa cada 45 días, eso no puede exigir un
-- despliegue.
--
-- FILA ÚNICA: el identificador por defecto es fijo. Dos filas serían dos
-- verdades y nadie sabría cuál manda.
CREATE TABLE "parametros_criticidad" (
  "id" TEXT NOT NULL DEFAULT 'unico',
  "corteA" INTEGER NOT NULL,
  "corteB" INTEGER NOT NULL,
  "diasA" INTEGER NOT NULL,
  "diasB" INTEGER NOT NULL,
  "diasC" INTEGER NOT NULL,
  "actualizadoPorId" TEXT,
  "actualizadoEn" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "parametros_criticidad_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "parametros_criticidad_actualizadoPorId_idx" ON "parametros_criticidad"("actualizadoPorId");

ALTER TABLE "parametros_criticidad"
  ADD CONSTRAINT "parametros_criticidad_actualizadoPorId_fkey"
  FOREIGN KEY ("actualizadoPorId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- NO se inserta ninguna fila a propósito. Mientras no exista, el sistema usa
-- los valores PROPUESTOS del código, y están marcados como tales en pantalla:
-- «estos números todavía no los ha confirmado la planta». Insertarlos aquí los
-- convertiría en una decisión que nadie tomó.
