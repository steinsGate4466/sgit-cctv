# Estado actual del proyecto — SGIT-CCTV

> Documento de auditoría de cierre de la fase **F0 (Fundaciones)**.
> Código base: `SGIT-CCTV` · Auditor: Tech Lead / DevOps · Fecha: Julio 2026.
> Alcance: fotografía real del proyecto **antes** de aplicar correcciones y de iniciar F1.

---

## 1. Resumen ejecutivo

F0 entregó el andamiaje completo del backend (NestJS + Prisma + PostgreSQL) y la
infraestructura Docker (PostgreSQL, Redis, MinIO, API, Nginx). El modelo de datos
está completo y refleja la realidad de Planta Pisco (topología en anillo, arquitectura
PMP, VLANs por Tren, incidencias de saturación NVR, campos SAP-ready).

El proyecto **compila conceptualmente** y su estructura es coherente, pero **aún no ha
sido ejecutado de extremo a extremo** (falta generar la migración inicial y probar el
arranque de contenedores). Se detectaron 4 problemas que impiden un `docker compose up`
limpio en el primer intento; todos tienen solución conocida y se corrigen en esta entrega.

Estado global: **F0 funcional a nivel de código, pendiente de primera ejecución real.**

---

## 2. Arquitectura actual

Monolito modular (Clean Architecture) desplegado on-premise con Docker.

```
Cliente (Swagger / SPA futura)
        │  HTTP
   ┌────▼────┐
   │  Nginx  │  reverse proxy (:80)
   └────┬────┘
        │  /api/ , /docs
   ┌────▼─────────┐
   │  API NestJS  │  (:3000)  ── REST /api/v1 + OpenAPI /docs
   └──┬───────┬───┘
      │       │
 ┌────▼──┐ ┌──▼────┐ ┌────────┐
 │ Postgres│ Redis │ │ MinIO  │
 │ :5432 │ │ :6379 │ │ :9000  │
 └───────┘ └───────┘ └────────┘
```

Capas del backend: Presentación (controllers) → Aplicación (services) → Dominio
(reglas, validaciones) → Infraestructura (PrismaService, MinIO, Redis).

---

## 3. Tecnologías utilizadas

| Área | Tecnología | Versión objetivo |
|---|---|---|
| Lenguaje | TypeScript | 5.5 |
| Framework backend | NestJS | 10.x |
| ORM | Prisma | 5.18 |
| Base de datos | PostgreSQL | 16 |
| Cache/colas | Redis | 7 |
| Objetos/archivos | MinIO (S3) | latest |
| Auth | JWT + Passport + argon2 | — |
| Contenedores | Docker + Docker Compose | — |
| Proxy | Nginx | 1.27 |
| Docs API | Swagger / OpenAPI | 7.x |

---

## 4. Servicios Docker

| Servicio | Imagen | Puerto | Estado | Notas |
|---|---|---|---|---|
| `db` | postgres:16-alpine | 5432 | Definido + healthcheck | Volumen `db_data` |
| `redis` | redis:7-alpine | 6379 | Definido + healthcheck | AOF activado |
| `minio` | minio/minio | 9000/9001 | Definido | Sin healthcheck; bucket no auto-creado |
| `api` | build ./backend | 3000 | Definido | `depends_on` db+redis (healthy) |
| `nginx` | nginx:1.27-alpine | 80 | Definido | Sirve texto placeholder en `/` |

Validación YAML: **OK** (`python -c yaml.safe_load` correcto, 5 servicios).

---

## 5. Módulos creados (backend)

| Módulo | Estado | Contenido |
|---|---|---|
| `auth` | Funcional | login JWT (argon2), estrategia JWT, `/auth/me` |
| `users` | Básico | listado de usuarios |
| `locations` | Funcional | listado + árbol jerárquico (`/locations/tree`) |
| `assets` | Funcional (slice) | CRUD + validación de nomenclatura `AA-CAM-T1-FX-001` + soft delete |
| `dashboard` | Funcional | KPIs (activos, cámaras fuera de servicio, disponibilidad) |
| `troubleshooting` | Funcional | métricas de resolución (MTTR, causa raíz) |
| `network` | Esqueleto | `@Module({})` — pendiente F2 |
| `maintenance` | Esqueleto | pendiente F3 |
| `incidents` | Esqueleto | pendiente F3 |
| `documents` | Esqueleto | pendiente F4 |
| `audit` | Esqueleto | pendiente F1 |
| `integration` | Esqueleto | pendiente F5 (SAP/Zabbix) |

