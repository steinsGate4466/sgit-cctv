# F1-A — Fundación de seguridad (guard global + refresh tokens)

**Fase:** F1 (Seguridad empresarial) · **Incremento:** F1-A · **Estado:** implementado (código),
pendiente de compilar/probar en la máquina del desarrollador. Sub-paso siguiente: migración
inicial de Prisma (F1-B).

---

## 1. Objetivo

1. **Protección por defecto** de todos los endpoints mediante guards globales (secure-by-default).
2. **Refresh tokens**: renovar el access token (corto) sin re-login, recalculando permisos.

---

## 2. Archivos modificados / creados

| Archivo | Cambio | Motivo |
|---|---|---|
| `src/app.module.ts` | + `APP_GUARD` con `JwtAuthGuard` y `PermissionsGuard` | Seguridad global: todo endpoint exige token y permisos, salvo `@Public()`. |
| `src/modules/auth/auth.service.ts` | + `refresh()` y `buildTokens()` (refactor) | Rotación de tokens y única fuente de emisión. |
| `src/modules/auth/auth.controller.ts` | + `POST /auth/refresh` (`@Public`); `/me` ahora usa guard global | Endpoint de renovación; se elimina `@UseGuards` redundante. |
| `src/modules/auth/dto/refresh.dto.ts` | **nuevo** | Validación del body `{ refreshToken }`. |
| `src/common/health.controller.ts` | + `@Public()` | El health check no debe requerir token (si no, el guard global lo bloquearía). |

> Nota: los controladores existentes (assets, users, locations, dashboard, troubleshooting)
> conservan su `@UseGuards(...)`. Con el guard global ahora es **redundante** (se ejecuta el
> guard dos veces, sin efecto adverso). Limpiarlos es una tarea menor opcional posterior.

---

## 3. Cómo funciona

### Guard global (`app.module.ts`)
Se registran dos `APP_GUARD` en orden:
1. `JwtAuthGuard` — valida el JWT en toda petición. Si el handler tiene `@Public()`, lo deja pasar.
2. `PermissionsGuard` — si el handler declara `@RequirePermissions(...)`, verifica que el token
   los tenga; si no declara ninguno, pasa.

Resultado: **cualquier endpoint nuevo queda protegido automáticamente**; solo lo marcado como
`@Public()` (login, refresh, health) es accesible sin token.

### Refresh (`auth.service.ts` → `refresh()`)
- **Recibe:** el refresh token.
- **Hace:** lo verifica con `JWT_REFRESH_SECRET`; si es válido, recarga el usuario y sus
  permisos desde la BD y emite un **nuevo par** de tokens (rotación).
- **Devuelve:** `{ accessToken, refreshToken, user }`.
- **Por qué:** el access token dura 15 min; el refresh (7 días) permite renovarlo sin re-login,
  y al recargar permisos, un cambio de rol se refleja en la siguiente rotación.

---

## 4. Cómo probar

1. Reconstruir y levantar:
   ```cmd
   docker compose up -d --build
   ```
2. Login (obtén `refreshToken`):
   ```cmd
   curl -X POST http://localhost:3000/api/v1/auth/login -H "Content-Type: application/json" -d "{\"email\":\"admin@acerosarequipa.local\",\"password\":\"Admin.Pisco2026\"}"
   ```
3. Renovar tokens con el refresh:
   ```cmd
   curl -X POST http://localhost:3000/api/v1/auth/refresh -H "Content-Type: application/json" -d "{\"refreshToken\":\"<REFRESH_TOKEN>\"}"
   ```
   Debe devolver un nuevo `accessToken` y `refreshToken`.
4. Verificar protección por defecto (sin token → 401):
   ```cmd
   curl -i http://localhost:3000/api/v1/assets
   ```
   Debe responder `401 Unauthorized`.
5. Health sigue público:
   ```cmd
   curl http://localhost:3000/api/v1/health
   ```
   Debe responder `{"status":"ok",...}` sin token.

---

## 5. Pendiente (próximos sub-pasos de F1)

- **F1-B — Migración inicial de Prisma:** generar `prisma/migrations/`, baselinear la BD
  existente y cambiar el contenedor de `db push` a `migrate deploy`. Procedimiento controlado
  aparte (toca el arranque del contenedor y el estado de la BD).
- **Revocación / logout:** requiere un almacén de tokens (Redis o tabla). Se decidirá su
  diseño en el siguiente incremento.
- **Interceptor de auditoría automática** (F1.4), gestión de usuarios/roles (F1.5), cifrado de
  credenciales CCTV (F1.6), preparación Active Directory (F1.8).

---

## 6. Verificación realizada

- Revisión estática de imports/uso: coherente.
- Transpilación de sintaxis de los 5 archivos con el compilador TypeScript: **sin errores**.
- Falta la compilación completa (`nest build`) y las pruebas de runtime en la máquina del
  desarrollador (paso 4 de arriba).
