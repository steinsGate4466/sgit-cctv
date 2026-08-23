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
docker compose exec api npx prisma db seed
```

> **Ojo si venías de antes del bloque 52:** la semilla ya **no** está en
> `dist/seed.js`, sino en `dist/prisma/seed.js`. Cambió porque desde Prisma 7
> la semilla importa el cliente desde `src/generated`, y eso obligó a mover la
> raíz de compilación. Lo más seguro es llamarla con `prisma db seed`, que lee
> la ruta de `prisma.config.ts` y siempre acierta.

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

## Cuatro cosas que hay que saber

**0. Docker NO ve tus cambios hasta que reconstruyes.** Es la trampa que más
tiempo cuesta, porque no da ningún error: simplemente sigue corriendo el
código viejo.

Pasó el 23/08/2026 con Prisma 7. Se arregló un fallo, se probó en Windows, se
subió a Git… y el contenedor seguía reventando con el error de antes. La
imagen se había construido media hora atrás. `docker compose up -d` levanta
**la imagen que ya existe**; no vuelve a compilar nada.

Si tocaste **cualquier cosa** del backend o del frontend:

```powershell
docker compose up -d --build
```

Y si sólo cambió uno, para no esperar los cuatro minutos completos:

```powershell
docker compose up -d --build api
```

**Regla:** si el registro sigue diciendo lo mismo después de arreglar algo,
la primera sospecha es la imagen, no el arreglo.



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
