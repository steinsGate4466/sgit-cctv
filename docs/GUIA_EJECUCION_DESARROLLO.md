# Guía de ejecución en desarrollo — SGIT-CCTV

Manual desde cero para que una persona nueva levante el sistema en su laptop.
Pensado para **Windows 10/11 con WSL2 + Docker Desktop**.

---

## Requisitos previos

| Herramienta | Para qué | Cómo obtenerla |
|---|---|---|
| **Windows 10/11** | Sistema operativo base | — |
| **WSL2** | Linux dentro de Windows (Docker lo usa) | `wsl --install` en PowerShell (admin) |
| **Docker Desktop** | Levantar contenedores (BD, Redis, MinIO, API) | docker.com/products/docker-desktop |
| **Node.js 20 LTS** | Ejecutar backend/frontend fuera de Docker | nodejs.org (o `nvm`) |
| **Git** | Clonar y versionar el proyecto | git-scm.com |
| **VS Code** | Editor (extensiones: Prisma, ESLint, Docker) | code.visualstudio.com |

Verifica las versiones:
```bash
wsl --version
docker --version
node -v      # v20.x
git --version
```

---

## PASO 1 — Obtener el proyecto

Si está en un repositorio Git:
```bash
git clone <URL_DEL_REPOSITORIO> sgit-cctv
cd sgit-cctv
```
Si te entregaron el `.zip`: descomprímelo y entra a la carpeta `sgit-cctv`.

Estructura principal:
```
sgit-cctv/
├── docker-compose.yml   # orquestación de servicios
├── .env.example         # plantilla de variables
├── backend/             # API NestJS + Prisma
├── frontend/            # SPA React (pendiente F4)
├── infra/nginx/         # configuración Nginx
└── docs/                # esta documentación
```

---

## PASO 2 — Configurar variables de entorno (`.env`)

Copia la plantilla y edítala:
```bash
cp .env.example .env
```

Explicación de las variables clave:

| Variable | Qué es | Ejemplo / nota |
|---|---|---|
| `DATABASE_URL` | Cadena de conexión que Prisma usa para hablar con PostgreSQL. Formato `postgresql://usuario:password@host:puerto/basedatos?schema=public`. | `postgresql://sgit:sgit_pass@localhost:5432/sgit_cctv?schema=public`. **Dentro de Docker** el host es `db` (nombre del servicio), no `localhost`. |
| `JWT_SECRET` | Clave secreta con la que se **firman** los tokens de acceso (JWT). Si alguien la conoce puede falsificar sesiones. **Cambiar siempre en producción.** | cadena larga y aleatoria |
| `JWT_REFRESH_SECRET` | Clave secreta para los *refresh tokens* (se usan en F1). | otra cadena distinta |
| `REDIS_URL` | Conexión a Redis (cache y colas). | `redis://localhost:6379` (o `redis://redis:6379` en Docker) |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | Usuario y contraseña de administrador de MinIO (almacén de archivos: fotos, planos, backups). | `sgit_minio` / `sgit_minio_pass` |
| `MINIO_ENDPOINT` / `MINIO_PORT` | Dónde está el servicio MinIO. | `localhost` / `9000` (o `minio`/`9000` en Docker) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Usuario administrador que crea la semilla. | `admin@acerosarequipa.local` / `Admin.Pisco2026` |

> **Seguridad:** el archivo `.env` NO se sube al repositorio (está en `.gitignore`).
> `.env.example` solo tiene valores de ejemplo.

---

## PASO 3 — Levantar la infraestructura (Docker)

```bash
docker compose up -d
```

Esto arranca 5 contenedores. Qué hace cada uno:

| Contenedor | Rol | Puerto |
|---|---|---|
| **PostgreSQL** (`db`) | Base de datos relacional: guarda activos, ubicaciones, incidencias, usuarios, auditoría. | 5432 |
| **Redis** (`redis`) | Cache y colas de tareas (reportes, notificaciones futuras). | 6379 |
| **MinIO** (`minio`) | Almacén de archivos compatible con S3: fotos, planos, manuales, backups de config. | 9000 (API) / 9001 (consola) |
| **API** (`api`) | El backend NestJS: expone la API REST y Swagger. | 3000 |
| **Nginx** (`nginx`) | Reverse proxy: punto de entrada único, enruta `/api` y `/docs` hacia la API. | 80 |

