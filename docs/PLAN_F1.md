# Plan de la Fase F1 — Seguridad empresarial

> **No implementado aún.** Este documento define el alcance, diseño y criterios de
> aceptación de F1. Se ejecuta **solo tras validar F0** y con tu confirmación.

---

## 1. Objetivo de F1

Convertir la seguridad de F0 (login JWT básico + RBAC) en un esquema **empresarial**:
tokens con refresh y rotación, auditoría automática, protección consistente de todos los
endpoints, gestión cifrada de credenciales de equipos CCTV y preparación para Active
Directory.

---

## 2. Alcance

| # | Entregable | Descripción |
|---|---|---|
| F1.1 | **Refresh tokens** | Endpoint `/auth/refresh`, rotación y revocación; expiración corta del access token. |
| F1.2 | **Logout / revocación** | Lista de refresh tokens válidos (en Redis) e invalidación. |
| F1.3 | **Guard global** | `JwtAuthGuard` + `PermissionsGuard` aplicados globalmente; `@Public()` como excepción. |
| F1.4 | **Auditoría automática** | Interceptor que registra en `audit_logs` toda operación de escritura (quién, qué, antes/después, IP). |
| F1.5 | **Gestión de roles/permisos** | Endpoints para administrar usuarios, roles y permisos (solo Administrador). |
| F1.6 | **Credenciales CCTV cifradas** | Cifrado AES real de `Credential.secretEnc`; acceso auditado y por permiso. |
| F1.7 | **Migración inicial Prisma** | Generar `migrate dev --name init` y volver el contenedor a `migrate deploy`. |
| F1.8 | **Preparación Active Directory** | Diseño del flujo LDAP/AD (sin activarlo aún): estrategia y mapeo de grupos → roles. |

---

## 3. Diseño técnico (resumen)

### Refresh tokens (F1.1/F1.2)
- Access token corto (≈15 min) + refresh token largo (≈7 días).
- El refresh se guarda/valida en **Redis** (`refresh:{userId}:{jti}`), permitiendo
  revocación y rotación (cada uso emite uno nuevo e invalida el anterior).
- *Qué recibe* `/auth/refresh`: el refresh token. *Qué devuelve:* nuevo par de tokens.

### Auditoría automática (F1.4)
- **Interceptor** NestJS (`AuditInterceptor`) que envuelve las mutaciones.
- Registra `userId`, `action`, `entity`, `entityId`, `before`, `after`, `ip`, `timestamp`
  en la tabla `audit_logs` (ya existe en el esquema).
- *Por qué:* trazabilidad total sin ensuciar la lógica de cada service.

### Credenciales CCTV (F1.6)
- Cifrado simétrico AES-256-GCM con clave derivada de una variable de entorno dedicada.
- Descifrado solo en endpoints con permiso `credential.read`, y cada acceso se audita.
- Aplica directamente a la operación real: recuperar rápido credenciales de cámaras/NVR
  (relacionado con los incidentes de coordinación con CAASA/HITSS).

### Active Directory (F1.8) — solo diseño
- Estrategia LDAP contra el AD corporativo para validar el login.
- Mapeo de grupos de AD → roles SGIT (Administrador/Supervisor TI/Técnico/Consulta).
- El RBAC interno se mantiene; AD solo autentica. Activación en fase posterior.

---

## 4. Archivos que se crearán/modificarán (previsto)

```
backend/src/modules/auth/       + refresh, logout, estrategias
backend/src/modules/audit/      + audit.interceptor.ts, audit.service.ts
backend/src/modules/users/      + gestión de usuarios/roles/permisos
backend/src/common/             + APP_GUARD global, crypto util (AES)
backend/prisma/migrations/      + migración inicial (init)
```

Ningún cambio rompe F0: se construye encima de lo existente.

---

## 5. Criterios de aceptación

- Login devuelve access + refresh; `/auth/refresh` rota correctamente; logout revoca.
- Todos los endpoints (salvo `@Public()`) exigen token válido y permiso.
- Toda escritura queda registrada en `audit_logs` con before/after.
- Las credenciales CCTV se guardan cifradas y su lectura queda auditada.
- Existe la migración inicial y el contenedor usa `migrate deploy`.
- El diseño de integración AD está documentado y listo para activarse.

---

## 6. Fuera de alcance de F1

- Frontend (F4), módulos de mantenimiento/incidencias/documentos (F3/F4),
  integración SAP/Zabbix (F5), HTTPS en producción (se coordina con despliegue).

---

## 7. Requisito para iniciar

F0 validado y ejecutado end-to-end (ver `ESTADO_ACTUAL_DEL_PROYECTO.md` y
`GUIA_EJECUCION_DESARROLLO.md`). **A la espera de tu confirmación para comenzar F1.**
