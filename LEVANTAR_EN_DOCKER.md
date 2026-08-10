# Levantar SGIT-CCTV en tu Docker local

Todo el sistema —base de datos, almacenamiento de fotos, API y pantalla— en
tu propia máquina, sin depender de Railway ni de internet.

## La primera vez

```powershell
cd $env:USERPROFILE\Desktop\sgit-cctv
```

```powershell
Copy-Item .env.example .env
```

```powershell
docker compose up -d --build
```

La primera vez tarda: descarga PostgreSQL, Redis y MinIO, y compila el
backend y el frontend. Cinco o diez minutos según tu conexión.

## Crear las tablas y el usuario inicial

Solo la primera vez, cuando los contenedores ya estén arriba:

```powershell
docker compose exec api npx prisma migrate deploy
```

```powershell
docker compose exec api node dist/seed.js
```

## Abrirlo

- **La aplicación:** http://localhost:8080
- **La API:** http://localhost:3000/api/v1
- **Las fotos (MinIO):** http://localhost:9001

El usuario y la contraseña iniciales están en tu `.env`
(`ADMIN_EMAIL` y `ADMIN_PASSWORD`).

## El día a día

Arrancar lo que ya está construido:

```powershell
docker compose up -d
```

Ver qué está corriendo:

```powershell
docker compose ps
```

Ver los registros del backend en vivo:

```powershell
docker compose logs -f api
```

Parar todo (los datos se conservan):

```powershell
docker compose down
```

## Después de traer cambios nuevos

```powershell
docker compose up -d --build
```

```powershell
docker compose exec api npx prisma migrate deploy
```

## Empezar de cero

**Esto BORRA la base de datos local y las fotos.** No toca nada de Railway,
solo tu máquina:

```powershell
docker compose down -v
```

---

## Tres cosas que hay que saber

**1. `CORS_ORIGIN` es obligatoria.** El backend **se niega a arrancar** en
producción si no está declarada. Es deliberado: un servidor que levanta con
CORS abierto acepta peticiones de cualquier web que visite un usuario con la
sesión abierta, y eso no se nota nunca. Ya viene puesta en el compose para
`localhost`.

*Faltaba en el `docker-compose.yml` — con la configuración anterior el
contenedor `api` arrancaba y moría en el acto. Corregido.*

**2. El volumen de PostgreSQL va en `/var/lib/postgresql`, no en `.../data`.**
Desde la versión 18 la imagen coloca los datos en un subdirectorio con el
número de versión. Con la ruta antigua el contenedor arranca y muere con un
error largo sobre `pg_ctlcluster`. Ya está corregido en el compose.

**3. La URL de la API se hornea al construir el frontend.** Vite la mete
dentro del JavaScript en tiempo de compilación; no la lee al arrancar. Si
cambias `VITE_API_URL`, hay que **reconstruir**:

```powershell
docker compose up -d --build web
```
