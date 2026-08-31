-- =============================================================================
-- BLOQUE 78 · EVENTO DE FALLA — para que MTBF y MTTR dejen de ser estimaciones
-- =============================================================================
--
-- Hasta ahora el MTTR se medía de «orden creada» a «orden cerrada». Una cámara
-- que se apaga a las 3 de la madrugada y cuya orden se abre a las 10 cargaba
-- siete horas en las que nadie sabía que estaba caída. Eso NO es tiempo de
-- reparación: es tiempo de detección, y tiene otro dueño.
--
-- Las cuatro marcas separan tres tramos con tres responsables:
--
--     ocurrió → detectado    cuánto tardamos en ENTERARNOS  (monitoreo)
--     detectado → empieza    cuánto tardamos en IR          (organización)
--     empieza → restablecido MTTR de verdad                 (mantenimiento)
--
-- Y es una tabla APARTE de la orden porque una avería y una orden no son lo
-- mismo: una avería puede necesitar dos órdenes, una orden puede no venir de
-- ninguna avería (un preventivo), y una avería puede resolverse sin orden.
-- =============================================================================

CREATE TABLE "failure_events" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,

  -- Las cuatro marcas. Las dos primeras SIEMPRE existen: sin saber cuándo
  -- ocurrió y cuándo nos enteramos, el evento no mide nada.
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "detectedAt" TIMESTAMP(3) NOT NULL,
  "repairStartedAt" TIMESTAMP(3),
  "restoredAt" TIMESTAMP(3),

  -- TRUE cuando `occurredAt` se rellenó con la hora del reporte porque nadie
  -- sabía la real. Por defecto TRUE: lo normal es no saberlo, y un dato
  -- estimado que no se distingue de uno medido es peor que no tenerlo.
  "ocurrioEsEstimado" BOOLEAN NOT NULL DEFAULT true,

  "incidentId" TEXT,
  "workOrderId" TEXT,

  -- Se reutiliza el catálogo de categorías de incidencia, que salió de planta.
  "categoria" "IncidentCategory" NOT NULL DEFAULT 'GENERAL',
  "causaRaiz" TEXT,

  -- Descarta el evento de los indicadores SIN borrarlo. Una falsa alarma
  -- borrada no se puede auditar.
  "esFalsaAlarma" BOOLEAN NOT NULL DEFAULT false,
  "notaFalsaAlarma" TEXT,

  "registradoPorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "failure_events_pkey" PRIMARY KEY ("id")
);

-- Una incidencia reporta UNA avería. Si llegan tres avisos de lo mismo, el
-- módulo de incidencias ya los agrupa antes de llegar aquí.
CREATE UNIQUE INDEX "failure_events_incidentId_key" ON "failure_events"("incidentId");

-- Los nombres son los EXACTOS que generaría Prisma —tabla, campos completos,
-- `_idx`—. Abreviar un campo dejó dos índices iguales sobre la misma columna
-- en el bloque 16.3, y cada escritura pagaba los dos.
CREATE INDEX "failure_events_assetId_occurredAt_idx" ON "failure_events"("assetId", "occurredAt");
CREATE INDEX "failure_events_occurredAt_idx" ON "failure_events"("occurredAt");
CREATE INDEX "failure_events_workOrderId_idx" ON "failure_events"("workOrderId");
CREATE INDEX "failure_events_registradoPorId_idx" ON "failure_events"("registradoPorId");
CREATE INDEX "failure_events_esFalsaAlarma_idx" ON "failure_events"("esFalsaAlarma");

-- CASCADE en el activo: si el equipo se purga, sus averías se van con él —
-- una avería de un equipo que ya no existe no le sirve a nadie.
ALTER TABLE "failure_events"
  ADD CONSTRAINT "failure_events_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "assets"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL en la incidencia y en la orden: si se purga el papeleo, la AVERÍA
-- sigue habiendo ocurrido. Borrarla falsearía el MTBF hacia arriba, que es
-- justo lo que este bloque viene a arreglar.
ALTER TABLE "failure_events"
  ADD CONSTRAINT "failure_events_incidentId_fkey"
  FOREIGN KEY ("incidentId") REFERENCES "incidents"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "failure_events"
  ADD CONSTRAINT "failure_events_workOrderId_fkey"
  FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "failure_events"
  ADD CONSTRAINT "failure_events_registradoPorId_fkey"
  FOREIGN KEY ("registradoPorId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- EL HISTÓRICO NO SE RELLENA A LA FUERZA
-- ---------------------------------------------------------------------------
-- Se podría recorrer las incidencias cerradas y fabricar un evento por cada
-- una. NO SE HACE, y es deliberado: esos eventos tendrían `occurredAt` =
-- `reportedAt` en el 100 % de los casos, o sea, dirían que TODA avería se
-- reportó en el instante en que ocurrió. Eso es exactamente la mentira que
-- este bloque viene a quitar, y encima quedaría escrita como si fuera un dato.
--
-- Los indicadores dicen «desde el 10/09/2026» mientras la muestra sea corta.
-- Una serie que empieza es honesta; una serie inventada no.