Transversal: `PrismaModule` (global), `common/` (guards JWT y de permisos,
decoradores `@RequirePermissions`, `@CurrentUser`, `@Public`), `HealthController`.

---

## 6. Modelo de datos (Prisma)

Esquema completo (502 líneas) con: `User/Role/Permission/RolePermission`,
`Location` (auto-referenciada), `Asset` + extensiones (`AssetCamera`, `AssetNvr`,
`AssetSwitch`, `AssetWireless`), red (`Vlan`, `SwitchPort`, `NetworkLink`),
`Credential`, `WorkOrder`+evidencias, `Incident`, `Document`, `AuditLog`,
`AssetHistory`. Incluye enums de dominio (topología PMP, criticidad, categorías de
incidencia como `SATURACION_SESIONES_NVR`) y campos SAP-ready (`sapId`, `costCenter`,
`sapLocationCode`, `responsibleArea`).

Auditoría estática de relaciones: **correcta** (todas las relaciones múltiples entre
los mismos modelos están nombradas y pareadas: `PortSwitch`, `PortConnectedAsset`,
`LinkEndpointA/B`, `LocationTree`, `AssignedTechnician`, `IncidentResponsible`).

---

## 7. Funcionalidades implementadas

- Autenticación JWT con hash argon2 y resolución de permisos por rol al iniciar sesión.
- RBAC por permiso granular (guards + decoradores).
- CRUD de activos con validación de nomenclatura y baja lógica (soft delete).
- Jerarquía de ubicaciones y su árbol.
- KPIs de dashboard y métricas de troubleshooting.
- Health check con verificación de conexión a BD.
- Documentación OpenAPI automática en `/docs`.
- Semilla de Pisco (roles, permisos, VLANs, jerarquía, activos demo PMP).

---

## 8. Funcionalidades pendientes

- **Frontend React**: la carpeta `frontend/` está **vacía** (planificado F4).
- Migraciones Prisma: **no existe** `prisma/migrations/` (se genera en primera ejecución).
- Módulos de negocio: network, maintenance, incidents, documents, audit, integration.
- Refresh tokens reales y logout/rotación (F1).
- Interceptor de auditoría automática (F1).
- Cifrado real de credenciales CCTV (F1).
- Carga de archivos a MinIO y creación del bucket (F4).
- Integración SAP/Zabbix (F5).

---

## 9. Problemas encontrados

> Formato: **ERROR / CAUSA / SOLUCIÓN**. Ninguno se oculta. Las correcciones se aplican
> en esta misma entrega (ver `DOCUMENTACION_ARQUITECTURA.md` y changelog abajo).

### P1 — [CRÍTICO] El contenedor `api` no arranca en el primer `docker compose up`
- **ERROR:** el `CMD` del Dockerfile ejecuta `npx prisma migrate deploy` y falla.
- **CAUSA:** (a) `prisma` CLI está en `devDependencies` y el stage `runner` usa
  `npm ci --omit=dev`, por lo que `npx` intentaría **descargar** prisma en runtime
  (imposible en red aislada); (b) **no hay migraciones** que desplegar.
- **SOLUCIÓN:** copiar `node_modules` completo desde el stage `builder` al `runner`
  (incluye prisma CLI y ts-node) y usar `prisma db push` para el bootstrap inicial de
  F0 (crea el esquema sin historial de migraciones). En F1 se generará la migración
  inicial (`migrate dev --name init`) y se volverá a `migrate deploy`.

### P2 — [ALTO] `prisma db seed` no funciona dentro del contenedor de producción
- **ERROR:** el seed no corre en el runner.
- **CAUSA:** `prisma.seed` usa `ts-node` (devDependency), ausente tras `--omit=dev`.
- **SOLUCIÓN:** con la corrección de P1 (copiar `node_modules` completo) `ts-node`
  queda disponible; el seed corre con `docker compose exec api npx prisma db seed`.

