-- =========================================================================
--  BLOQUE 183 — PANTALLA FIJA: LA CUENTA DEL MONITOR QUE NO SE CIERRA
--  -----------------------------------------------------------------------
--  El cierre por inactividad vuelve (bloque 183). Un PC de púlpito con el
--  mapa abierto todo el turno no está abandonado, y para él existe este
--  permiso. El servidor sólo deja darlo a un rol de SÓLO LECTURA, sin
--  credenciales, auditoría ni usuarios (`problemaPantallaFija`).
--
--  No se concede a NADIE: es una decisión del Jefe, desde Roles (hay una
--  plantilla «Pantalla fija (púlpito o sala)»). Migración ADITIVA.
-- =========================================================================
INSERT INTO "permissions" ("id", "code", "description")
SELECT gen_random_uuid(), 'sesion.pantalla_fija',
       'Pantalla fija: la sesión no se cierra por inactividad (sólo roles de lectura)'
WHERE NOT EXISTS (SELECT 1 FROM "permissions" WHERE "code" = 'sesion.pantalla_fija');
