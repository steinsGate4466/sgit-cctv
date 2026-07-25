# Migraciones versionadas — procedimiento de baseline

Aceros Arequipa · Planta Pisco · SGIT-CCTV

## Por qué

Hasta ahora el esquema se aplicaba con `prisma db push`. Eso funciona, pero en cada
cambio pregunta cosas como *“There might be data loss”* y **no deja historial**: no se
puede saber qué cambió, ni revertir, ni reproducir el esquema en otro entorno.

Con **migraciones versionadas** cada cambio queda como un archivo SQL en el repositorio,
se aplica igual en local y en producción, y el despliegue es predecible.

> El `Dockerfile` **ya está preparado** para esto: su comando de arranque es
> `npx prisma migrate deploy && node dist/main.js`.

## Concepto clave: baseline

La base de datos de producción **ya tiene todas las tablas** (creadas con `db push`).
Por eso no se puede aplicar la primera migración: fallaría diciendo que ya existen.

La solución estándar de Prisma es el **baseline**: se genera la migración inicial a partir
del esquema actual y se **marca como “ya aplicada”** en producción, sin ejecutarla.
A partir de ahí, todos los cambios siguientes sí se aplican normalmente.

**No se toca ni se pierde ningún dato.**

---

## Paso 1 — Generar la migración inicial (en tu PC)

Ejecuta el script `GENERAR_BASELINE.ps1`, o manualmente:

```powershell
cd C:\Users\CRISTHIAN\Desktop\sgit-cctv\backend
mkdir prisma\migrations\00000000000000_baseline
npx prisma migrate diff --from-empty --to-schema-datamodel prisma\schema.prisma --script > prisma\migrations\00000000000000_baseline\migration.sql
```

Esto **no toca ninguna base de datos**: solo lee el esquema y escribe el SQL.

Verifica que el archivo `migration.sql` no esté vacío y súbelo:

```powershell
cd C:\Users\CRISTHIAN\Desktop\sgit-cctv
git add prisma backend/prisma
git commit -m "build(db): migracion baseline versionada"
git push
```

## Paso 2 — Marcar el baseline como aplicado en producción (una sola vez)

En **Railway → backend → Console** (con el servicio Online):

```
npx prisma@5.22.0 migrate resolve --applied 00000000000000_baseline
```

Debe responder que la migración quedó marcada como aplicada. **No ejecuta SQL**, solo
registra en la tabla `_prisma_migrations` que ese estado ya existe.

## Paso 3 — Cambiar el arranque a migraciones

En **Railway → backend → Settings → Deploy → Custom Start Command**:

```
npx prisma migrate deploy && node dist/main.js
```

Desde ahora, cada despliegue aplica las migraciones pendientes (si no hay, no hace nada)
y arranca. Ya no se usa `db push` en producción.

## Paso 4 — Cómo se trabaja de aquí en adelante

Cuando cambies `schema.prisma`:

```powershell
cd backend
npx prisma migrate dev --name descripcion_del_cambio   # crea la migración y la aplica en local
npx prisma generate
```

Luego `git push`: Railway aplica esa misma migración en producción automáticamente.

**Ya no se usa `prisma db push`.**

---

## Verificación

- En Railway, el log del despliegue debe mostrar `No pending migrations` o la lista aplicada.
- `GET /api/v1/health` sigue respondiendo `{"status":"ok","db":"up"}`.
- Los datos siguen intactos (el baseline no ejecuta SQL en producción).

## Si algo sale mal

El baseline no borra nada. Si el Paso 2 falla, se puede volver temporalmente al
Start Command anterior (`node dist/main.js`) mientras se revisa, sin afectar la data.
