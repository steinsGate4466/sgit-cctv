# F1-D — Consulta de auditoría (GET /audit)

**Fase:** F1 · **Incremento:** F1-D · **Estado:** implementado (código), pendiente de
compilar/probar. Cierra el módulo de auditoría (F1-C escribía; ahora se puede leer).

---

## 1. Objetivo

Exponer el historial de `audit_logs` vía API, con **filtros** y **paginación**, protegido
por el permiso `audit.read` (lo tienen Administrador, Supervisor TI y Auditoría).

---

## 2. Archivos (en `backend/src/modules/audit/`)

| Archivo | Cambio | Rol |
|---|---|---|
| `audit.controller.ts` | **nuevo** | `GET /api/v1/audit` con `@RequirePermissions('audit.read')`. |
| `audit.service.ts` | modificado | + `findMany(q)` con filtros y paginación (transacción count + findMany). |
| `dto/query-audit.dto.ts` | **nuevo** | Valida filtros: `entity`, `action`, `userId`, `page`, `pageSize`. |
| `audit.module.ts` | modificado | Registra el `AuditController`. |

---

## 3. Endpoint

`GET /api/v1/audit` (requiere token + permiso `audit.read`)

Query params (todos opcionales):
- `entity` — filtra por recurso (p. ej. `assets`).
- `action` — `CREATE` | `UPDATE` | `DELETE`.
- `userId` — filtra por autor.
- `page` (def. 1), `pageSize` (def. 50, máx. 200).

Respuesta: `{ page, pageSize, total, data: [ ...registros ordenados por fecha desc ] }`.

---

## 4. Cómo probar

```cmd
REM (login y token como antes)
curl "http://localhost:3000/api/v1/audit?entity=assets&action=CREATE&pageSize=10" -H "Authorization: Bearer TOKEN"
```
Debe devolver el historial de creaciones de activos (incluida la de F1-C), con `total` y `data`.

Prueba de seguridad: con un usuario **sin** permiso `audit.read` (rol Técnico/Consulta),
debe responder `403 Forbidden`.

---

## 5. Verificación realizada

- Transpilación de sintaxis de los 4 archivos: **sin errores**.
- Falta compilación completa y prueba de runtime.
