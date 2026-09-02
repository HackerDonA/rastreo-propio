<#
.SYNOPSIS
    Apaga todo lo que levantó iniciar.ps1.

.DESCRIPTION
    Cierra la API, el frontend y el simulador, y opcionalmente los
    contenedores.

    Por omisión los contenedores se QUEDAN corriendo. Traccar tarda casi un
    minuto en volver a estar sano, y en un día normal se reinicia el código
    muchas veces y la base de datos ninguna. Apagarla también sería castigar
    el caso común para atender el raro.

.EXAMPLE
    .\detener.ps1
    Cierra la aplicación. Traccar y PostgreSQL siguen arriba.

.EXAMPLE
    .\detener.ps1 -Todo
    Cierra también los contenedores.
#>
[CmdletBinding()]
param(
    # Apagar también Traccar y PostgreSQL.
    [switch] $Todo
)

$ErrorActionPreference = 'Stop'
$raiz = $PSScriptRoot
Set-Location $raiz

function Ok([string] $texto)   { Write-Host "  OK   $texto" -ForegroundColor Green }
function Info([string] $texto) { Write-Host "       $texto" -ForegroundColor DarkGray }

# Debe coincidir con los títulos que pone iniciar.ps1 al abrir sus ventanas.
$MARCA = 'rastreo - '

Write-Host ''

$cerrados = 0

<#
    Mata un proceso y TODOS sus descendientes.

    El árbol importa: la ventana del simulador es powershell -> pnpm -> node,
    y matar solo la ventana deja al node inyectando posiciones para siempre.
    Es exactamente el fallo que tenía la primera versión de este script: decía
    "detenido" y el simulador seguía escribiendo en la base de datos.

    taskkill /T se encarga del árbol; hacerlo a mano en PowerShell 5.1 obliga a
    recorrer ParentProcessId recursivamente, que es más código para lo mismo.
#>
function Matar-Arbol([int] $id) {
    $anterior = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    taskkill /PID $id /T /F 2>&1 | Out-Null
    $ErrorActionPreference = $anterior
}

# ---------------------------------------------------------------------------
#  1. Las ventanas que abrió iniciar.ps1
# ---------------------------------------------------------------------------
#
# Se buscan por su línea de comando y no por MainWindowTitle: el título se fija
# DENTRO de la ventana, y el proceso que la abrió reporta MainWindowTitle
# vacío. La línea de comando, en cambio, contiene literalmente el título que se
# le pasó, así que es un identificador fiable.

$ventanas = Get-CimInstance Win32_Process -Filter "Name='powershell.exe' OR Name='pwsh.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains($MARCA) }

foreach ($v in $ventanas) {
    Matar-Arbol $v.ProcessId
    $cerrados++
    if ($v.CommandLine -match 'simulador')  { Ok 'Simulador detenido' }
    else                                    { Ok 'API y frontend detenidos' }
}

# ---------------------------------------------------------------------------
#  2. Procesos node sueltos de ESTE proyecto
# ---------------------------------------------------------------------------
#
# Filtrar por la ruta del repositorio, y no por el nombre "node", es lo que
# evita apagar de paso cualquier otra cosa que estés corriendo en la máquina.

# El @(...) no es decorativo: en PowerShell 5.1 un pipeline que devuelve UN
# solo objeto no devuelve un arreglo, y .Count sale vacío en vez de 1.
$sueltos = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains($raiz) })

foreach ($p in $sueltos) {
    Matar-Arbol $p.ProcessId
    $cerrados++
}
if ($sueltos.Count -gt 0) { Ok "$($sueltos.Count) proceso(s) de Node cerrados" }

# ---------------------------------------------------------------------------
#  3. Red de seguridad: cualquier cosa que siga ocupando los puertos
# ---------------------------------------------------------------------------

foreach ($puerto in @(4000, 5173)) {
    $conexiones = Get-NetTCPConnection -LocalPort $puerto -State Listen -ErrorAction SilentlyContinue
    if ($conexiones) {
        foreach ($id in ($conexiones.OwningProcess | Select-Object -Unique)) {
            Matar-Arbol $id
            $cerrados++
        }
        Ok "Puerto $puerto liberado"
    }
}

if ($cerrados -eq 0) {
    Info 'No había nada corriendo.'
}

# ---------------------------------------------------------------------------
#  4. Comprobación: ¿de verdad quedó apagado?
# ---------------------------------------------------------------------------
#
# Sin esto el script solo informaría de lo que INTENTÓ hacer. Un "OK" que no
# corresponde con la realidad es peor que no decir nada.

Start-Sleep -Seconds 2
$restantes = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains($raiz) })

if ($restantes.Count -gt 0) {
    Write-Host "  !    Siguen vivos $($restantes.Count) proceso(s):" -ForegroundColor Yellow
    foreach ($r in $restantes) { Info "PID $($r.ProcessId)" }
    Info 'Ciérralos a mano con:  Stop-Process -Id <PID> -Force'
} else {
    Ok 'Comprobado: no queda ningún proceso del proyecto'
}

if ($Todo) {
    Write-Host ''
    Info 'Apagando contenedores...'
    pnpm infra:down
    if ($LASTEXITCODE -eq 0) { Ok 'Traccar y PostgreSQL apagados' }
} else {
    Write-Host ''
    Info 'Traccar y PostgreSQL siguen corriendo (a propósito).'
    Info 'Para apagarlos también:  .\detener.ps1 -Todo'
}

Write-Host ''
