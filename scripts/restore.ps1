<#
.SYNOPSIS
    Restaura un respaldo de la base de datos.

.DESCRIPTION
    OPERACIÓN DESTRUCTIVA. Sobrescribe los datos actuales, incluido todo el
    historial de posiciones. Pide confirmación escrita salvo que se pase -Force.

    Traccar debe estar DETENIDO durante la restauración: si sigue escribiendo
    posiciones mientras se restaura, el resultado queda inconsistente.

.EXAMPLE
    .\scripts\restore.ps1 -Archivo .\backups\rastreo_traccar_2026-08-31_143000.dump
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $Archivo,

    # Omite la confirmación. Para scripts desatendidos, no para uso manual.
    [switch] $Force,

    [string] $Contenedor = 'rastreo-postgres'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $Archivo)) { throw "No existe el archivo: $Archivo" }
$Archivo = (Resolve-Path $Archivo).Path

$raiz = Resolve-Path (Join-Path $PSScriptRoot '..')
$envFile = Join-Path $raiz '.env'
if (-not (Test-Path $envFile)) { throw "No se encontró $envFile" }

$config = @{}
foreach ($linea in Get-Content $envFile) {
    if ($linea -match '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$') {
        $config[$matches[1]] = $matches[2].Trim()
    }
}
$db   = $config['POSTGRES_DB']
$user = $config['POSTGRES_USER']
if (-not $db -or -not $user) { throw 'Faltan POSTGRES_DB o POSTGRES_USER en el .env' }

$estado = docker inspect --format '{{.State.Running}}' $Contenedor 2>$null
if ($estado -ne 'true') { throw "El contenedor $Contenedor no está corriendo." }

$info = Get-Item $Archivo
$legible = if ($info.Length -lt 1MB) {
    "$([math]::Round($info.Length / 1KB)) KB"
} else {
    "$([math]::Round($info.Length / 1MB, 2)) MB"
}

Write-Host ''
Write-Host '  ATENCIÓN: esto SOBRESCRIBE la base de datos actual.' -ForegroundColor Red
Write-Host '  Se perderá todo el historial de posiciones posterior al respaldo.' -ForegroundColor Red
Write-Host ''
Write-Host "  Archivo : $($info.Name)  ($legible)"
Write-Host "  Fecha   : $($info.LastWriteTime)"
Write-Host "  Destino : base '$db' en el contenedor '$Contenedor'"
Write-Host ''

if (-not $Force) {
    $respuesta = Read-Host "  Escribe RESTAURAR para continuar"
    if ($respuesta -ne 'RESTAURAR') {
        Write-Host 'Cancelado.' -ForegroundColor Yellow
        exit 0
    }
}

# Traccar tiene que dejar de escribir. Se detiene solo ese contenedor; el de
# PostgreSQL debe seguir arriba, porque es donde corre pg_restore.
$traccarArriba = (docker inspect --format '{{.State.Running}}' 'rastreo-traccar' 2>$null) -eq 'true'
if ($traccarArriba) {
    Write-Host 'Deteniendo Traccar para que no escriba durante la restauración...' -ForegroundColor Cyan
    docker stop rastreo-traccar | Out-Null
}

try {
    Write-Host 'Restaurando...' -ForegroundColor Cyan

    # El archivo se copia AL contenedor y se restaura desde ahí, igual que en
    # backup.ps1 y por el mismo motivo: canalizar un binario por el pipeline de
    # PowerShell lo corrompe.
    $temporal = '/tmp/rastreo-restore.dump'
    docker cp $Archivo "${Contenedor}:${temporal}" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "docker cp falló al subir el respaldo" }

    # --clean --if-exists borra los objetos antes de recrearlos. Sin eso, la
    # restauración falla en cada tabla que ya existe.
    docker exec $Contenedor pg_restore -U $user -d $db --clean --if-exists --no-owner --no-acl $temporal
    $codigoRestore = $LASTEXITCODE
    docker exec $Contenedor rm -f $temporal 2>$null | Out-Null

    # pg_restore devuelve distinto de cero por avisos que no son errores reales
    # (por ejemplo, intentar borrar algo que no existía). Se informa, no se falla.
    if ($codigoRestore -ne 0) {
        Write-Host "pg_restore terminó con código $codigoRestore (suele ser por avisos)." -ForegroundColor Yellow
    }

    Write-Host 'Restauración terminada.' -ForegroundColor Green
}
finally {
    if ($traccarArriba) {
        Write-Host 'Volviendo a levantar Traccar...' -ForegroundColor Cyan
        docker start rastreo-traccar | Out-Null
    }
}

Write-Host ''
Write-Host 'Comprueba que todo está en su sitio:' -ForegroundColor Yellow
Write-Host '  pnpm infra:ps'
Write-Host '  Invoke-RestMethod http://localhost:3000/api/units'
