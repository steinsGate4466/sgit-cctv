# F1-F — Cifrado de credenciales CCTV

**Fase:** F1 · **Incremento:** F1-F · **Estado:** implementado (código), pendiente de
compilar/probar. Cifrado AES-256-GCM verificado en roundtrip.

---

## 1. Objetivo

Guardar de forma **cifrada** las credenciales de equipos (cámaras/NVR/switches) y permitir
revelarlas solo a usuarios autorizados, dejando **traza de cada revelación**. Responde al
dolor real de Pisco (necesitar credenciales de admin de dispositivos con rapidez).

---

## 2. Archivos

| Archivo | Cambio | Rol |
|---|---|---|
| `src/common/crypto/crypto.util.ts` | **nuevo** | `encryptSecret`/`decryptSecret` con AES-256-GCM (clave derivada de `CREDENTIAL_ENC_KEY`). |
| `src/modules/credentials/credentials.service.ts` | **nuevo** | Crear/listar/revelar/eliminar; cifra al guardar y descifra solo al revelar. |
| `src/modules/credentials/credentials.controller.ts` | **nuevo** | Endpoints con permisos `credential.read` / `credential.manage`. |
| `src/modules/credentials/dto/create-credential.dto.ts` | **nuevo** | Validación. |
| `src/modules/credentials/credentials.module.ts` | **nuevo** | Importa `AuditModule` para auditar revelaciones. |
| `src/app.module.ts` | modificado | Registra `CredentialsModule`. |
| `prisma/seed.ts` | modificado | Añade permisos `credential.read` / `credential.manage` (Admin + Supervisor TI). |
| `docker-compose.yml` / `.env.example` | modificado | Nueva variable `CREDENTIAL_ENC_KEY`. |

Sin migración: la tabla `credentials` ya existe en el esquema.

---

## 3. Seguridad

- **AES-256-GCM** (cifrado autenticado): el secreto se guarda como `ivB64.tagB64.dataB64`.
- La clave se deriva (scrypt) de `CREDENTIAL_ENC_KEY` — **cambiar en producción**.
- El `secretEnc` **nunca** se expone en listados; solo se descifra en el endpoint de revelar.
- **Revelar exige el permiso elevado `credential.manage`** y queda **auditado** (acción
  `REVEAL` en `audit_logs`, con usuario e IP).

---

## 4. Endpoints

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| POST | `/api/v1/credentials` | `credential.manage` | Crea credencial (cifra el secreto). |
| GET | `/api/v1/credentials?assetId=...` | `credential.read` | Lista credenciales de un activo (sin secreto). |
| GET | `/api/v1/credentials/:id/reveal` | `credential.manage` | Revela el secreto (auditado). |
| DELETE | `/api/v1/credentials/:id` | `credential.manage` | Elimina la credencial. |

---

## 5. Cómo probar

1. Reconstruir:
   ```cmd
   docker compose up -d --build
   ```
2. **Re-sembrar** para cargar los nuevos permisos (idempotente, NO borra datos):
   ```cmd
   docker compose exec api npx prisma db seed
   ```
3. **Re-login** del admin (los permisos viajan en el token; hay que renovarlo):
   ```cmd
   curl -X POST http://localhost:3000/api/v1/auth/login -H "Content-Type: application/json" -d "{\"email\":\"admin@acerosarequipa.local\",\"password\":\"Admin.Pisco2026\"}"
   ```
4. Obtener el id de un activo (p. ej. el NVR) con `GET /assets`, y crear una credencial:
   ```cmd
   curl -X POST http://localhost:3000/api/v1/credentials -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" -d "{\"assetId\":\"<ID_NVR>\",\"username\":\"admin\",\"secret\":\"Hik.NVR.2026\",\"type\":\"admin\"}"
   ```
5. Listar (sin secreto) y revelar:
   ```cmd
   curl "http://localhost:3000/api/v1/credentials?assetId=<ID_NVR>" -H "Authorization: Bearer TOKEN"
   curl "http://localhost:3000/api/v1/credentials/<ID_CRED>/reveal" -H "Authorization: Bearer TOKEN"
   ```
   El primero NO trae `secret`; el segundo devuelve `secret: "Hik.NVR.2026"` descifrado.
6. Verificar la auditoría de la revelación:
   ```cmd
   docker compose exec db psql -U sgit -d sgit_cctv -c "SELECT action, entity, \"entityId\" FROM audit_logs WHERE action='REVEAL' ORDER BY \"createdAt\" DESC LIMIT 3;"
   ```

---

## 6. Verificación realizada

- Transpilación de sintaxis de los 6 archivos TS + seed.ts: **sin errores**.
- Roundtrip de cifrado AES-256-GCM: **OK** (cifra y descifra el mismo texto).
- Falta compilación completa y prueba de runtime.
