<#
.SYNOPSIS
    Respalda la base de datos completa (Traccar + esquema app).

.DESCRIPTION
    Usa pg_dump DENTRO del contenedor de PostgreSQL, no una copia del volumen.
    Copiar el volumen en caliente produce respaldos corruptos: PostgreSQL puede
    estar a media escritura. pg_dump produce una instantánea consistente.

    El formato es "custom" (-Fc): ya viene comprimido, permite restaurar tablas
    sueltas y es el que espera pg_restore.

.EXAMPLE
    .\scripts\backup.ps1
    .\scripts\backup.ps1 -Destino D:\respaldos -Conservar 30
#>
[CmdletBinding()]
param(
    # Carpeta donde dejar el respaldo.
    [string] $Destino = (Join-Path $PSScriptRoot '..\backups'),

    # Cuántos respaldos conservar. Los más viejos se borran. 0 = no borrar.
    [int] $Conservar = 14,

    [string] $Contenedor = 'rastreo-postgres'
)

$ErrorActionPreference = 'Stop'

$raiz = Resolve-Path (Join-Path $PSScriptRoot '..')
$envFile = Join-Path $raiz '.env'
if (-not (Test-Path $envFile)) {
    throw "No se encontró $envFile. Copia .env.example a .env primero."
}

# Lectura simple del .env: clave=valor, ignorando comentarios y líneas vacías.
$config = @{}
foreach ($linea in Get-Content $envFile) {
    if ($linea -match '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$') {
        $config[$matches[1]] = $matches[2].Trim()
    }
}

$db   = $config['POSTGRES_DB']
$user = $config['POSTGRES_USER']
if (-not $db -or -not $user) {
    throw 'Faltan POSTGRES_DB o POSTGRES_USER en el .env'
}

# Comprobar que el contenedor está arriba antes de intentar nada.
$estado = docker inspect --format '{{.State.Running}}' $Contenedor 2>$null
if ($estado -ne 'true') {
    throw "El contenedor $Contenedor no está corriendo. Ejecuta: pnpm infra:up"
}

if (-not (Test-Path $Destino)) {
    New-Item -ItemType Directory -Force -Path $Destino | Out-Null
}
$Destino = (Resolve-Path $Destino).Path

# Fecha ordenable en el nombre, para que el listado alfabético sea cronológico.
$sello   = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$archivo = Join-Path $Destino "rastreo_${db}_$sello.dump"

Write-Host "Respaldando $db desde $Contenedor..." -ForegroundColor Cyan

# El dump se escribe DENTRO del contenedor y luego se copia con docker cp.
#
# El camino obvio -- canalizar la salida de pg_dump a un archivo -- NO funciona
# en Windows PowerShell: el pipeline convierte la salida del ejecutable a
# cadenas de texto antes de que llegue a Set-Content, y para entonces el binario
# ya viene corrupto ("No se puede continuar con la codificación de bytes").
# Pasando por docker cp, el archivo nunca atraviesa el shell.
$temporal = '/tmp/rastreo-backup.dump'

docker exec $Contenedor pg_dump -U $user -d $db -Fc --no-owner --no-acl -f $temporal
if ($LASTEXITCODE -ne 0) {
    docker exec $Contenedor rm -f $temporal 2>$null | Out-Null
    throw "pg_dump falló con código $LASTEXITCODE"
}

docker cp "${Contenedor}:${temporal}" $archivo | Out-Null
$codigoCopia = $LASTEXITCODE
docker exec $Contenedor rm -f $temporal 2>$null | Out-Null

if ($codigoCopia -ne 0) {
    if (Test-Path $archivo) { Remove-Item $archivo -Force }
    throw "docker cp falló con código $codigoCopia"
}

$info = Get-Item $archivo
if ($info.Length -lt 1024) {
    Remove-Item $archivo -Force
    throw 'El respaldo resultó sospechosamente pequeño; se descartó.'
}

$legible = if ($info.Length -lt 1MB) {
    "$([math]::Round($info.Length / 1KB)) KB"
} else {
    "$([math]::Round($info.Length / 1MB, 2)) MB"
}
Write-Host "OK  $($info.Name)  ($legible)" -ForegroundColor Green

# --- Rotación -------------------------------------------------------------
if ($Conservar -gt 0) {
    $viejos = Get-ChildItem -Path $Destino -Filter 'rastreo_*.dump' |
        Sort-Object LastWriteTime -Descending |
        Select-Object -Skip $Conservar
    foreach ($v in $viejos) {
        Remove-Item $v.FullName -Force
        Write-Host "  eliminado respaldo viejo: $($v.Name)" -ForegroundColor DarkGray
    }
}

Write-Host ''
Write-Host 'Para restaurarlo:' -ForegroundColor Yellow
Write-Host "  .\scripts\restore.ps1 -Archivo `"$archivo`""
