# =============================================================================
#  SGIT-CCTV - Respaldo de la base de datos de produccion (Railway)
#  Aceros Arequipa - Planta Pisco - Laminacion
#
#  POR QUE EXISTE ESTE SCRIPT
#  --------------------------
#  Ya se perdio informacion una vez. Railway NO respalda automaticamente en
#  el plan actual. Antes de CUALQUIER migracion que toque datos existentes,
#  este respaldo es obligatorio.
#
#  NO NECESITAS INSTALAR NADA
#  --------------------------
#  Usa la imagen oficial de PostgreSQL 16 via Docker (el mismo Docker que ya
#  levantas en local). Asi la version de pg_dump coincide con la del servidor
#  y no aparecen errores de "server version mismatch".
#
#  COMO OBTENER LA CADENA DE CONEXION
#  ----------------------------------
#    Railway -> servicio Postgres -> pestana Variables -> DATABASE_PUBLIC_URL
#    (Tiene que ser la PUBLIC. La interna, postgres.railway.internal, solo
#     funciona dentro de la red de Railway y desde tu PC no resuelve.)
#
#  USO
#  ---
#    powershell -ExecutionPolicy Bypass -File .\scripts\RESPALDO_BD.ps1
# =============================================================================

param(
    [string]$Url = $env:DATABASE_PUBLIC_URL,
    [string]$Destino = ""
)

$ErrorActionPreference = "Stop"

function Escribe($texto, $color = "Gray") { Write-Host $texto -ForegroundColor $color }

Escribe ""
Escribe "===============================================================" "Cyan"
Escribe " SGIT-CCTV - Respaldo de base de datos" "Cyan"
Escribe "===============================================================" "Cyan"
Escribe ""

# --- 1) Comprobar que Docker esta disponible -------------------------------
try {
    docker version --format '{{.Server.Version}}' | Out-Null
} catch {
    Escribe "[ERROR] Docker no responde." "Red"
    Escribe "        Abre Docker Desktop, espera a que diga 'Engine running' y reintenta." "Yellow"
    exit 1
}
Escribe "[OK] Docker disponible." "Green"

# --- 2) Cadena de conexion --------------------------------------------------
if ([string]::IsNullOrWhiteSpace($Url)) {
    Escribe ""
    Escribe "Pega la cadena DATABASE_PUBLIC_URL de Railway." "Yellow"
    Escribe "  (Railway > servicio Postgres > Variables > DATABASE_PUBLIC_URL)" "DarkGray"
    $Url = Read-Host "URL"
}

if ([string]::IsNullOrWhiteSpace($Url)) {
    Escribe "[ERROR] No se recibio ninguna cadena de conexion." "Red"
    exit 1
}

if ($Url -notmatch '^postgres(ql)?://') {
    Escribe "[ERROR] La cadena no parece valida. Debe empezar por postgresql://" "Red"
    exit 1
}

if ($Url -match 'railway\.internal') {
    Escribe "[ERROR] Esa es la URL INTERNA de Railway; solo funciona dentro de su red." "Red"
    Escribe "        Necesitas DATABASE_PUBLIC_URL (termina en .proxy.rlwy.net o similar)." "Yellow"
    exit 1
}

# --- 3) Carpeta y nombre de archivo ----------------------------------------
if ([string]::IsNullOrWhiteSpace($Destino)) {
    $Destino = Join-Path $HOME "Desktop\respaldos-sgit"
}
if (-not (Test-Path $Destino)) {
    New-Item -ItemType Directory -Path $Destino -Force | Out-Null
}

$marca   = Get-Date -Format "yyyy-MM-dd_HHmm"
$archivo = Join-Path $Destino "sgit-cctv_$marca.sql"

Escribe ""
Escribe "Destino: $archivo" "Gray"
Escribe "Descargando respaldo... (puede tardar segun el tamano de la base)" "Yellow"
Escribe ""

# --- 4) pg_dump via contenedor ---------------------------------------------
#  --no-owner / --no-privileges: el respaldo se puede restaurar en CUALQUIER
#  base (local, otra cuenta de Railway) sin depender del usuario original.
#  --clean --if-exists: al restaurar, borra y recrea cada objeto.
docker run --rm postgres:16-alpine `
    pg_dump "$Url" --no-owner --no-privileges --clean --if-exists `
    2>$null | Out-File -FilePath $archivo -Encoding utf8

if ($LASTEXITCODE -ne 0) {
    Escribe "[ERROR] pg_dump fallo. Revisa que la URL sea correcta y la base este activa." "Red"
    if (Test-Path $archivo) { Remove-Item $archivo -Force }
    exit 1
}

# --- 5) Verificar que el respaldo sirve de verdad ---------------------------
#  Un archivo creado no es un respaldo valido. Se comprueba contenido real:
#  si no hay sentencias CREATE TABLE, el respaldo no sirve para restaurar.
if (-not (Test-Path $archivo)) {
    Escribe "[ERROR] No se genero el archivo." "Red"
    exit 1
}

$info = Get-Item $archivo
$kb   = [math]::Round($info.Length / 1KB, 1)

$contenido = Get-Content $archivo -Raw
$tablas = ([regex]::Matches($contenido, 'CREATE TABLE')).Count

Escribe "---------------------------------------------------------------" "DarkGray"
if ($info.Length -lt 2KB -or $tablas -eq 0) {
    Escribe "[ALERTA] El respaldo parece VACIO ($kb KB, $tablas tablas)." "Red"
    Escribe "         NO apliques ninguna migracion todavia." "Red"
    exit 1
}

Escribe "[OK] Respaldo completo y verificado." "Green"
Escribe "     Archivo : $archivo" "Gray"
Escribe "     Tamano  : $kb KB" "Gray"
Escribe "     Tablas  : $tablas" "Gray"
Escribe ""

# --- 6) Rotacion: conservar los ultimos 10 ---------------------------------
$viejos = Get-ChildItem $Destino -Filter "sgit-cctv_*.sql" |
          Sort-Object LastWriteTime -Descending |
          Select-Object -Skip 10
if ($viejos) {
    $viejos | Remove-Item -Force
    Escribe "     (Se conservan los 10 respaldos mas recientes)" "DarkGray"
    Escribe ""
}

Escribe "===============================================================" "Cyan"
Escribe " COMO RESTAURAR (solo si algo sale mal)" "Cyan"
Escribe "===============================================================" "Cyan"
Escribe ""
Escribe " docker run --rm -i postgres:16-alpine psql `"<URL>`" < `"$archivo`"" "White"
Escribe ""
Escribe " El respaldo deja la base exactamente como estaba al generarlo." "DarkGray"
Escribe ""
