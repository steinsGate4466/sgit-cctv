# =============================================================================
#  SGIT-CCTV - Corregir el historial de migraciones de Railway (una sola vez)
#  Aceros Arequipa - Planta Pisco - Laminacion
#
#  QUE PROBLEMA RESUELVE
#  ---------------------
#  La carpeta de migraciones no tenia el paso inicial: se perdio al limpiar
#  el error P3015. Railway funciona porque su base YA estaba construida y le
#  marcamos los pasos como hechos, pero la "receta" no arrancaba desde cero.
#  Sin receta completa no hay recuperacion ante desastre.
#
#  Ya se regenero el paso inicial (00000000000000_init). Este script alinea
#  el historial de Railway con esa receta nueva.
#
#  QUE HACE EXACTAMENTE
#   1. Exige que exista un respaldo reciente (no continua sin el).
#   2. Muestra el historial actual y pide confirmacion escrita.
#   3. Borra SOLO la tabla de control _prisma_migrations.
#   4. Marca 00000000000000_init como aplicado (sin ejecutarlo).
#   5. Deja pendientes las migraciones de Laminacion, que Railway aplicara
#      en el proximo despliegue.
#
#  QUE **NO** HACE
#   - NO borra ninguna tabla de negocio.
#   - NO borra activos, incidencias, ordenes, usuarios ni fotos.
#   - _prisma_migrations es solo la lista de "pasos ya hechos", no tus datos.
#
#  USO
#    powershell -ExecutionPolicy Bypass -File .\scripts\CORREGIR_HISTORIAL_RAILWAY.ps1
# =============================================================================

param(
    [string]$Url = $env:DATABASE_PUBLIC_URL
)

$ErrorActionPreference = "Stop"
function Esc($t, $c = "Gray") { Write-Host $t -ForegroundColor $c }

$Repo = Split-Path $PSScriptRoot -Parent

Esc ""
Esc "===============================================================" "Cyan"
Esc " Corregir historial de migraciones - Railway" "Cyan"
Esc "===============================================================" "Cyan"
Esc ""

# --- 0) Docker -------------------------------------------------------------
try { docker version --format '{{.Server.Version}}' | Out-Null }
catch {
    Esc "[ERROR] Docker no responde. Abre Docker Desktop y reintenta." "Red"
    exit 1
}

# --- 1) Exigir respaldo reciente -------------------------------------------
$carpetaRespaldos = Join-Path $HOME "Desktop\respaldos-sgit"
$respaldo = $null
if (Test-Path $carpetaRespaldos) {
    $respaldo = Get-ChildItem $carpetaRespaldos -Filter "sgit-cctv_*.sql" |
                Sort-Object LastWriteTime -Descending | Select-Object -First 1
}

if (-not $respaldo) {
    Esc "[DETENIDO] No hay ningun respaldo en:" "Red"
    Esc "           $carpetaRespaldos" "Red"
    Esc ""
    Esc " Ejecuta primero:" "Yellow"
    Esc "   powershell -ExecutionPolicy Bypass -File $Repo\scripts\RESPALDO_BD.ps1" "White"
    exit 1
}

$horas = [math]::Round(((Get-Date) - $respaldo.LastWriteTime).TotalHours, 1)
if ($horas -gt 24) {
    Esc "[DETENIDO] El respaldo mas reciente tiene $horas horas de antiguedad." "Red"
    Esc "           Genera uno nuevo antes de continuar." "Yellow"
    exit 1
}

Esc "[OK] Respaldo encontrado: $($respaldo.Name) ($horas h)" "Green"

# --- 2) Cadena de conexion --------------------------------------------------
if ([string]::IsNullOrWhiteSpace($Url)) {
    Esc ""
    Esc "Pega la cadena DATABASE_PUBLIC_URL de Railway." "Yellow"
    $Url = Read-Host "URL"
}
if ($Url -notmatch '^postgres(ql)?://' -or $Url -match 'railway\.internal') {
    Esc "[ERROR] Necesitas la URL PUBLICA de Railway (DATABASE_PUBLIC_URL)." "Red"
    exit 1
}

# --- 3) Mostrar el historial actual ----------------------------------------
Esc ""
Esc "Historial de migraciones registrado hoy en Railway:" "Yellow"
Esc "---------------------------------------------------------------" "DarkGray"
docker run --rm postgres:16-alpine psql "$Url" -A -F' | ' -c `
  "SELECT migration_name, to_char(finished_at,'YYYY-MM-DD HH24:MI') FROM _prisma_migrations ORDER BY started_at;"
Esc "---------------------------------------------------------------" "DarkGray"
Esc ""
Esc " Esa lista se va a reemplazar por la receta nueva." "Yellow"
Esc " Tus datos (activos, incidencias, OM, usuarios) NO se tocan." "Green"
Esc ""

$conf = Read-Host "Escribe CONTINUAR para proceder"
if ($conf -ne "CONTINUAR") {
    Esc "Cancelado. No se modifico nada." "Yellow"
    exit 0
}

# --- 4) Limpiar la tabla de control ----------------------------------------
Esc ""
Esc "Limpiando la tabla de control..." "Yellow"
docker run --rm postgres:16-alpine psql "$Url" -v ON_ERROR_STOP=1 -c `
  "DELETE FROM _prisma_migrations;"
if ($LASTEXITCODE -ne 0) {
    Esc "[ERROR] No se pudo limpiar el historial. Nada mas fue modificado." "Red"
    exit 1
}
Esc "[OK] Historial limpio." "Green"

# --- 5) Marcar el paso inicial como aplicado -------------------------------
#  --applied NO ejecuta el SQL: solo lo registra. Es correcto porque las
#  tablas ya existen en Railway desde hace semanas.
Esc ""
Esc "Registrando el paso inicial como ya aplicado..." "Yellow"
Push-Location (Join-Path $Repo "backend")
$env:DATABASE_URL = $Url
& ".\node_modules\.bin\prisma.cmd" migrate resolve --applied 00000000000000_init
$codigo = $LASTEXITCODE
Pop-Location

if ($codigo -ne 0) {
    Esc "[ERROR] No se pudo registrar el paso inicial." "Red"
    Esc "        Restaura con el respaldo si hace falta:" "Yellow"
    Esc "        docker run --rm -i postgres:16-alpine psql `"<URL>`" < `"$($respaldo.FullName)`"" "White"
    exit 1
}

Esc ""
Esc "===============================================================" "Cyan"
Esc " LISTO" "Cyan"
Esc "===============================================================" "Cyan"
Esc ""
Esc " Historial alineado. Las migraciones de Laminacion quedaron" "Green"
Esc " PENDIENTES y Railway las aplicara en el proximo despliegue." "Green"
Esc ""
Esc " Para desplegar: haz push (o pulsa Redeploy en Railway)." "White"
Esc ""
Esc " Comprobacion posterior:" "DarkGray"
Esc "   cd $Repo\backend" "DarkGray"
Esc "   npx.cmd prisma migrate status" "DarkGray"
Esc ""
