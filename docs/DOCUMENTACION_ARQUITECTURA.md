# Documentación de arquitectura — SGIT-CCTV

Manual técnico para entender **cómo funciona el sistema por dentro**. No es solo
código: cada pieza se explica por qué existe, qué recibe y qué devuelve.

---

## 1. Visión general

SGIT-CCTV es un **monolito modular** en NestJS. Un solo proceso backend expone una API
REST versionada (`/api/v1`) y se apoya en tres servicios de infraestructura:
PostgreSQL (datos), Redis (cache/colas) y MinIO (archivos). Nginx actúa de puerta de
entrada. Todo corre en contenedores Docker sobre un servidor on-premise.

```
Petición HTTP
   │
Nginx ──► API NestJS ──► Prisma Client ──► PostgreSQL
   │                        │
   │                        └─► (Redis / MinIO en fases siguientes)
```

---

## 2. Cómo funciona NestJS

NestJS organiza el backend en **módulos**. Cada módulo agrupa tres piezas:

- **Controller** — recibe las peticiones HTTP y define las rutas. Es la "cara" del módulo.
  *Qué recibe:* la request (body, params, query). *Qué devuelve:* la respuesta JSON.
- **Service** — contiene la lógica de negocio. El controller le delega el trabajo.
  *Por qué existe:* separar "cómo se recibe la petición" de "qué se hace con ella".
- **Module** — declara qué controllers y services existen y qué se importa/exporta.

Ejemplo del flujo en `assets`:
```
HTTP GET /api/v1/assets
   │
AssetsController.findAll(query)     <- capa de presentación
   │
AssetsService.findAll(query)        <- lógica de negocio
   │
PrismaService.asset.findMany(...)   <- acceso a datos
   │
PostgreSQL
```

**Inyección de dependencias (DI):** NestJS crea e inyecta automáticamente los servicios.
Por eso el controller recibe `private readonly assets: AssetsService` en su constructor
sin instanciarlo a mano. Esto facilita las pruebas y el desacoplamiento.

**Elementos transversales:**
- **Guards** (`common/guards/`) — se ejecutan **antes** del controller y deciden si la
  petición continúa. `JwtAuthGuard` valida el token; `PermissionsGuard` valida permisos.
- **Decoradores** (`common/decorators/`) — metadatos declarativos:
  `@RequirePermissions('asset.create')`, `@CurrentUser()`, `@Public()`.
- **ValidationPipe** (en `main.ts`) — valida y transforma automáticamente los DTOs de
  entrada usando `class-validator`. Si el body no cumple, responde 400 sin llegar al service.

---

## 3. Cómo funciona Prisma

Prisma es el **ORM**: traduce entre objetos TypeScript y tablas SQL.

- **`schema.prisma`** — la fuente de verdad del modelo de datos. Define modelos (tablas),
  campos, tipos, enums y relaciones.
- **`prisma generate`** — genera el **Prisma Client**, un cliente tipado. Gracias a él,
  `prisma.asset.findMany()` tiene autocompletado y control de tipos en tiempo de compilación.
- **`prisma migrate` / `prisma db push`** — llevan el esquema a la base de datos real.
  `migrate` crea archivos de migración versionados (historial de cambios); `db push`
  sincroniza directamente sin historial (útil para prototipar; usado en el bootstrap F0).
- **`prisma db seed`** — ejecuta `seed.ts` para poblar datos iniciales.

En el código, `PrismaService` (en `src/prisma/`) extiende `PrismaClient` y se conecta
al iniciar el módulo (`onModuleInit → $connect`). Se marca `@Global()` para inyectarlo
en cualquier módulo sin re-importarlo.

*Qué recibe Prisma:* objetos de consulta (`where`, `include`, `data`).
*Qué devuelve:* objetos JavaScript tipados que reflejan las filas.

---

## 4. Cómo se conecta con PostgreSQL

La conexión se define en **una sola variable**: `DATABASE_URL` (en `.env`).

