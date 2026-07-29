-- =============================================================================
--  F8-D  ·  Datos de LAMINACION + traduccion de activos existentes
--  SGIT-CCTV · Aceros Arequipa · Planta Pisco
--
--  POR QUE VA SEPARADA DE LA MIGRACION ANTERIOR
--  --------------------------------------------
--  PostgreSQL no permite USAR un valor de enum en la misma transaccion en la
--  que se anadio. La migracion 20260728120000 crea 'ETAPA'; esta lo utiliza.
--  Prisma ejecuta cada archivo en su propia transaccion, asi que al llegar
--  aqui el valor ya esta confirmado.
--
--  QUE HACE
--   1. Siembra las 12 etapas del proceso de laminacion.
--   2. Instancia cada etapa bajo CADA tren existente.
--   3. Traduce los activos: reubica los que se puede deducir con certeza y
--      DEJA SIN TOCAR los que no (las camaras). Ver nota en el paso 3.
--
--  Todo es idempotente: se puede re-ejecutar sin duplicar nada.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Catalogo de las 12 etapas (palanquilla -> producto terminado)
--    Los identificadores son fijos para que la migracion sea reproducible.
-- ---------------------------------------------------------------------------
INSERT INTO "process_stages"
  ("id","code","name","sequence","environment","baseCriticality","defaultIntervalDays","watches","createdAt","updatedAt")
VALUES
  ('f8000000-0000-4000-8000-000000000001','PATIO_PALANQUILLA','Patio de palanquilla',1,
   'INTEMPERIE_SALINA','MEDIA',45,'Grúa puente, carga de material',NOW(),NOW()),

  ('f8000000-0000-4000-8000-000000000002','HORNO_RECALENTADOR','Horno recalentador (1100-1200 °C)',2,
   'CALOR_RADIANTE','ALTA',30,'Empujador, carga y descarga, llama',NOW(),NOW()),

  ('f8000000-0000-4000-8000-000000000003','DESBASTE','Tren de desbaste (8 cajas)',3,
   'VAPOR_AGUA','CRITICA',30,'Atascos y lazos de material',NOW(),NOW()),

  ('f8000000-0000-4000-8000-000000000004','INTERMEDIO','Tren intermedio',4,
   'VAPOR_AGUA','CRITICA',30,'Lazos y guías',NOW(),NOW()),

  ('f8000000-0000-4000-8000-000000000005','ACABADO','Tren continuo / acabado (10 casetas)',5,
   'VAPOR_AGUA','CRITICA',30,'Velocidad y formación de lazo',NOW(),NOW()),

  ('f8000000-0000-4000-8000-000000000006','LECHO_ENFRIAMIENTO','Lecho de enfriamiento',6,
   'POLVO_METALICO','ALTA',45,'Alineación de barras, atascos',NOW(),NOW()),

  ('f8000000-0000-4000-8000-000000000007','CIZALLA','Cizalla / corte a medida',7,
   'POLVO_METALICO','MEDIA',45,'Corte a longitud',NOW(),NOW()),

  ('f8000000-0000-4000-8000-000000000008','EMPAQUETADO','Empaquetado / atado',8,
   'POLVO_METALICO','MEDIA',45,'Atado y etiquetado',NOW(),NOW()),

  ('f8000000-0000-4000-8000-000000000009','ALMACEN_PT','Almacén de producto terminado / despacho',9,
   'INTEMPERIE_SALINA','BAJA',45,'Inventario y carga de camiones',NOW(),NOW()),

  ('f8000000-0000-4000-8000-000000000010','PULPITO','Púlpito de control',10,
   'CLIMATIZADO','ALTA',90,'Estaciones de visualización iVMS-4200',NOW(),NOW()),

  ('f8000000-0000-4000-8000-000000000011','SALA_ELECTRICA','Sala eléctrica / MCC',11,
   'EMI_ALTA','ALTA',60,'Tableros y centros de control de motores',NOW(),NOW()),

  ('f8000000-0000-4000-8000-000000000012','TALLER_RODILLOS','Taller de rodillos',12,
   'POLVO_METALICO','BAJA',45,'Cambio de cajas y rodillos',NOW(),NOW())
