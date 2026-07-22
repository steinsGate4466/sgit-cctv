# F2-A — Módulo de Incidencias

**Fase:** F2 · **Incremento:** F2-A · **Estado:** implementado (código), pendiente de
compilar/probar. Enciende el dashboard de troubleshooting con datos reales.

## Objetivo
Registrar y gestionar los fallos de la infraestructura (con foco en los recurrentes de
Pisco: saturación de sesiones NVR, caída de enlace PMP, grúas, cámara sin imagen), con
categoría, prioridad, estado, causa raíz y cálculo de MTTR al resolver.

## Archivos (en `backend/src/modules/incidents/`)
- `incidents.service.ts` — crear, listar (filtros + paginación), detalle, actualizar.
  Código auto `INC-<año>-<n>`; al pasar a RESUELTA/CERRADA fija `resolvedAt` y calcula `mttrMinutes`.
- `incidents.controller.ts` — REST con permisos `incident.create/read/update`.
- `dto/` — create, update (incluye `status`, `rootCause`, `responsibleId`), query.
- `incidents.module.ts` — registra controlador y servicio (ya estaba importado en `app.module`).
- `prisma/seed.ts` — 2 incidencias demo (una resuelta con MTTR, una abierta) para poblar el dashboard.

## Endpoints
| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| POST | `/api/v1/incidents` | `incident.create` | Registrar incidencia (código auto). |
| GET | `/api/v1/incidents` | `incident.read` | Listar con filtros (status/category/priority/assetId) + paginación. |
| GET | `/api/v1/incidents/:id` | `incident.read` | Detalle (con activo y responsable). |
| PATCH | `/api/v1/incidents/:id` | `incident.update` | Actualizar; al resolver calcula MTTR. |

Categorías: `GENERAL, SATURACION_SESIONES_NVR, CAIDA_ENLACE_INALAMBRICO,
FALLA_ALMACENAMIENTO_NVR, DECODER_VIDEOWALL, CAMARA_SIN_IMAGEN, RED`.
Prioridades: `BAJA, MEDIA, ALTA, CRITICA`. Estados: `ABIERTA, EN_DIAGNOSTICO, EN_PROCESO,
RESUELTA, CERRADA`.

## Cómo probar
1. Reconstruir: `docker compose up -d --build`.
2. Re-sembrar (idempotente): `docker compose exec api npx prisma db seed` → carga las 2 incidencias demo.
3. Abre el **frontend** (`http://localhost:5173`) → el Dashboard ahora muestra:
   - **Incidencias abiertas: 1**, y en troubleshooting **MTTR ~90 min**, **tiempo sin visión ~45**.
   - El gráfico **"Incidencias por causa raíz"** con 2 categorías (SATURACION_SESIONES_NVR, CAIDA_ENLACE_INALAMBRICO).
4. Crear una incidencia nueva (Swagger `POST /incidents`), por ejemplo:
   ```json
   { "title": "Cámara T1-FX-010 sin imagen", "category": "CAMARA_SIN_IMAGEN", "priority": "MEDIA", "affectedCameras": 1 }
   ```
   y verla en `GET /incidents`.

## Verificación realizada
- Sintaxis de los 6 archivos TS + seed: **sin errores**.
- Falta compilación completa y prueba de runtime.