```
postgresql://sgit:sgit_pass@db:5432/sgit_cctv?schema=public
             └user┘ └pass ┘ └hst┘└prt┘└  base  ┘
```

- Prisma lee `DATABASE_URL` (declarada en el bloque `datasource db` del esquema).
- Dentro de Docker, el host es **`db`** (el nombre del servicio en `docker-compose.yml`),
  porque los contenedores se resuelven por nombre dentro de la red `sgit_net`.
- Fuera de Docker (backend local), el host es **`localhost`** y el puerto 5432 publicado.

El `HealthController` confirma la conexión ejecutando `SELECT 1` contra la BD.

---

## 5. Cómo funciona Docker aquí

`docker-compose.yml` describe los 5 servicios y cómo se relacionan:

- Cada servicio corre en su **contenedor** aislado.
- Comparten una **red interna** (`sgit_net`) y se ven por nombre (`db`, `redis`, `minio`, `api`).
- Los datos persisten en **volúmenes** (`db_data`, `redis_data`, `minio_data`) que
  sobreviven a reinicios.
- **Healthchecks** en `db` y `redis` permiten que `api` espere (`depends_on: condition:
  service_healthy`) hasta que estén listos.
- La **API** se construye desde `backend/Dockerfile` (build multi-stage: un stage compila,
  otro ejecuta liviano). El `CMD` sincroniza el esquema (`prisma db push`) y arranca Node.

---

## 6. Cómo se comunican los servicios

```
Navegador / curl
   │  HTTP :80
┌──▼───┐
│Nginx │  location /api/  → proxy_pass http://api:3000
└──┬───┘  location /docs  → proxy_pass http://api:3000
   │
┌──▼──────────┐  DATABASE_URL → db:5432      ┌──────────┐
│  API :3000  │──────────────────────────────►│ Postgres │
│  (NestJS)   │  REDIS_URL   → redis:6379     ├──────────┤
│             │──────────────────────────────►│  Redis   │
│             │  MINIO_ENDPOINT → minio:9000  ├──────────┤
│             │──────────────────────────────►│  MinIO   │
└─────────────┘                                └──────────┘
```

- El cliente solo habla con **Nginx** (:80). Nginx reenvía a la API.
- La API habla con Postgres/Redis/MinIO **por la red interna**, nunca expuesta a fuera.
- Esta separación es clave para el despliegue on-premise seguro (ver
  `DESPLIEGUE_ACEROS_AREQUIPA.md`).

---

## 7. Estructura de carpetas del backend

```
backend/
├── prisma/
│   ├── schema.prisma      # modelo de datos (fuente de verdad)
│   └── seed.ts            # datos iniciales de Pisco
└── src/
    ├── main.ts            # arranque: prefijo /api/v1, Swagger, ValidationPipe
    ├── app.module.ts      # módulo raíz: importa todos los módulos
    ├── prisma/            # PrismaService global (conexión a BD)
    ├── common/            # guards, decoradores, health (transversal)
    └── modules/           # un subdirectorio por dominio de negocio
```

Cada módulo de `modules/` sigue el patrón `*.controller.ts` / `*.service.ts` /
`*.module.ts` (+ `dto/` cuando recibe datos). La documentación detallada de cada uno
está en `docs/modulos/`.

---

## 8. Convenciones importantes

- **Nomenclatura de activos:** validada por regex `AA-<TIPO>-T<n>-<zona>-<###>`
  (ej. `AA-CAM-T1-FX-001`) en el DTO de creación.
- **Baja lógica (soft delete):** los activos no se borran; se marca `deletedAt` y estado
  `BAJA`, preservando la trazabilidad.
- **RBAC por permiso:** los endpoints exigen permisos concretos (`asset.create`), no
  solo roles. Los permisos se resuelven al iniciar sesión y viajan en el JWT.
- **Campos SAP-ready:** `sapId`, `costCenter`, `sapLocationCode`, `responsibleArea` están
  en el modelo desde F0 para la futura integración sin rediseño.
