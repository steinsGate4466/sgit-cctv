-- =============================================================================
--  BLOQUE 45 — EL COLOR DEL CABLE Y LA FUENTE DENTRO DE LA ANTENA
-- =============================================================================
--  DOS COSAS QUE SON LA MISMA
--
--  El color de la chaqueta es el rótulo dicho en otro idioma: `AA-CAM-...` y
--  «cable verde» significan lo mismo, uno para quien lee la etiqueta y otro
--  para quien está delante del rack con una linterna.
--
--  Pero el color NO se puede deducir sin modelar bien la cadena. Una antena PMP
--  en Pisco se monta así:
--
--      ANTENA ──PoE 24 V──► FUENTE ──puerto LAN──► SWITCH
--             (datos + alimentación)     (SÓLO datos)
--
--  Son DOS TRAMOS y el color CAMBIA en la fuente, porque cambia lo que lleva
--  dentro: amarillo el que tiene tensión, azul el que es red pura. Y eso
--  importa en campo — quien abre el rack tiene que saber por dónde hay 24 V.
--
--  Para representarlo, la fuente tiene que EXISTIR. Hasta hoy no existía, y por
--  eso el tramo se registraba como antena↔switch, que es falso.
--
-- -----------------------------------------------------------------------------
--  LA FUENTE ES UN ACTIVO, PERO COLGADO DE SU PADRE
-- -----------------------------------------------------------------------------
--  Se quema, se cambia, tiene repuesto en almacén y genera su propia orden.
--  Todo lo que cumple eso en este sistema es un activo — y hacerlo tabla aparte
--  obligaría a duplicar órdenes, incidencias, historial y rótulo.
--
--  Lo que evita el desorden es `parteDeId`: el listado de Activos OCULTA los
--  componentes por defecto y sólo aparecen dentro de la ficha de su antena.
--  Trescientas fuentes sueltas en el listado y nadie sabe cuál es de cuál.
--
--  ON DELETE SET NULL, no CASCADE: si alguien da de baja la antena, la fuente
--  NO desaparece. Sigue existiendo como equipo suelto y su historial sobrevive
--  — que es lo que hace falta para saber cuántas fuentes se han quemado.
--
-- -----------------------------------------------------------------------------
--  ADITIVA. Un tipo nuevo en el enum, dos columnas nulables, una tabla y sus
--  índices. No toca ni una fila existente.
-- =============================================================================

-- ---- 1. Tipos de activo nuevos -------------------------------------------
-- PostgreSQL sólo añade valores de enum AL FINAL. Si figuraran en otra
-- posición, el esquema y la base dejarían de coincidir.
ALTER TYPE "AssetType" ADD VALUE IF NOT EXISTS 'PSU';
ALTER TYPE "AssetType" ADD VALUE IF NOT EXISTS 'PHONE';

-- ---- 2. El componente cuelga de su equipo padre ---------------------------
ALTER TABLE "assets" ADD COLUMN "parteDeId" TEXT;

ALTER TABLE "assets"
  ADD CONSTRAINT "assets_parteDeId_fkey"
  FOREIGN KEY ("parteDeId") REFERENCES "assets"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- El listado filtra por «sin padre» en cada carga: sin índice, eso es un
-- recorrido completo de la tabla en la pantalla más usada del sistema.
CREATE INDEX "assets_parteDeId_idx" ON "assets"("parteDeId");

-- ---- 3. El catálogo de colores -------------------------------------------
CREATE TABLE "colores_de_cable" (
  "id"     TEXT NOT NULL,
  "code"   TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "uso"    TEXT NOT NULL,
  "porQue" TEXT,
  "hex"    TEXT NOT NULL,
  "orden"  INTEGER NOT NULL DEFAULT 0,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "colores_de_cable_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "colores_de_cable_code_key" ON "colores_de_cable"("code");

-- ---- 4. El color en el tramo ----------------------------------------------
ALTER TABLE "asset_cables" ADD COLUMN "colorId" TEXT;

ALTER TABLE "asset_cables"
  ADD CONSTRAINT "asset_cables_colorId_fkey"
  FOREIGN KEY ("colorId") REFERENCES "colores_de_cable"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "asset_cables_colorId_idx" ON "asset_cables"("colorId");

-- ---- 5. Los seis colores, COMO DATOS ---------------------------------------
-- Se siembran aquí y no en la semilla para que existan desde el primer
-- arranque, incluso en una base a la que nadie sembró todavía. A partir de ese
-- momento se editan desde la interfaz como cualquier catálogo de planta.
INSERT INTO "colores_de_cable" ("id","code","nombre","uso","porQue","hex","orden") VALUES
  (gen_random_uuid(),'NARANJA','Naranja','Backbone / uplink',
   'El troncal entre salas. Si se corta, deja ciego un tren entero.','#EA580C',1),
  (gen_random_uuid(),'NEGRO','Negro','Servidores y equipos',
   'Lo que vive dentro del rack y no sale de el.','#1F2937',2),
  (gen_random_uuid(),'AMARILLO','Amarillo','PoE - lleva alimentacion',
   'Desconectarlo APAGA el equipo del otro extremo, no solo lo desconecta.','#EAB308',3),
  (gen_random_uuid(),'AZUL','Azul','Datos de red',
   'Red pura, sin tension. Es el tramo que sale del puerto LAN de una fuente.','#2563EB',4),
  (gen_random_uuid(),'VERDE','Verde','CCTV y seguridad',
   'El sistema que sostiene este software. Verlo aparte permite auditarlo.','#16A34A',5),
  (gen_random_uuid(),'BLANCO','Blanco','Telefonia y voz',
   'No es de Mantenimiento CCTV. Se marca para que nadie lo toque por error.','#F3F4F6',6)
ON CONFLICT ("code") DO NOTHING;
