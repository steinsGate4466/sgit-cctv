# Despliegue en Railway (todo en la nube)

Objetivo: que el ingeniero abra el sistema desde su laptop con una URL pública, sin instalar nada.

Railway despliega **servicios**, no `docker-compose`. Creamos 4 servicios en un mismo proyecto:
**PostgreSQL** (plugin) · **MinIO** (fotos) · **Backend (API)** · **Frontend**.

El código ya está preparado: el backend hace auto-provisión (crea tablas + datos demo al arrancar) y el frontend tiene su build de producción.

---

## Paso 0 — Cuenta y proyecto
1. Entra a **railway.com** e inicia sesión con GitHub.
2. **New Project** → **Deploy from GitHub repo** → elige `steinsGate4466/sgit-cctv`.
   (Autoriza a Railway a leer el repo.)

## Paso 1 — PostgreSQL
1. En el proyecto: **+ New** → **Database** → **Add PostgreSQL**.
2. Queda listo; expone la variable `DATABASE_URL` (la usaremos por referencia).

## Paso 2 — MinIO (almacenamiento de fotos)
1. **+ New** → **Empty Service** (o **Docker Image**) → imagen `minio/minio`.
2. En **Settings → Deploy → Start Command**: `server /data --console-address ":9001"`
3. En **Variables** del servicio MinIO:
   - `MINIO_ROOT_USER` = `sgit_minio`
   - `MINIO_ROOT_PASSWORD` = (una contraseña fuerte)
4. En **Settings → Volumes**: agrega un volumen montado en `/data` (para que las fotos persistan).
5. Anota el **nombre interno** del servicio (ej. `minio`); el backend lo usará como `minio.railway.internal`.

## Paso 3 — Backend (API)
1. **+ New** → **GitHub Repo** → mismo repo → en **Settings** pon **Root Directory** = `/backend` (usará `backend/Dockerfile`).
   - En **Settings → Deploy → Custom Start Command** pon:
     `npx prisma db push --skip-generate && (node dist/seed.js || true) && node dist/main.js`
     (Esto crea las tablas y datos demo SOLO en la nube. Tu Dockerfile y tu entorno local quedan intactos.)
2. En **Variables** del backend:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (referencia al plugin) |
| `JWT_SECRET` | (cadena aleatoria larga) |
| `JWT_REFRESH_SECRET` | (otra cadena aleatoria larga) |
| `CREDENTIAL_ENC_KEY` | (cadena aleatoria de 32+ caracteres — **no la cambies luego** o se pierden las contraseñas guardadas) |
| `MINIO_ENDPOINT` | `minio.railway.internal` (nombre interno del servicio MinIO) |
| `MINIO_PORT` | `9000` |
| `MINIO_ACCESS_KEY` | `sgit_minio` |
| `MINIO_SECRET_KEY` | (la misma que pusiste en MINIO_ROOT_PASSWORD) |
| `ADMIN_EMAIL` | `admin@acerosarequipa.local` |
| `ADMIN_PASSWORD` | (contraseña del admin) |

3. En **Settings → Networking → Generate Domain** → copia la URL pública del backend (ej. `https://sgit-backend-xxxx.up.railway.app`).

## Paso 4 — Frontend
1. **+ New** → **GitHub Repo** → mismo repo → **Root Directory** = `/frontend`.
2. En **Variables** del frontend:
   - `VITE_API_URL` = la URL del backend **+ `/api/v1`**
     (ej. `https://sgit-backend-xxxx.up.railway.app/api/v1`)
3. **Generate Domain** → copia la URL pública del frontend (ej. `https://sgit-frontend-xxxx.up.railway.app`).
   Esta es la que le pasas al ingeniero.

## Paso 5 — Cerrar el círculo (CORS)
1. Vuelve al **Backend → Variables** y agrega:
   - `CORS_ORIGIN` = la URL del **frontend** (ej. `https://sgit-frontend-xxxx.up.railway.app`)
2. Railway redepliega solo. Listo.

---

## Verificación
- Abre `https://sgit-backend-xxxx.up.railway.app/api/v1/health` → debe responder `{"status":"ok","db":"up"}`.
- Abre la URL del **frontend** → login con `admin@acerosarequipa.local` / (tu ADMIN_PASSWORD).

## Notas
- El backend en Railway usa el **Custom Start Command** para crear tablas + datos demo al arrancar. Tu entorno local NO cambia (sigue con db push/seed manual como hasta ahora).
- Cada vez que hagas `git push`, Railway **redepliega solo**.
- Si MinIO no conecta (fotos), el resto del sistema funciona igual; se revisa el `MINIO_ENDPOINT`/puerto.
- Seguridad: usa secretos fuertes y distintos a los de desarrollo (esto cubre la deuda QA #1).
