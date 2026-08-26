-- ============================================================================
-- BLOQUE 68 · QUIÉN REPORTA UNA AVERÍA Y QUIÉN ABRE UNA ORDEN
-- ----------------------------------------------------------------------------
-- NI UN SOLO NOMBRE DE ROL EN ESTE ARCHIVO.
--
-- La lección del bloque 62-A, que costó que Producción viera el plano
-- eléctrico de toda la planta: una migración que compara por el NOMBRE del
-- rol no falla cuando el nombre no coincide — NO HACE NADA. Falla ABRIENDO,
-- que es el peor modo de fallar. Y el nombre del rol se edita desde la
-- interfaz: es un dato de usuario, no una constante del sistema.
--
-- Así que el reparto va por lo que el rol PUEDE HACER.
--
-- ----------------------------------------------------------------------------
-- REGLA 1 · ABRE UNA ORDEN QUIEN SUPERVISA EL MANTENIMIENTO DE SU TREN
--
--   Capacidad: `om.mirar`.
--
--   `om.mirar` es la llave estrecha del panel de mantenimiento de UN tren.
--   Sólo la tienen los dos cargos del tren —el titular y quien le cubre—, que
--   son precisamente los que están en la línea cuando algo se cae y hoy
--   tenían que bajar a la oficina a pedir que alguien abriera la orden.
--
--   ABRIR NO ES CERRAR. `wo.approve` no se toca: la orden la sigue cerrando
--   el Jefe de Mantenimiento, con firma y materiales. Abrir de más produce
--   trabajo duplicado, que se ve y se corrige; cerrar de más produce trabajo
--   dado por hecho que nadie hizo.
--
-- ----------------------------------------------------------------------------
-- REGLA 2 · REPORTA UNA AVERÍA QUIEN MIRA LAS CÁMARAS O QUIEN TOCA EL EQUIPO
--
--   Capacidades que lo CONSERVAN (cualquiera de las tres):
--     `activos.mirar`  → mira las cámaras de su tren (púlpito y los dos jefes)
--     `om.mirar`       → supervisa el mantenimiento de su tren
--     `asset.update`   → interviene el equipo (los técnicos y el supervisor TI)
--
--   Quien no tiene ninguna de las tres ejecuta órdenes que le asignan: la
--   tercería. Sigue teniendo `wo.report`, o sea que cuenta lo que encontró
--   DENTRO de la orden, que es donde queda atado al trabajo y a quien lo
--   contrató. Lo que ya no puede es abrir un expediente nuevo por su cuenta.
--
--   POR QUÉ SE ESCRIBE COMO «QUIÉN LO CONSERVA» Y NO «A QUIÉN SE LE QUITA»:
--   un rol nuevo que se cree mañana y no tenga ninguna de las tres capacidades
--   tampoco debería reportar. Enumerar a quién se le quita sólo arregla el
--   presente; describir quién lo conserva describe la regla.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- REGLA 1 — conceder `wo.create` a quien tenga `om.mirar`
-- ---------------------------------------------------------------------------
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT DISTINCT rp."roleId", p_nuevo."id"
  FROM "role_permissions" rp
  JOIN "permissions" p_tiene  ON p_tiene."id" = rp."permissionId"
                             AND p_tiene."code" = 'om.mirar'
  JOIN "permissions" p_nuevo  ON p_nuevo."code" = 'wo.create'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- REGLA 2 — retirar `incident.create` a quien no mire cámaras ni toque equipos
-- ---------------------------------------------------------------------------
DELETE FROM "role_permissions" rp
 USING "permissions" p
 WHERE rp."permissionId" = p."id"
   AND p."code" = 'incident.create'
   AND NOT EXISTS (
     SELECT 1
       FROM "role_permissions" rp2
       JOIN "permissions" p2 ON p2."id" = rp2."permissionId"
      WHERE rp2."roleId" = rp."roleId"
        AND p2."code" IN ('activos.mirar', 'om.mirar', 'asset.update')
   );
