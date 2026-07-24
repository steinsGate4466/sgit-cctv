# F5.1 — Correcciones de bugs, permisos y endurecimiento

Aceros Arequipa · Planta Pisco · SGIT-CCTV · Julio 2026

## 1. Permisos de incidencias (regla de negocio)

- El **técnico** (y Técnico de Red) **registra** la incidencia y puede moverla entre estados **no terminales**: Abierta → En diagnóstico → En proceso → **En espera**. Esto sirve para **avisar al Jefe de Mantenimiento / Supervisor TI** de lo que está pasando.
- El **cierre/resolución** de una incidencia (con firma y análisis) queda reservado **solo al Jefe de Mantenimiento** (`incident.close`). El **Supervisor TI ya NO puede cerrar** (se le retiró `incident.close`), igual que ya ocurría con las OM (`wo.approve`, solo Jefe).
- El backend **bloquea** intentar cerrar por la vía genérica (`PATCH`): si alguien manda estado `RESUELTA`/`CERRADA` sin firmar, responde 403 con mensaje claro.

Cambios: `seed.ts` (permisos por rol), `incidents.controller.ts` (`resolve` → `incident.close`), `incidents.service.ts` (bloqueo de estados terminales en `update`), `Incidents.tsx` (selector de estado para el técnico + botón “Resolver” solo para el Jefe).

## 2. Filtro global de errores (no más “Internal server error”)

Se agregó `AllExceptionsFilter` que traduce errores técnicos a mensajes claros en español y con el código HTTP correcto:
- Duplicados (`P2002`) → 409 “Ya existe un registro con ese …”.
- Referencia inválida (`P2003`) → 400.
- No encontrado (`P2025`) → 404.
- Datos inválidos / enum inexistente → 400 “Datos inválidos…”.
- Errores inesperados → 500 genérico al cliente, pero con **traza completa en el log** del servidor.

Cambios: `common/filters/all-exceptions.filter.ts` (nuevo), `main.ts` (registro).

## 3. Seguridad

- **Bloqueo de login en el servidor** (anti fuerza bruta): tras **5 intentos fallidos** por correo, la cuenta se **bloquea 15 minutos**. Antes el contador vivía solo en el navegador; ahora también en el backend y **queda auditado** (`LOGIN_FALLIDO`, `LOGIN_BLOQUEADO`).
- **CORS con lista blanca** por variable `CORS_ORIGIN` (coma-separada). Si no se define, modo desarrollo (abierto).

Cambios: `auth.service.ts`, `main.ts`.

## 4. Despliegue seguro (lección del incidente)

El `prisma db push` en el Start Command hacía que el contenedor **corriera el push y se cerrara** (“Completed”), tumbando el backend. La data **nunca se borró** (vive en el volumen de Postgres).

Regla a partir de ahora:
- **Start Command = `node dist/main.js`** (el backend solo arranca, no toca el esquema).
- Los cambios de esquema se aplican de forma **controlada** (una vez), no en cada arranque:
  - Temporalmente poner Start Command `npx prisma db push --skip-generate && node dist/main.js`, desplegar, y **volver a `node dist/main.js`**; o
  - correr `node dist/seed.js` / `npx prisma db push` una sola vez desde la Console.
- Migraciones versionadas (`prisma migrate`) quedan como paso de endurecimiento planificado, hecho con calma y probado en local.

## 5. Pasos post-deploy en Railway (importante)

1. **Start Command** del backend = `node dist/main.js`.
2. Ejecutar **una vez** en la Console del backend: `node dist/seed.js`
   (aplica los permisos nuevos por rol — el seed es idempotente, no duplica ni borra data).
3. (Opcional) Variable `CORS_ORIGIN` = URL del frontend.