Comprueba que están arriba:
```bash
docker compose ps
docker compose logs -f api   # ver logs de la API (Ctrl+C para salir)
```

---

## PASO 4 — Instalar dependencias

**Backend:**
```bash
cd backend
npm install
```
Esto descarga NestJS, Prisma, argon2, etc. (definidos en `backend/package.json`).

**Frontend:** *(pendiente — se implementa en F4; ver `frontend/README.md`).*
```bash
# cd ../frontend && npm install   # disponible cuando exista el proyecto React
```

---

## PASO 5 — Configurar la base de datos con Prisma

Desde `backend/`:

```bash
npx prisma generate
npx prisma migrate deploy   # o, en el primer arranque de F0: npx prisma db push
npx prisma db seed
```

Qué hace cada comando:

- **`npx prisma generate`** — lee `prisma/schema.prisma` y genera el *Prisma Client*
  (código TypeScript tipado para consultar la BD). Se ejecuta cada vez que cambia el esquema.
- **`npx prisma migrate deploy`** — aplica las migraciones (cambios de esquema
  versionados en `prisma/migrations/`) a la base de datos. **En F0 todavía no hay
  migraciones**, así que para el primer arranque usa `npx prisma db push`, que crea las
  tablas directamente desde el esquema. En F1 se generará la migración inicial con
  `npx prisma migrate dev --name init`.
- **`npx prisma db seed`** — ejecuta `prisma/seed.ts` y carga los datos base de Pisco:
  roles, permisos, VLANs (10/20/30/100/200), jerarquía (Aceros Arequipa → Pisco →
  Tren 1/2/3), activos de ejemplo y el usuario administrador.

> Si usas solo Docker, puedes correr estos comandos dentro del contenedor:
> `docker compose exec api npx prisma db push` y `docker compose exec api npx prisma db seed`.

Herramienta útil: `npx prisma studio` abre un explorador visual de la BD en el navegador.

---

## PASO 6 — Ejecutar el backend

Modo desarrollo (recarga automática):
```bash
cd backend
npm run start:dev
```
La API queda en `http://localhost:3000`. Verás en consola:
`SGIT-CCTV API escuchando en :3000 (docs en /docs)`.

> Si levantaste todo con Docker, la API **ya está corriendo** en el contenedor `api`
> y no necesitas este paso. Úsalo cuando quieras desarrollar con recarga en caliente.

---

## PASO 7 — Ejecutar el frontend

*(Pendiente — Fase F4.)* Cuando exista el proyecto React:
```bash
cd frontend
npm run dev     # http://localhost:5173
```
Por ahora, toda la funcionalidad se prueba desde Swagger (Paso 8).

---

## PASO 8 — Acceso al sistema

| Recurso | URL | Notas |
|---|---|---|
| API REST | `http://localhost:3000/api/v1` | Prefijo global `api/v1` |
| **Swagger (docs)** | `http://localhost:3000/docs` | Explorar y probar todos los endpoints |
| Health check | `http://localhost:3000/api/v1/health` | Devuelve estado de la API y la BD |
| Consola MinIO | `http://localhost:9001` | Usuario/clave de `.env` |
| Vía Nginx | `http://localhost/api/v1/health` | Punto de entrada unificado (:80) |

**Usuario inicial (creado por el seed):**
- Email: `admin@acerosarequipa.local`
- Contraseña: `Admin.Pisco2026`  *(cambiar en `.env` para producción)*

**Probar el login rápido:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@acerosarequipa.local","password":"Admin.Pisco2026"}'
```
Copia el `accessToken` de la respuesta y úsalo en Swagger (botón **Authorize**) o:
```bash
curl http://localhost:3000/api/v1/dashboard/kpis -H "Authorization: Bearer <TOKEN>"
```

---

## Problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| `ECONNREFUSED :5432` | La BD no está lista / `.env` con host incorrecto | Espera al healthcheck; usa `db` como host dentro de Docker |
| Error compilando `argon2` | Falta toolchain nativo | Ya resuelto en el Dockerfile; en local usa Node 20 LTS |
| `PrismaClientInitializationError` | No corriste `prisma generate` | Ejecuta `npx prisma generate` |
| Swagger vacío | La API no arrancó | Revisa `docker compose logs api` |
| Puerto 80/3000 ocupado | Otro proceso lo usa | Cambia `HTTP_PORT`/`API_PORT` en `.env` |