ON CONFLICT ("code") DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) Instanciar las 12 etapas bajo CADA tren existente
--    El codigo queda como <codigo-del-tren>-<codigo-de-etapa>, unico por tren.
-- ---------------------------------------------------------------------------
INSERT INTO "locations" ("id","type","code","name","parentId","path","stageId","createdAt","updatedAt")
SELECT
  gen_random_uuid()::text,
  'ETAPA',
  t."code" || '-' || s."code",
  s."name",
  t."id",
  t."path" || '/' || s."code",
  s."id",
  NOW(),
  NOW()
FROM "locations" t
CROSS JOIN "process_stages" s
WHERE t."type" = 'TREN'
ON CONFLICT ("code") DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3) TRADUCCION DE ACTIVOS EXISTENTES
--
--    Criterio: sólo se reubica lo que se puede deducir CON CERTEZA.
--
--    - Equipos de sala (NVR, switch, router, firewall, servidor, UPS) ->
--      Sala electrica. Van siempre en gabinete dentro de sala de equipos.
--    - PC -> Pulpito de control. Son las estaciones con iVMS-4200.
--
--    Las CAMARAS NO se tocan. Ningun dato existente permite saber a que
--    etapa apunta una camara: eso lo sabe el tecnico que la instalo. Se
--    quedan colgando del tren y el sistema las listara como "sin etapa
--    asignada" para que se completen desde la interfaz.
--    Inventarse la etapa seria peor que dejarla vacia: generaria intervalos
--    y criticidades equivocados sobre datos falsos.
-- ---------------------------------------------------------------------------

-- 3a) Equipos de sala -> Sala electrica del tren al que ya pertenecen
UPDATE "assets" a
SET "locationId" = etapa."id"
FROM "locations" origen
JOIN "locations" tren
  ON tren."type" = 'TREN'
 AND (origen."id" = tren."id" OR origen."path" LIKE tren."path" || '/%')
JOIN "locations" etapa
  ON etapa."parentId" = tren."id"
 AND etapa."code" = tren."code" || '-SALA_ELECTRICA'
WHERE a."locationId" = origen."id"
  AND origen."type" <> 'ETAPA'
  AND a."type" IN ('NVR','SWITCH','ROUTER','FIREWALL','SERVER','UPS');

-- 3b) Estaciones de visualizacion (iVMS-4200) -> Pulpito de control
UPDATE "assets" a
SET "locationId" = etapa."id"
FROM "locations" origen
JOIN "locations" tren
  ON tren."type" = 'TREN'
 AND (origen."id" = tren."id" OR origen."path" LIKE tren."path" || '/%')
JOIN "locations" etapa
  ON etapa."parentId" = tren."id"
 AND etapa."code" = tren."code" || '-PULPITO'
WHERE a."locationId" = origen."id"
  AND origen."type" <> 'ETAPA'
  AND a."type" = 'PC';

-- ---------------------------------------------------------------------------
-- 4) Coherencia: activos con train declarado pero SIN ubicacion
--    Se cuelgan del tren que ellos mismos declaran. No se inventa etapa.
-- ---------------------------------------------------------------------------
UPDATE "assets" a
SET "locationId" = tren."id"
FROM "locations" tren
WHERE a."locationId" IS NULL
  AND a."train" IS NOT NULL
  AND tren."type" = 'TREN'
  -- Nota: se enumeran los valores en lugar de usar LIKE 'TREN_%' porque en
  -- LIKE el guion bajo es comodin de un caracter y no filtraria lo esperado.
  AND a."train"::text IN ('TREN_1','TREN_2','TREN_3')
  AND tren."code" = 'AASA-PISCO-T' || RIGHT(a."train"::text, 1);
