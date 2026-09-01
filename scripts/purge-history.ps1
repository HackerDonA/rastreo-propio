<#
.SYNOPSIS
    Borra posiciones antiguas del historial.

.DESCRIPTION
    Traccar 6.15 NO tiene retención automática: la clave `database.historyDays`
    fue eliminada. Este script es el sustituto, y viene APAGADO por omisión —
    hay que pasar -Confirmar para que borre algo.

    QUÉ PROTEGE, Y POR QUÉ IMPORTA
    ------------------------------
    `tc_devices.positionid` apunta a la última posición de cada unidad, pero
    Traccar NO define una clave foránea sobre esa columna. Es decir: borrar esa
    fila no produce ningún error de base de datos. Lo que produce es una
    referencia colgante, y entonces la unidad deja de aparecer en el mapa sin
    que nada lo explique.

    Por eso la consulta excluye explícitamente esas filas.

    ANTES DE USARLO
    ---------------
    Con 10 unidades reportando cada 15 segundos son ~1.7 millones de filas al
    mes y unos 6 a 8 GB al año. PostgreSQL aguanta eso sin despeinarse durante
    años. Borrar historial es irreversible; si no tienes un problema real de
    espacio, no lo tienes que correr.

.EXAMPLE
    .\scripts\purge-history.ps1 -Dias 365            # solo informa
    .\scripts\purge-history.ps1 -Dias 365 -Confirmar # borra de verdad
#>
[CmdletBinding()]
param(
    # Se conservan las posiciones de los últimos N días.
    [ValidateRange(7, 3650)]
    [int] $Dias = 365,

    # Sin esto el script solo informa de cuánto borraría.
    [switch] $Confirmar,

    [string] $Contenedor = 'rastreo-postgres'
)

$ErrorActionPreference = 'Stop'

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

if ((docker inspect --format '{{.State.Running}}' $Contenedor 2>$null) -ne 'true') {
    throw "El contenedor $Contenedor no está corriendo. Ejecuta: pnpm infra:up"
}

# La condición se define UNA vez y se usa tanto para contar como para borrar,
# para que lo que se informa sea exactamente lo que se borra.
$condicion = @"
fixtime < now() - interval '$Dias days'
  AND id NOT IN (SELECT positionid FROM tc_devices WHERE positionid IS NOT NULL)
"@

Write-Host ''
Write-Host "  Analizando posiciones anteriores a $Dias días..." -ForegroundColor Cyan

$resumen = docker exec $Contenedor psql -U $user -d $db -t -A -F '|' -c @"
SELECT
  (SELECT count(*) FROM tc_positions),
  (SELECT count(*) FROM tc_positions WHERE $condicion),
  pg_size_pretty(pg_total_relation_size('tc_positions'));
"@

$partes = $resumen.Trim().Split('|')
$total = [int64] $partes[0]
$aBorrar = [int64] $partes[1]
$tamano = $partes[2]

Write-Host ''
Write-Host "  Total de posiciones : $($total.ToString('N0'))"
Write-Host "  Tamaño en disco     : $tamano"
Write-Host "  Se borrarían        : $($aBorrar.ToString('N0'))" -ForegroundColor Yellow
Write-Host "  Quedarían           : $(($total - $aBorrar).ToString('N0'))"
Write-Host ''

if ($aBorrar -eq 0) {
    Write-Host '  No hay nada que borrar.' -ForegroundColor Green
    exit 0
}

if (-not $Confirmar) {
    Write-Host '  Modo informativo. No se borró nada.' -ForegroundColor Green
    Write-Host '  Para borrar de verdad, vuelve a ejecutarlo con -Confirmar' -ForegroundColor Yellow
    Write-Host ''
    Write-Host '  ANTES DE HACERLO: respalda.' -ForegroundColor Red
    Write-Host '    .\scripts\backup.ps1'
    exit 0
}

Write-Host '  ATENCIÓN: esto es IRREVERSIBLE.' -ForegroundColor Red
$respuesta = Read-Host "  Escribe BORRAR para continuar"
if ($respuesta -ne 'BORRAR') {
    Write-Host 'Cancelado.' -ForegroundColor Yellow
    exit 0
}

Write-Host '  Borrando...' -ForegroundColor Cyan

# Se borra por lotes y no de una sola sentencia: un DELETE de millones de filas
# mantiene una transacción abierta durante minutos, bloquea la tabla y hace que
# Traccar no pueda insertar posiciones nuevas mientras tanto.
$borradasTotal = 0
do {
    $borradas = docker exec $Contenedor psql -U $user -d $db -t -A -c @"
WITH lote AS (
  SELECT id FROM tc_positions WHERE $condicion LIMIT 50000
)
DELETE FROM tc_positions WHERE id IN (SELECT id FROM lote);
"@
    $n = 0
    if ($borradas -match 'DELETE (\d+)') { $n = [int] $matches[1] }
    $borradasTotal += $n
    if ($n -gt 0) { Write-Host "    $($borradasTotal.ToString('N0')) borradas..." -ForegroundColor DarkGray }
} while ($n -gt 0)

Write-Host ''
Write-Host "  Listo: $($borradasTotal.ToString('N0')) posiciones borradas." -ForegroundColor Green
Write-Host ''
# El espacio no vuelve al sistema operativo hasta que PostgreSQL reorganiza la
# tabla. VACUUM normal lo reutiliza internamente; VACUUM FULL lo devuelve, pero
# bloquea la tabla por completo mientras corre.
Write-Host '  Para que PostgreSQL reutilice el espacio:' -ForegroundColor Yellow
Write-Host "    docker exec $Contenedor psql -U $user -d $db -c 'VACUUM ANALYZE tc_positions;'"
Write-Host ''
Write-Host '  Para devolverlo al disco (bloquea la tabla, hazlo con calma):'
Write-Host "    docker exec $Contenedor psql -U $user -d $db -c 'VACUUM FULL tc_positions;'"
