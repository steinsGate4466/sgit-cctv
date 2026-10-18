# Restaurar un respaldo de la base — procedimiento probado (bloque 174)

> Hasta el bloque 173 la restauración **nunca se había probado**. Un respaldo
> que nunca se restauró es un archivo que esperamos que sirva. Ahora se prueba
> **cada noche** en GitHub Actions y este documento dice cómo hacerlo a mano.

## Qué se prueba solo, cada noche

`.github/workflows/respaldo.yml`, después de sacar el respaldo:

1. Levanta un PostgreSQL de usar y tirar **de la misma versión que Railway**.
2. Restaura el `.sql` con `ON_ERROR_STOP` (un solo error = falla).
3. Compara la restaurada con la original (`backend/scripts/probar-restauracion.js --en-vivo`):
   mismas tablas, mismas migraciones, ninguna tabla vacía que en la original
   tenga filas, y roles/permisos/usuarios/ubicaciones exactos.
4. Si algo no cuadra, el trabajo sale en **rojo** y llega el correo de GitHub.
   El respaldo se guarda igual (Actions › la ejecución › Artifacts, 30 días).

Probado también a mano (bloque 174): volcado → restauración en una base nueva →
comparación tabla a tabla (87 tablas, todo cuadra) → **la aplicación arrancó
contra la base restaurada**, entró el admin y listó los activos. Y la
comparación **detecta** una pérdida: se borraron 3 filas de la restaurada y
salió en rojo diciendo qué tabla.

## Restaurar de verdad (el día que haga falta)

> ⚠ Restaurar **pisa** la base de destino. Primero se prueba en una base
> NUEVA; sólo cuando cuadra se apunta la aplicación a ella.

1. **Bajar el respaldo**: GitHub › Actions › «Respaldo diario» › la ejecución
   del día que se quiere › Artifacts › `respaldo-bd` (es un `.zip` con el `.sql`).
2. **Crear una base nueva** en Railway (Postgres › New) o en local, vacía.
3. **Restaurar** (PowerShell, con la cadena de la base NUEVA, nunca la de producción):

   ```powershell
   psql "postgresql://USUARIO:CLAVE@HOST:PUERTO/BASE" -v ON_ERROR_STOP=1 -f "C:\Users\CRISTHIAN\Downloads\sgit-cctv_AAAA-MM-DD_HHMM.sql"
   ```

   Si no tienes `psql`, con Docker Desktop:

   ```powershell
   Get-Content "C:\Users\CRISTHIAN\Downloads\sgit-cctv_AAAA-MM-DD_HHMM.sql" | docker run -i --rm postgres:18-alpine psql "postgresql://USUARIO:CLAVE@HOST:PUERTO/BASE" -v ON_ERROR_STOP=1
   ```

4. **Comparar** con la original (si todavía existe):

   ```powershell
   cd C:\Users\CRISTHIAN\Desktop\sgit-cctv\backend
   node scripts\probar-restauracion.js "URL_ORIGINAL" "URL_RESTAURADA" --en-vivo
   ```

5. **Apuntar el backend** a la base restaurada (variable `DATABASE_URL` en
   Railway) y redesplegar. Al arrancar, el registro tiene que decir
   «Autochequeo: la base coincide con lo que el código espera».

Las cadenas de conexión **nunca** van al chat ni a una captura.
