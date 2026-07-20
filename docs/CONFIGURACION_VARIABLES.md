# Configuración de variables de entorno — SGIT-CCTV

El sistema se configura con un archivo `.env` en la raíz del proyecto. Se crea copiando
la plantilla:

```bash
cp .env.example .env
```

`.env` **no se sube al repositorio** (está en `.gitignore`). `.env.example` solo contiene
valores de ejemplo para desarrollo.

> Regla de oro: **en desarrollo** puedes usar los valores de ejemplo tal cual.
> **En producción (Planta Pisco)** debes cambiar TODOS los secretos.

---

## 1. Entorno general

| Variable | Qué es | Desarrollo | Producción |
|---|---|---|---|
| `NODE_ENV` | Modo de ejecución de Node/Nest. | `development` | `production` |

---

## 2. PostgreSQL (base de datos)

| Variable | Qué es | Desarrollo | Producción |
|---|---|---|---|
| `POSTGRES_USER` | Usuario técnico de la BD. | `sgit` | usuario propio, no genérico |
| `POSTGRES_PASSWORD` | Contraseña de ese usuario. | `sgit_pass` | **cambiar** por una fuerte |
| `POSTGRES_DB` | Nombre de la base de datos. | `sgit_cctv` | `sgit_cctv` |
| `POSTGRES_PORT` | Puerto publicado en el host. | `5432` | no exponer fuera de la red interna |
| `DATABASE_URL` | Cadena completa que **Prisma** usa para conectarse. | `postgresql://sgit:sgit_pass@localhost:5432/sgit_cctv?schema=public` | host = `db` dentro de Docker; credenciales reales |

**Anatomía de `DATABASE_URL`:**
```
postgresql://sgit:sgit_pass@localhost:5432/sgit_cctv?schema=public
             └usr┘ └ pass ┘ └  host  ┘└prt┘ └  base  ┘ └ esquema ┘
```
- **Fuera de Docker** (backend local): host `localhost`.
- **Dentro de Docker**: host `db` (nombre del servicio en `docker-compose.yml`).

---

## 3. Redis (cache y colas)

| Variable | Qué es | Desarrollo | Producción |
|---|---|---|---|
| `REDIS_PORT` | Puerto de Redis en el host. | `6379` | no exponer |
| `REDIS_URL` | Conexión que usa la API. | `redis://localhost:6379` | `redis://redis:6379` en Docker |

Redis aún no es crítico en F0; se usará para refresh tokens (F1) y colas (F4).

---

## 4. MinIO (almacenamiento de archivos)

| Variable | Qué es | Desarrollo | Producción |
|---|---|---|---|
| `MINIO_ROOT_USER` | Usuario admin de MinIO. | `sgit_minio` | usuario propio |
| `MINIO_ROOT_PASSWORD` | Contraseña admin. | `sgit_minio_pass` | **cambiar** (mín. 8 caracteres) |
| `MINIO_PORT` | Puerto API S3. | `9000` | interno |
| `MINIO_CONSOLE_PORT` | Puerto de la consola web. | `9001` | solo administradores |
| `MINIO_ENDPOINT` | Host de MinIO para la API. | `localhost` | `minio` en Docker |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | Credenciales de acceso S3 (iguales al root en dev). | `sgit_minio` / `sgit_minio_pass` | claves de servicio dedicadas |
| `MINIO_BUCKET` | Bucket donde se guardan documentos. | `sgit-documents` | `sgit-documents` |

MinIO guardará fotos de evidencias, planos, manuales y backups de configuración (F4).

---

## 5. API y JWT (seguridad)

| Variable | Qué es | Desarrollo | Producción |
|---|---|---|---|
| `API_PORT` / `PORT` | Puerto donde escucha la API NestJS. | `3000` | interno (Nginx expone 80/443) |
| `JWT_SECRET` | Clave que **firma** los access tokens. Quien la tenga puede falsificar sesiones. | valor de ejemplo | **cambiar** por cadena larga aleatoria |
| `JWT_EXPIRES_IN` | Duración del access token. | `900s` (15 min) | 15 min es un buen valor |
| `JWT_REFRESH_SECRET` | Clave que firma los refresh tokens (se usan en F1). | valor de ejemplo | **cambiar**, distinta a la anterior |
| `JWT_REFRESH_EXPIRES_IN` | Duración del refresh token. | `7d` | 7d razonable |

> Para generar un secreto fuerte: `openssl rand -base64 48` (en WSL) o `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`.

---

## 6. Nginx y usuario inicial

| Variable | Qué es | Desarrollo | Producción |
|---|---|---|---|
| `HTTP_PORT` | Puerto público de Nginx. | `80` | `80`→redirige a `443` (HTTPS) |
| `ADMIN_EMAIL` | Email del administrador que crea el seed. | `admin@acerosarequipa.local` | correo corporativo real |
| `ADMIN_PASSWORD` | Contraseña de ese admin. | `Admin.Pisco2026` | **cambiar** obligatorio |

---

## 7. Checklist antes de producción

- [ ] `NODE_ENV=production`.
- [ ] `JWT_SECRET` y `JWT_REFRESH_SECRET` regenerados (aleatorios y distintos).
- [ ] Contraseñas de PostgreSQL y MinIO cambiadas.
- [ ] `ADMIN_PASSWORD` cambiada; considerar deshabilitar el admin de ejemplo.
- [ ] Hosts internos (`db`, `redis`, `minio`) para el despliegue en Docker.
- [ ] Puertos de BD/Redis/MinIO **no** publicados fuera de la red interna.
