# F1-C — Auditoría automática (interceptor)

**Fase:** F1 · **Incremento:** F1-C · **Estado:** implementado (código), pendiente de
compilar/probar en la máquina del desarrollador.

---

## 1. Objetivo

Registrar automáticamente en `audit_logs` toda **operación de escritura** (crear, actualizar,
eliminar), sin tener que añadir código en cada servicio. Trazabilidad total del ERP.

---

## 2. Archivos (todos en `backend/src/modules/audit/`)

| Archivo | Cambio | Rol |
|---|---|---|
| `audit.service.ts` | **nuevo** | `record(entry)` persiste el registro en `audit_logs`. Los errores se silencian (la auditoría nunca rompe la operación). |
| `audit.interceptor.ts` | **nuevo** | Interceptor que, tras cada mutación exitosa, arma y envía el registro. |
| `audit.module.ts` | modificado | Registra el interceptor de forma **global** (`APP_INTERCEPTOR`) y expone `AuditService`. |

No se toca el esquema (la tabla `audit_logs` ya existe) ni otros módulos.

---

## 3. Cómo funciona

1. El interceptor corre en **todas** las rutas (global). Los guards ya poblaron `req.user`.
2. Si el método es **POST/PATCH/PUT/DELETE** y la ruta **no** contiene `/auth/`
   (para no guardar tokens), tras el handler registra:
   - `userId` (del token), `action` (CREATE/UPDATE/DELETE), `entity` (derivada del path,
     p. ej. `assets`), `entityId` (del `id` de la respuesta o de `params.id`),
     `after` (la respuesta, salvo en DELETE), `ip`.
3. El registro es **fire-and-forget**: no bloquea ni altera la respuesta.

> Nota de diseño: el `before` (imagen previa) no se captura en el interceptor genérico
> porque requiere lógica por entidad (una lectura extra antes de escribir). Se añadirá por
> módulo donde aporte valor. El `after` sí queda registrado.

---

## 4. Cómo probar

1. Aplicar los archivos (extraer el zip) y reconstruir:
   ```cmd
   docker compose up -d --build
   ```
2. Login y crear un activo (genera un evento de auditoría):
   ```cmd
   curl -X POST http://localhost:3000/api/v1/auth/login -H "Content-Type: application/json" -d "{\"email\":\"admin@acerosarequipa.local\",\"password\":\"Admin.Pisco2026\"}"
   ```
   (copia el accessToken)
   ```cmd
   curl -X POST http://localhost:3000/api/v1/assets -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" -d "{\"assetCode\":\"AA-CAM-T1-FX-060\",\"type\":\"CAMERA\",\"brand\":\"Hikvision\"}"
   ```
3. Ver el registro de auditoría:
   ```cmd
   docker compose exec db psql -U sgit -d sgit_cctv -c "SELECT action, entity, entity_id, user_id, ip, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 5;"
   ```
   Debe mostrar una fila `CREATE | assets | <id> | <userId> | ...`.
4. Verificar que un GET **no** genera auditoría (solo mutaciones):
   ```cmd
   curl http://localhost:3000/api/v1/assets -H "Authorization: Bearer TOKEN"
   ```
   (no debe añadir filas nuevas a `audit_logs`).

---

## 5. Verificación realizada

- Transpilación de sintaxis de los 3 archivos: **sin errores**.
- Falta compilación completa y prueba de runtime (pasos de arriba).

---

## 6. Pendiente (siguientes incrementos F1)

- Captura de `before` por módulo donde aporte valor.
- Endpoint de consulta de auditoría (`GET /audit`) con permiso `audit.read`.
- Gestión de usuarios/roles, cifrado de credenciales CCTV, revocación de tokens, AD.