### P3 — [MEDIO] Posible fallo de compilación de `argon2` en Alpine
- **ERROR:** `npm ci` puede fallar al compilar el binding nativo de argon2.
- **CAUSA:** `node:20-alpine` no trae toolchain de compilación.
- **SOLUCIÓN:** instalar `python3 make g++` en el stage builder antes de `npm ci`.

### P4 — [MEDIO] Frontend inexistente pero referenciado en la guía
- **ERROR:** la guía de ejecución menciona `frontend: npm install` pero no hay proyecto.
- **CAUSA:** el frontend está planificado para F4; en F0 solo se creó la carpeta.
- **SOLUCIÓN:** documentar el paso como **pendiente (F4)** y añadir `frontend/README.md`
  con el plan, para evitar confusión.

### P5 — [BAJO] MinIO sin healthcheck ni bucket inicial
- **ERROR:** no se garantiza que MinIO esté listo ni que exista el bucket de documentos.
- **CAUSA:** F0 no gestiona archivos todavía.
- **SOLUCIÓN:** se documenta; la creación del bucket `sgit-documents` se implementa en F4.

---

## 10. Riesgos técnicos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Migraciones no versionadas aún | Divergencia esquema/BD | Generar `migrate dev --name init` al inicio de F1 |
| Secretos por defecto en `.env.example` | Seguridad | Forzar cambio en `.env` real y en despliegue |
| `argon2` nativo en Alpine | Build inestable | Build deps añadidas (P3) o alternativa prebuilt |
| Sin HTTPS aún | Confidencialidad en VPN | TLS en Nginx en despliegue (ver `DESPLIEGUE_ACEROS_AREQUIPA.md`) |
| Frontend ausente | Percepción de incompletitud | Roadmap claro F4; API usable vía Swagger |
| Un solo nodo Docker | Disponibilidad | Aceptable on-premise; backups de volúmenes |

---

## 11. Veredicto y siguiente paso

F0 es una base **sólida y coherente**. Tras aplicar las correcciones P1–P4 el sistema
queda listo para su **primera ejecución real** y para iniciar **F1 (Seguridad
empresarial)**. No se implementa F1 en esta entrega.

---

## 12. Resultados de validación (FASE 4)

> Honestidad total: se distingue lo verificado de forma automática/estática de lo que
> requiere ejecución en tu entorno (Docker/Node no están disponibles en el entorno donde
> se preparó esta auditoría).

### Verificado aquí (estático)
| Comprobación | Resultado |
|---|---|
| `docker-compose.yml` parseable (YAML) | **OK** — 5 servicios (db, redis, minio, api, nginx) |
| `backend/package.json` parseable (JSON) | **OK** — 10 scripts npm |
| Módulos importados en `app.module.ts` existen | **OK** — 12/12 archivos presentes |
| Nombres de clase de módulos coinciden con imports | **OK** |
| Relaciones Prisma nombradas y pareadas | **OK** (auditoría manual) |
| Correcciones P1–P4 aplicadas | **OK** (ver Dockerfile y `frontend/README.md`) |

### Pendiente de ejecutar en tu entorno (runtime)
Estos comandos deben correrse en tu laptop con Docker + Node (salida esperada indicada):

| Comando | Salida esperada |
|---|---|
| `docker compose config` | imprime la configuración combinada sin errores |
| `docker compose up -d` + `docker compose ps` | 5 contenedores `running`/`healthy` |
| `cd backend && npm install` | instala sin errores (argon2 compila con las build deps) |
| `npm run build` | genera `dist/` sin errores de TypeScript |
| `npx prisma validate` | `The schema is valid` |
| `npx prisma generate` | `Generated Prisma Client` |
| `GET /api/v1/health` | `{ "status":"ok", "db":"up" }` |
| `GET /docs` | interfaz Swagger cargada |

> Si `prisma validate` o `npm run build` reportaran algún ajuste, se documenta aquí con el
> formato ERROR/CAUSA/SOLUCIÓN y se corrige antes de iniciar F1.
