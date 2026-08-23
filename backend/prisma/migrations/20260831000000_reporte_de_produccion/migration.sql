-- =============================================================================
--  BLOQUE 51-B — EL AVISO DE PRODUCCIÓN DEJA DE PERDERSE EN LA RADIO
-- =============================================================================
--  QUÉ PASABA
--  Para avisar que una cámara del Tren 1 no ve, el Ing. Cañasas tenía que
--  llenar el MISMO formulario que un técnico de red: categoría de falla,
--  prioridad, sesiones concurrentes del NVR, cámaras aguas abajo. Nada de eso
--  lo sabe, y no tiene por qué saberlo.
--
--  El resultado conocido es que no lo llenaba. Avisaba por radio al púlpito,
--  el técnico iba, lo arreglaba, y el sistema no se enteraba nunca. La línea
--  podía estar ocho horas sin visión y en el ERP no constaba ni un minuto.
--
-- -----------------------------------------------------------------------------
--  QUÉ AÑADE ESTA MIGRACIÓN
--
--  1) POR DÓNDE ENTRÓ EL AVISO  (incidents."canalOrigen")
--     Saberlo cambia cómo se lee el dato. Una incidencia abierta por Producción
--     es una persona que se quedó sin ver. Una abierta por el monitoreo puede
--     ser un equipo que ni se estaba usando. Hoy las dos se ven iguales.
--
--     Todo lo que ya existe queda en 'SISTEMA'. NO se adivina el canal de las
--     incidencias viejas: rellenarlas con un valor «razonable» sería inventar
--     historia, y esa historia luego se usaría para decidir.
--
--  2) QUIÉN LEVANTÓ EL AVISO  (incidents."reportedById")
--     Es distinto de "responsibleId", que ya existía y dice quién lo RESUELVE.
--     «Hay una cámara caída» no mueve a nadie. «El Ing. Cañasas, del Tren 1,
--     no está viendo» sí. También queda nulo hacia atrás, por lo mismo.
--
--  3) LA REPARACIÓN QUE NO FUNCIONÓ  (incidents."reaparecio")
--     Si una cámara se da por reparada y vuelve a caer dentro de las 24 h, eso
--     no es «el mismo aviso otra vez»: es un arreglo que falló. Sumarlo a la
--     incidencia anterior la reabriría en silencio y nadie lo contaría. Con
--     esta bandera se cuenta, y es lo que después alimenta gestión de problemas.
--
--  4) LOS AVISOS REPETIDOS  (tabla "incident_avisos")
--     Cinco personas del púlpito viendo la misma cámara apagada son UN
--     incidente —así lo define ITIL y así se le entrega al técnico—, pero son
--     CINCO PERSONAS SIN VER, y ese número no existía en ninguna parte. Cada
--     fila de esta tabla es una de ellas.
--
--     El UNIQUE sobre (incidencia, persona) no es una formalidad: en el púlpito,
--     con el celular y mala señal, tocar «enviar» dos veces es lo normal. Sin
--     esa restricción el contador de impacto mentiría hacia arriba, y un número
--     de impacto inflado es peor que no tenerlo, porque se usa para pedir
--     presupuesto.
--
-- -----------------------------------------------------------------------------
--  RIESGO
--  Aditiva entera: tres columnas nulables o con valor por defecto y una tabla
--  nueva. No reescribe ni una fila existente, no bloquea, y si hubiera que
--  volver atrás basta con ignorar los campos.
-- =============================================================================

-- 1) El canal de origen.
CREATE TYPE "CanalOrigen" AS ENUM ('PRODUCCION', 'TECNICO', 'MONITOREO', 'SISTEMA');

ALTER TABLE "incidents"
  ADD COLUMN "canalOrigen" "CanalOrigen" NOT NULL DEFAULT 'SISTEMA';

-- 2) Quién levantó el aviso. Nulo hacia atrás: no se inventa.
ALTER TABLE "incidents" ADD COLUMN "reportedById" TEXT;

ALTER TABLE "incidents"
  ADD CONSTRAINT "incidents_reportedById_fkey"
  FOREIGN KEY ("reportedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 3) La reparación que no funcionó.
ALTER TABLE "incidents"
  ADD COLUMN "reaparecio" BOOLEAN NOT NULL DEFAULT false;

-- Se consultan al armar la bandeja del técnico y el «mi tren en el mes».
CREATE INDEX "incidents_reportedById_idx" ON "incidents"("reportedById");
CREATE INDEX "incidents_canalOrigen_idx"  ON "incidents"("canalOrigen");

-- 4) Los avisos repetidos.
CREATE TABLE "incident_avisos" (
  "id"         TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "zona"       TEXT,
  "fileId"     TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "incident_avisos_pkey" PRIMARY KEY ("id")
);

-- Si se borra la incidencia se van sus avisos: no significan nada sueltos.
-- Si se borra el usuario NO se borra el aviso, se impide borrarlo: el impacto
-- registrado no puede evaporarse porque alguien deje la empresa.
ALTER TABLE "incident_avisos"
  ADD CONSTRAINT "incident_avisos_incidentId_fkey"
  FOREIGN KEY ("incidentId") REFERENCES "incidents"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "incident_avisos"
  ADD CONSTRAINT "incident_avisos_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Una persona, un aviso por incidencia. Ver la nota de arriba: esto es lo que
-- impide que el doble toque en el celular infle el número de impacto.
CREATE UNIQUE INDEX "incident_avisos_incidentId_userId_key"
  ON "incident_avisos"("incidentId", "userId");

CREATE INDEX "incident_avisos_incidentId_idx" ON "incident_avisos"("incidentId");
CREATE INDEX "incident_avisos_userId_idx"     ON "incident_avisos"("userId");
