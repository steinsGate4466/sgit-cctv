-- ===========================================================================
-- BLOQUE 169 · CATÁLOGOS BASE: TODO CON CLICS
-- ===========================================================================
-- «Que los técnicos no coloquen nada a su criterio, que todo se ordene con
--  clics» (usuario, 08/10/2026).
--
-- Síntomas, acciones, motivos de no avanzar y trabajos de OM estaban VACÍOS
-- de fábrica (sólo había causas): el cierre, el avance y la OM nueva caían a
-- texto libre. Aquí se carga una lista INICIAL de mantenimiento CCTV/red,
-- genérica (no son datos de la planta) y EDITABLE en Ubicaciones → Catálogos.
--
-- SÓLO SI ESE CATÁLOGO ESTÁ VACÍO: si Mantenimiento ya cargó el suyo, no se
-- toca ni se mezcla. Aditiva e idempotente.
-- ===========================================================================

INSERT INTO "catalog_items" ("id", "kind", "code", "name", "group", "sequence", "notes", "updatedAt")
SELECT * FROM (VALUES
  (gen_random_uuid(), 'SINTOMA'::"CatalogKind", 'SIN_IMAGEN', 'Sin imagen / pantalla negra', 'Imagen', 10, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'SINTOMA'::"CatalogKind", 'IMAGEN_INTERMITENTE', 'Imagen intermitente o congelada', 'Imagen', 20, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'SINTOMA'::"CatalogKind", 'IMAGEN_BORROSA', 'Imagen borrosa o sucia', 'Imagen', 30, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'SINTOMA'::"CatalogKind", 'SIN_IR', 'Sin visión nocturna (IR)', 'Imagen', 40, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'SINTOMA'::"CatalogKind", 'COLOR_ALTERADO', 'Color o contraste alterado', 'Imagen', 50, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'SINTOMA'::"CatalogKind", 'ANGULO_MOVIDO', 'Ángulo movido: no ve lo que debe', 'Imagen', 60, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'SINTOMA'::"CatalogKind", 'SIN_PING', 'No responde a ping', 'Red', 70, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'SINTOMA'::"CatalogKind", 'ENLACE_INESTABLE', 'Enlace inestable / pérdida de paquetes', 'Red', 80, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'SINTOMA'::"CatalogKind", 'SENAL_BAJA', 'Señal inalámbrica baja', 'Red', 90, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'SINTOMA'::"CatalogKind", 'NO_GRABA', 'No graba / huecos en la grabación', 'Grabación', 100, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'SINTOMA'::"CatalogKind", 'ALERTA_DISCO', 'Alerta de disco en el grabador', 'Grabación', 110, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'SINTOMA'::"CatalogKind", 'SESIONES_AGOTADAS', 'No deja abrir más vistas (sesiones)', 'Grabación', 120, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'SINTOMA'::"CatalogKind", 'SIN_ENERGIA', 'Equipo apagado / sin energía', 'Energía', 130, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'SINTOMA'::"CatalogKind", 'REINICIOS', 'Se reinicia solo', 'Energía', 140, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'SINTOMA'::"CatalogKind", 'CARCASA_DANADA', 'Carcasa o vidrio dañado', 'Físico', 150, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'SINTOMA'::"CatalogKind", 'SOPORTE_FLOJO', 'Soporte flojo', 'Físico', 160, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'SINTOMA'::"CatalogKind", 'AGUA_POLVO', 'Entrada de agua o polvo', 'Físico', 170, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'SINTOMA'::"CatalogKind", 'SIN_SINTOMA', 'Sin síntoma (preventivo o inspección)', 'Otros', 180, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'SINTOMA'::"CatalogKind", 'OTRO', 'Otro síntoma', 'Otros', 190, NULL, CURRENT_TIMESTAMP)
) AS v(id, kind, code, name, "group", sequence, notes, "updatedAt")
WHERE NOT EXISTS (SELECT 1 FROM "catalog_items" WHERE "kind" = 'SINTOMA'::"CatalogKind")
ON CONFLICT ("kind", "code") DO NOTHING;

