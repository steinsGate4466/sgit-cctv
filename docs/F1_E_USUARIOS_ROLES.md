# F1-E — Gestión de usuarios y roles

**Fase:** F1 · **Incremento:** F1-E · **Estado:** implementado (código), pendiente de
compilar/probar.

---

## 1. Objetivo

Volver el sistema **multiusuario**: crear, editar, desactivar usuarios y asignarles rol,
desde la API, con control por permisos. Hasta ahora solo existía el admin del seed.

---

## 2. Archivos (en `backend/src/modules/users/`)

| Archivo | Cambio | Rol |
|---|---|---|
| `users.service.ts` | reescrito | `findAll`, `findOne`, `create`, `update`, `deactivate`, `listRoles`. Contraseñas con argon2; proyección segura (nunca expone el hash). |
| `users.controller.ts` | reescrito | Endpoints REST con permisos `user.read` / `user.manage`. |
| `dto/create-user.dto.ts` | **nuevo** | Valida email, nombre, password (mín. 8), roleId. |
| `dto/update-user.dto.ts` | **nuevo** | Campos opcionales + `active`. |

Sin migración (usa las tablas existentes). El módulo ya estaba registrado.

---

## 3. Endpoints

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/api/v1/users` | `user.read` | Lista usuarios (sin hash). |
| GET | `/api/v1/users/roles` | `user.read` | Roles disponibles con sus permisos. |
| GET | `/api/v1/users/:id` | `user.read` | Detalle de un usuario. |
| POST | `/api/v1/users` | `user.manage` | Crea usuario (password hasheada). |
| PATCH | `/api/v1/users/:id` | `user.manage` | Edita nombre, rol, estado, password. |
| DELETE | `/api/v1/users/:id` | `user.manage` | **Baja lógica** (`active=false`). |

> Detalle técnico: en el controlador, `GET /users/roles` se declara **antes** de
> `GET /users/:id` para que la palabra `roles` no sea capturada como un `:id`.

---

## 4. Cómo probar

1. Reconstruir:
   ```cmd
   docker compose up -d --build
   ```
2. Login como admin (copia el token) y lista los roles para obtener un `roleId`:
   ```cmd
   curl http://localhost:3000/api/v1/users/roles -H "Authorization: Bearer TOKEN"
   ```
   Copia el `id` del rol **Técnico**.
3. Crea un usuario Técnico (reemplaza ROLE_ID):
   ```cmd
   curl -X POST http://localhost:3000/api/v1/users -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" -d "{\"email\":\"tecnico1@acerosarequipa.local\",\"fullName\":\"Tecnico Uno\",\"password\":\"Tecnico.2026\",\"roleId\":\"ROLE_ID\"}"
   ```
4. Verifica el listado:
   ```cmd
   curl http://localhost:3000/api/v1/users -H "Authorization: Bearer TOKEN"
   ```
5. Confirma que el nuevo usuario puede iniciar sesión:
   ```cmd
   curl -X POST http://localhost:3000/api/v1/auth/login -H "Content-Type: application/json" -d "{\"email\":\"tecnico1@acerosarequipa.local\",\"password\":\"Tecnico.2026\"}"
   ```
6. Prueba de seguridad: con el token del **Técnico**, intenta crear otro usuario → debe dar
   **403 Forbidden** (el Técnico no tiene `user.manage`). Y toda esta actividad queda
   registrada en auditoría (F1-C).

---

## 5. Verificación realizada

- Transpilación de sintaxis de los 4 archivos: **sin errores**.
- Falta compilación completa y prueba de runtime.
