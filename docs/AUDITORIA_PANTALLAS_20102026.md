# Auditoría pantalla por pantalla — 20/10/2026

**Cómo:** 61 pantallas × 4 recorridos (Jefe PC, Técnico PC, Producción PC, Jefe celular) = 244 capturas.
Consola y red: **0 errores JS, 0 HTTP 4xx/5xx**. Lo que sigue son fallos de **lógica, permisos y lectura**: no rompen nada, mienten en pantalla.

---

## A · GRAVES — funcional / permisos (7)

| # | Pantalla | Qué pasa | Causa (código) |
|---|---|---|---|
| A1 | Sesiones · Mi cuenta | «0 personas trabajando» y «Última actividad: sin usar» **siempre** | `ultimoUsoEn` sólo se escribe al rotar (`auth.service.ts:224`); `activaAhora` (`users.service.ts:375`) nunca da verdadero |
| A2 | Dashboard · Indicadores · Exportar · Bandeja | **Producción ve la gestión del ingeniero** (lo que el bloque 80 quitó) | Se abren con `dashboard.read` (`modulos.ts:76,177,178`, `pestanas.ts:64`, controladores), no con `wo.read`. La prueba `produccion-ve-gestion.spec.ts:115` da falsa seguridad |
| A3 | Incidencias · Criticidad · Zonas · KPIs | **Producción ve toda la planta**, no su tren | Sin `filtroConAmbito` en `incidents.service.ts:459`, `criticidad.controller.ts:38-45` y bandeja |
| A4 | Mis cámaras · Avance · Mis activos · Por tren | Arranca en el **primer tren de la lista («Grúas», vacío)**; sectores vacíos salen **verdes con ✓** | `trenes.ts:74`, `TrainBoard.tsx:123`, `PorTren.tsx:109`; `VistaGeneral.tsx:172` enlaza sin `?tren=` |
| A5 | Grabadores | NVR «Operativo» mientras Impacto lo da caído | Usa `status` guardado, no el estado calculado (`grabadores.service.ts:75`) |
| A6 | Red · Exportar | El **Técnico recibe IPs sin `credential.read`**; el Excel «Red» sólo pide `asset.read` | `assets.service.ts:599-602, 1072`; `exportacion.controller.ts:50` |
| A7 | Pedir instalación · Mi tren | Al **Jefe** le dice «pídeselo al Jefe de Mantenimiento» | `PuertaDeRuta.tsx:24-25` |

## B · NÚMEROS QUE SE CONTRADICEN (8)

- **Dashboard:** «Equipos en trabajo 0» junto a «4 órdenes abiertas».
- **Indicadores:** «Vigilancia disponible 100 %» y «Satisfacción 100 %» sin datos o con incidencias fallando → viola «sin datos, nunca un número».
- **Bandeja:** «4 asignadas sin detallar» con 2 sin asignar; OM al 60 % marcadas «sin detallar».
- **Activos:** 35 en un sitio, 36 en otro.
- **Repuestos y obsolescencia:** «Almacén (0)» con 6 filas.
- **Calidad de datos:** 91 pintado en verde.
- **Criticidad:** A/B/C = 0 con un plan Preventivo activo; frecuencias 30/60/90 vs «3 MESES».
- **Dependencias:** «por 1 un equipo caído» (`dependencias.ts:574`); frase de línea 327 contradice la de 292.
- **Rotulado:** dos tablas de colores de cable distintas.

## C · VISUAL / LECTURA (PC)

- **Repuestos** no cabe en 1366 px: «Eliminar» cortado, 7 botones por fila. El gráfico sólo cuenta equipos vinculados (`inventory.service.ts:250`).
- `.card` **sin relleno** cuando no lleva tabla: Exportar, Electricidad, IPAM, Planos, Mi cuenta, Indicadores, Roles, Rotulado, Conexiones, Grabadores.
- **Valores crudos de la base:** CRITICA, EN_PROCESO, ABIERTA, MAPA_CABLE_TRAZAR, CORE_ANILLO, AASA-PISCO-T1, WIRELESS (Incidencias, Preventivo, Correctivo, Auditoría, Indicadores).
- Códigos partidos en dos líneas en tablas · fechas de filtro en **mm/dd/yyyy** · «SIN DETALLAR» en OM cerradas (`Maintenance.tsx:656`) · plurales «(s)».
- «Eliminar» dentro de filas (Cableado, Campañas, Gabinetes, Ubicaciones).
- **Mi cuenta promete cambiar contraseña y no existe.**
- **Mapa de red:** 25 hallazgos repetidos, códigos no pulsables.
- Doble mensaje de vacío (Mejoras, Avance, Mis activos).

## D · CELULAR (Jefe)

- Cabecera de **~285 px** antes del contenido.
- Tablas cortadas; filtros abiertos ocupan 1–1,6 pantallas; KPIs uno por fila.
- Conexiones: la «×» (12 px) tapa la etiqueta VLAN.
- Mensajes de vacío truncados; «Descargar todas» (Hojas de ruta) con poco contraste.

## E · DEUDA SIN SÍNTOMA

- `PUEDE_MAPEAR` decide por **nombre de rol** (`maintenance.service.ts:53`) — viola la regla del bloque 62.
- Roles de la semilla sin plantilla en el panel de desfase.

## Lo que está bien

- Técnico: puede hacer su trabajo de campo completo («Mis trabajos» vacío sólo porque los datos no le asignan OM).
- Mapa, planos, campañas, cierre con evidencia: sin fallos.
- Cero errores de consola o red en 244 capturas.

---

## Orden propuesto para arreglar

1. **A2 + A3 + A6** — permisos y ámbito (seguridad; delante de un ingeniero es lo primero que se nota).
2. **A1, A4, A5, A7 + B** — números que mienten.
3. **C** — Repuestos a 1366, relleno de `.card`, enums crudos, fechas.
4. **D** — celular.