INSERT INTO "catalog_items" ("id", "kind", "code", "name", "group", "sequence", "notes", "updatedAt")
SELECT * FROM (VALUES
  (gen_random_uuid(), 'ACCION'::"CatalogKind", 'LIMPIEZA_LENTE', 'Limpieza de lente / domo', 'Limpieza', 10, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ACCION'::"CatalogKind", 'LIMPIEZA_GABINETE', 'Limpieza de gabinete', 'Limpieza', 20, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ACCION'::"CatalogKind", 'REAJUSTE_ANGULO', 'Reajuste de ángulo / enfoque', 'Ajuste', 30, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ACCION'::"CatalogKind", 'AJUSTE_SOPORTE', 'Ajuste de soporte', 'Ajuste', 40, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ACCION'::"CatalogKind", 'ALINEACION_ANTENA', 'Alineación de antena', 'Ajuste', 50, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ACCION'::"CatalogKind", 'CAMBIO_CONECTOR', 'Cambio de conector RJ45', 'Cableado', 60, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ACCION'::"CatalogKind", 'CAMBIO_PATCHCORD', 'Cambio de patch cord', 'Cableado', 70, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ACCION'::"CatalogKind", 'TENDIDO_CABLE', 'Tendido o reemplazo de cable', 'Cableado', 80, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ACCION'::"CatalogKind", 'SELLADO', 'Cambio de prensaestopa / sellado', 'Cableado', 90, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ACCION'::"CatalogKind", 'CAMBIO_FUENTE', 'Cambio de fuente / inyector PoE', 'Energía', 100, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ACCION'::"CatalogKind", 'REARME_LLAVE', 'Rearme de llave térmica', 'Energía', 110, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ACCION'::"CatalogKind", 'REINICIO_EQUIPO', 'Reinicio del equipo', 'Energía', 120, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ACCION'::"CatalogKind", 'CAMBIO_EQUIPO', 'Cambio de equipo', 'Equipo', 130, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ACCION'::"CatalogKind", 'CAMBIO_DISCO', 'Cambio de disco del grabador', 'Equipo', 140, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ACCION'::"CatalogKind", 'FIRMWARE', 'Actualización de firmware', 'Equipo', 150, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ACCION'::"CatalogKind", 'RECONFIGURACION', 'Reconfiguración (IP, canal, perfil)', 'Equipo', 160, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ACCION'::"CatalogKind", 'CAMBIO_PUERTO', 'Cambio de puerto del switch', 'Red', 170, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ACCION'::"CatalogKind", 'LIBERAR_SESIONES', 'Liberar sesiones del grabador', 'Red', 180, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ACCION'::"CatalogKind", 'INSPECCION_SIN_CAMBIOS', 'Inspección sin cambios', 'Otros', 190, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ACCION'::"CatalogKind", 'OTRO', 'Otra acción', 'Otros', 200, NULL, CURRENT_TIMESTAMP)
) AS v(id, kind, code, name, "group", sequence, notes, "updatedAt")
WHERE NOT EXISTS (SELECT 1 FROM "catalog_items" WHERE "kind" = 'ACCION'::"CatalogKind")
ON CONFLICT ("kind", "code") DO NOTHING;

INSERT INTO "catalog_items" ("id", "kind", "code", "name", "group", "sequence", "notes", "updatedAt")
SELECT * FROM (VALUES
  (gen_random_uuid(), 'MOTIVO_AVANCE'::"CatalogKind", 'FALTA_MANLIFT', 'Falta manlift o andamio', 'Acceso', 10, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MOTIVO_AVANCE'::"CatalogKind", 'SIN_PARADA', 'No se dio la parada del tren', 'Acceso', 20, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MOTIVO_AVANCE'::"CatalogKind", 'SIN_PERMISO', 'Falta permiso (PETAR o bloqueo)', 'Acceso', 30, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MOTIVO_AVANCE'::"CatalogKind", 'GRUA_EN_USO', 'Grúa en operación: no se pudo subir', 'Acceso', 40, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MOTIVO_AVANCE'::"CatalogKind", 'FALTA_REPUESTO', 'Falta repuesto en almacén', 'Material', 50, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MOTIVO_AVANCE'::"CatalogKind", 'FALTA_HERRAMIENTA', 'Falta herramienta o equipo de medición', 'Material', 60, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MOTIVO_AVANCE'::"CatalogKind", 'SIN_ACOMPANANTE', 'Sin acompañante o sin personal', 'Personal', 70, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MOTIVO_AVANCE'::"CatalogKind", 'REASIGNADO', 'Personal reasignado a una emergencia', 'Personal', 80, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MOTIVO_AVANCE'::"CatalogKind", 'CONDICIONES', 'Condiciones del entorno (lluvia, viento, calor)', 'Entorno', 90, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MOTIVO_AVANCE'::"CatalogKind", 'ZONA_SIN_ENERGIA', 'Zona sin energía', 'Entorno', 100, NULL, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MOTIVO_AVANCE'::"CatalogKind", 'OTRO', 'Otro motivo', 'Otros', 110, NULL, CURRENT_TIMESTAMP)
) AS v(id, kind, code, name, "group", sequence, notes, "updatedAt")
WHERE NOT EXISTS (SELECT 1 FROM "catalog_items" WHERE "kind" = 'MOTIVO_AVANCE'::"CatalogKind")
ON CONFLICT ("kind", "code") DO NOTHING;

INSERT INTO "catalog_items" ("id", "kind", "code", "name", "group", "sequence", "notes", "updatedAt")
SELECT * FROM (VALUES
  (gen_random_uuid(), 'TRABAJO_OM'::"CatalogKind", 'PREV_CAMARA', 'Preventivo de cámara', 'PREVENTIVO', 10, 'Limpieza de lente y carcasa; revisión de soporte, conector y prensaestopa; verificación de imagen y grabación.', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'TRABAJO_OM'::"CatalogKind", 'PREV_NVR', 'Preventivo de grabador (NVR)', 'PREVENTIVO', 20, 'Revisión de discos, días de grabación, sesiones, firmware y ventilación.', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'TRABAJO_OM'::"CatalogKind", 'PREV_SWITCH', 'Preventivo de switch / gabinete', 'PREVENTIVO', 30, 'Limpieza del gabinete; revisión de puertos, temperatura, ventilación y orden del cableado.', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'TRABAJO_OM'::"CatalogKind", 'PREV_ANTENA', 'Preventivo de antena / radioenlace', 'PREVENTIVO', 40, 'Revisión de alineación, señal (dBm), fijación, conectores y fuente PoE.', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'TRABAJO_OM'::"CatalogKind", 'PREV_UPS', 'Preventivo de UPS / fuente', 'PREVENTIVO', 50, 'Revisión de baterías, autonomía, alarmas y conexiones.', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'TRABAJO_OM'::"CatalogKind", 'CORR_SIN_IMAGEN', 'Cámara sin imagen', 'CORRECTIVO', 60, 'Diagnosticar y restablecer la imagen: energía, enlace y configuración.', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'TRABAJO_OM'::"CatalogKind", 'CORR_ENLACE', 'Enlace caído o inestable', 'CORRECTIVO', 70, 'Diagnosticar el enlace (cable, puerto, antena) y restablecer la comunicación.', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'TRABAJO_OM'::"CatalogKind", 'CORR_GRABACION', 'Falla de grabación', 'CORRECTIVO', 80, 'Revisar discos, canales y configuración del grabador hasta recuperar la grabación.', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'TRABAJO_OM'::"CatalogKind", 'CORR_CAMBIO_EQUIPO', 'Cambio de equipo dañado', 'CORRECTIVO', 90, 'Retirar el equipo dañado, instalar el de reemplazo, configurar y verificar imagen y grabación.', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'TRABAJO_OM'::"CatalogKind", 'MEJ_REUBICAR', 'Reubicar cámara', 'MEJORA', 100, 'Mover la cámara al nuevo punto acordado y ajustar ángulo y cableado.', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'TRABAJO_OM'::"CatalogKind", 'MEJ_NUEVO_PUNTO', 'Nuevo punto de cámara', 'MEJORA', 110, 'Instalar y configurar un punto nuevo de cámara.', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'TRABAJO_OM'::"CatalogKind", 'MEJ_ORDENAR_GABINETE', 'Ordenar gabinete y rotular', 'MEJORA', 120, 'Ordenar y rotular el cableado y los equipos del gabinete según la norma.', CURRENT_TIMESTAMP)
) AS v(id, kind, code, name, "group", sequence, notes, "updatedAt")
WHERE NOT EXISTS (SELECT 1 FROM "catalog_items" WHERE "kind" = 'TRABAJO_OM'::"CatalogKind")
ON CONFLICT ("kind", "code") DO NOTHING;
