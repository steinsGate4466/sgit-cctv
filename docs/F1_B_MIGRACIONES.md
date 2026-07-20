# F1-B — Migración inicial de Prisma (db push → migrate deploy)

**Fase:** F1 · **Incremento:** F1-B · **Estado:** preparado; se aplica en la máquina del
desarrollador. **No borra datos de producción** (aquí solo hay datos de semilla, que se
recargan).

---

## 1. Objetivo

Pasar del bootstrap con `prisma db push` (sin historial) a **migraciones versionadas**
(`prisma migrate deploy`). Es la base profesional para evolucionar el esquema en F1+ sin
perder trazabilidad ni arriesgar datos.

---

## 2. Por qué y cómo

- F0 creó las tablas con `db push` (rápido, sin historial). A partir de ahora, cada cambio
  de esquema será una **migración** versionada en `prisma/migrations/` (revisable en Git).
- Como la base ya existe con datos de semilla (dev), el camino más limpio y determinista es
  **recrear la BD** desde la migración inicial y volver a sembrar. Los únicos datos son los
  del seed, que se regeneran.

---

## 3. Archivos entregados (F1-B)

| Archivo | Cambio | Motivo |
|---|---|---|
| `backend/Dockerfile` | `CMD` pasa de `prisma db push` a `prisma migrate deploy` | Aplicar migraciones al arrancar. |
| `backend/prisma/migrations/migration_lock.toml` | **nuevo** | Requerido por Prisma para el directorio de migraciones. |
| `backend/prisma/migrations/0_init/migration.sql` | **se genera en tu contenedor** (paso 1) | El SQL de creación del esquema inicial. |

> El `migration.sql` no se pudo generar fuera de tu entorno (el sandbox no puede descargar
> los motores de Prisma). Tu contenedor sí puede, y es la fuente correcta.

---

## 4. Procedimiento (paso a paso)

Con los contenedores **actualmente arriba** (imagen F1-A):

### Paso 1 — Generar la migración inicial desde el contenedor
```cmd
mkdir backend\prisma\migrations\0_init
docker compose exec -T api npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > backend\prisma\migrations\0_init\migration.sql
```
Esto vuelca el SQL de creación del esquema (todas las tablas) en el archivo. Verifica que
NO esté vacío:
```cmd
type backend\prisma\migrations\0_init\migration.sql | more
```
Debe contener varias sentencias `CREATE TABLE ...`.

### Paso 2 — Colocar los archivos entregados
- Reemplaza `backend\Dockerfile` con el que te entrego.
- Copia `migration_lock.toml` a `backend\prisma\migrations\`.

### Paso 3 — Recrear la BD desde migraciones y re-sembrar
```cmd
docker compose down -v
docker compose up -d --build
docker compose exec api npx prisma db seed
```
- `down -v` elimina el volumen de la BD (borra los datos de semilla; se recrean).
- Al arrancar, el contenedor ejecuta `prisma migrate deploy` → aplica `0_init` → crea el esquema.
- `db seed` recarga roles, admin, VLANs, jerarquía y activos demo.

### Paso 4 — Verificar
```cmd
docker compose exec api npx prisma migrate status
curl http://localhost:3000/api/v1/health
```
`migrate status` debe indicar que la migración `0_init` está **aplicada**; `health` = ok.

---

## 5. Resultado esperado

- `prisma/migrations/0_init/migration.sql` versionado (añádelo a Git).
- La BD se gobierna con migraciones; el contenedor usa `migrate deploy`.
- Base poblada de nuevo con los datos de Pisco.

---

## 6. Notas

- A partir de aquí, para cualquier cambio de esquema en F1+ se creará una nueva migración
  (en desarrollo: `prisma migrate dev --name <cambio>`), que `migrate deploy` aplicará en
  el arranque.
- Si `migrate diff` diera error, avísame y lo resolvemos antes de continuar.
