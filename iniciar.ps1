<#
.SYNOPSIS
    Levanta todo el entorno de desarrollo con un solo comando.

.DESCRIPTION
    Este script es la puerta de entrada al proyecto. Hace, en orden:

      1. Comprueba que Docker Desktop esté corriendo (y lo abre si no lo está).
      2. Levanta Traccar y PostgreSQL, y espera a que estén SANOS de verdad.
      3. Instala dependencias si faltan.
      4. Arranca la API y el frontend en su propia ventana.
      5. Espera a que la API responda antes de seguir.
      6. Arranca el simulador de flota en otra ventana.
      7. Abre el navegador.

    Cada paso espera al anterior, y esa es la razón de que exista el script.
    Arrancar la API antes de que PostgreSQL acepte conexiones produce un error
    de arranque que parece un fallo del código y no lo es.

.EXAMPLE
    .\iniciar.ps1
    Levanta todo con 10 vehículos simulados en Ciudad de México.

.EXAMPLE
    .\iniciar.ps1 -SinSimulador
    Levanta todo sin vehículos de mentira. Para cuando ya haya GPS reales.

.EXAMPLE
    .\iniciar.ps1 -CambiarContrasena
    Pide una contraseña nueva, la deja escrita en el .env, y levanta todo.

.EXAMPLE
    .\iniciar.ps1 -Unidades 3 -Ciudad monterrey
#>
[CmdletBinding()]
param(
    # No arrancar el simulador de vehículos.
    [switch] $SinSimulador,

    # Cuántos vehículos simular.
    [int] $Unidades = 10,

    # Ciudad de las rutas simuladas: cdmx, monterrey o guadalajara.
    [string] $Ciudad = 'cdmx',

    # Pedir una contraseña nueva antes de arrancar.
    [switch] $CambiarContrasena,

    # No abrir el navegador al final.
    [switch] $NoAbrirNavegador
)

$ErrorActionPreference = 'Stop'
$raiz = $PSScriptRoot
Set-Location $raiz

# ---------------------------------------------------------------------------
#  Presentación
# ---------------------------------------------------------------------------

$paso = 0
function Paso([string] $texto) {
    $script:paso++
    Write-Host ''
    Write-Host ("  [{0}] {1}" -f $script:paso, $texto) -ForegroundColor Cyan
}
function Ok([string] $texto)    { Write-Host "      OK   $texto" -ForegroundColor Green }
function Info([string] $texto)  { Write-Host "           $texto" -ForegroundColor DarkGray }
function Aviso([string] $texto) { Write-Host "      !    $texto" -ForegroundColor Yellow }
function Fallo([string] $texto) { Write-Host "      X    $texto" -ForegroundColor Red }

Write-Host ''
Write-Host '  ==========================================' -ForegroundColor DarkGray
Write-Host '   RASTREO PROPIO - entorno de desarrollo'   -ForegroundColor White
Write-Host '  ==========================================' -ForegroundColor DarkGray

# ---------------------------------------------------------------------------
#  Utilidades
# ---------------------------------------------------------------------------

# Lee un valor del .env. Se hace a mano en vez de con un módulo: son cuatro
# líneas, y evita pedirte que instales algo solo para arrancar el proyecto.
function Leer-Env([string] $clave, [string] $porOmision) {
    $archivo = Join-Path $raiz '.env'
    if (-not (Test-Path $archivo)) { return $porOmision }
    $patron = '^\s*' + [regex]::Escape($clave) + '\s*=\s*(.*)$'
    foreach ($linea in (Get-Content $archivo)) {
        if ($linea -match $patron) {
            $valor = $Matches[1].Trim()
            if ($valor -ne '') { return $valor }
        }
    }
    return $porOmision
}

# Espera a que una URL conteste 200. Devuelve $true si lo logró.
function Esperar-Url([string] $url, [int] $segundos) {
    $limite = (Get-Date).AddSeconds($segundos)
    while ((Get-Date) -lt $limite) {
        try {
            $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
            if ($r.StatusCode -eq 200) { return $true }
        } catch {
            # Todavía no levanta. Es lo esperado los primeros segundos.
        }
        Start-Sleep -Seconds 2
    }
    return $false
}

# ¿Responde el demonio de Docker?
#
# Se comprueba por $LASTEXITCODE y no por $?, porque en Windows PowerShell 5.1
# redirigir la salida de error de un programa nativo hace que $? sea $false
# aunque el programa haya terminado bien. El código de salida sí es fiable.
#
# La redirección existe para que el "failed to connect to the docker API..."
# no aparezca en pantalla: es ruido, y justo debajo se imprime un mensaje que
# dice lo mismo en español y además explica qué se va a hacer al respecto.
function Docker-Vivo() {
    $anterior = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    docker info --format '{{.ServerVersion}}' 2>&1 | Out-Null
    $vivo = ($LASTEXITCODE -eq 0)
    $ErrorActionPreference = $anterior
    return $vivo
}

# Abre un comando en su propia ventana, para que sus logs no se mezclen con
# los de los demás. Con tres procesos a la vez, un solo flujo es ilegible.
function Abrir-Ventana([string] $titulo, [string] $comando) {
    $guion = "`$Host.UI.RawUI.WindowTitle = '$titulo'; Set-Location '$raiz'; $comando"
    Start-Process -FilePath 'powershell.exe' `
        -ArgumentList '-NoExit', '-NoProfile', '-Command', $guion | Out-Null
}

# ---------------------------------------------------------------------------
#  1. Docker
# ---------------------------------------------------------------------------

Paso 'Docker Desktop'

$dockerVivo = Docker-Vivo

if (-not $dockerVivo) {
    Aviso 'Docker no responde. Intentando abrirlo...'
    $exe = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
    if (Test-Path $exe) {
        Start-Process -FilePath $exe | Out-Null
        Info 'Docker Desktop tarda entre 30 y 90 segundos en arrancar.'
        $limite = (Get-Date).AddSeconds(180)
        while ((Get-Date) -lt $limite) {
            Start-Sleep -Seconds 5
            if (Docker-Vivo) { $dockerVivo = $true; break }
        }
    } else {
        Info "No se encontró Docker Desktop en $exe"
    }
}

if (-not $dockerVivo) {
    Fallo 'Docker Desktop no arrancó.'
    Info 'Ábrelo a mano, espera a que la ballena diga "Running", y vuelve a'
    Info 'ejecutar este script.'
    exit 1
}
Ok 'Docker respondiendo'

# ---------------------------------------------------------------------------
#  2. Configuración
# ---------------------------------------------------------------------------

Paso 'Archivo .env'

if (-not (Test-Path (Join-Path $raiz '.env'))) {
    Fallo 'No existe el archivo .env'
    Info 'Creando uno a partir de .env.example...'
    Copy-Item (Join-Path $raiz '.env.example') (Join-Path $raiz '.env')
    Aviso 'Revísalo: necesita al menos TRACCAR_API_TOKEN.'
    Info 'Lo generas en http://localhost:8082 -> Cuenta -> Token.'
    exit 1
}
Ok '.env encontrado'

if ($CambiarContrasena) {
    Write-Host ''
    Info 'Escribe la contraseña con la que quieres entrar a la aplicación.'
    Info 'Mínimo 12 caracteres. Una frase de cuatro palabras funciona bien.'
    Write-Host ''
    # -AsSecureString: no se ve al teclearla y no queda en el historial.
    $segura = Read-Host '      Contraseña nueva' -AsSecureString
    $plana = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura))

    if ($plana.Length -lt 12) {
        Fallo 'Muy corta: hacen falta al menos 12 caracteres.'
        exit 1
    }

    # hash-password imprime las dos líneas listas para el .env. Se capturan y
    # se sustituyen en su sitio, en vez de pedirte que copies y pegues.
    $salida = & pnpm --silent hash-password $plana
    $lineaHash = $salida | Select-String -Pattern '^AUTH_PASSWORD_HASH='
    $lineaSecreto = $salida | Select-String -Pattern '^AUTH_COOKIE_SECRET='

    if (-not $lineaHash) {
        Fallo 'No se pudo generar el hash.'
        exit 1
    }
    $hash = $lineaHash.ToString()
    $secreto = $lineaSecreto.ToString()

    $lineas = Get-Content (Join-Path $raiz '.env') | ForEach-Object {
        if ($_ -match '^AUTH_PASSWORD_HASH=')     { $hash }
        elseif ($_ -match '^AUTH_COOKIE_SECRET=') { $secreto }
        else                                      { $_ }
    }
    Set-Content -Path (Join-Path $raiz '.env') -Value $lineas -Encoding utf8
    Ok 'Contraseña guardada en el .env'
    Aviso 'Cambiarla cierra todas las sesiones abiertas. Es lo esperado.'
}

$hashActual = Leer-Env 'AUTH_PASSWORD_HASH' ''
if ($hashActual -eq '') {
    Aviso 'La API no tiene contraseña. Solo escucha en 127.0.0.1, así que para'
    Info  'desarrollar es aceptable. Ponle una con:'
    Info  '    .\iniciar.ps1 -CambiarContrasena'
} else {
    Ok 'Acceso con contraseña activo'
}

# ---------------------------------------------------------------------------
#  3. Dependencias
# ---------------------------------------------------------------------------

Paso 'Dependencias'

if (-not (Test-Path (Join-Path $raiz 'node_modules'))) {
    Info 'Primera vez: instalando. Esto tarda un par de minutos.'
    pnpm install
    if ($LASTEXITCODE -ne 0) { Fallo 'pnpm install falló.'; exit 1 }
}
Ok 'Dependencias listas'

# ---------------------------------------------------------------------------
#  4. Contenedores
# ---------------------------------------------------------------------------

Paso 'Traccar y PostgreSQL'

pnpm infra:up
if ($LASTEXITCODE -ne 0) { Fallo 'docker compose up falló.'; exit 1 }

Info 'Esperando a que los contenedores estén sanos...'

# "Up" no basta: PostgreSQL acepta el arranque bastante antes de aceptar
# conexiones, y Traccar tarda todavía más en migrar su esquema. El healthcheck
# del compose es lo único que de verdad dice que están listos.
$limite = (Get-Date).AddSeconds(180)
$sanos = $false
while ((Get-Date) -lt $limite) {
    $estados = docker inspect --format '{{.State.Health.Status}}' rastreo-postgres rastreo-traccar
    if ($LASTEXITCODE -eq 0) {
        $malos = @($estados | Where-Object { $_ -ne 'healthy' })
        if ($malos.Count -eq 0) { $sanos = $true; break }
    }
    Start-Sleep -Seconds 3
}

if (-not $sanos) {
    Fallo 'Los contenedores no llegaron a estar sanos.'
    Info 'Mira qué pasó con:  pnpm infra:logs'
    exit 1
}
Ok 'PostgreSQL y Traccar sanos'

# ---------------------------------------------------------------------------
#  5. API y frontend
# ---------------------------------------------------------------------------

Paso 'API y frontend'

$puertoApi = Leer-Env 'API_PORT' '4000'
$urlSalud = "http://127.0.0.1:$puertoApi/health"

# Si ya estaban corriendo no se abre una segunda ventana: dos procesos
# peleando por el mismo puerto solo producen un EADDRINUSE desconcertante.
if (Esperar-Url $urlSalud 1) {
    Ok 'Ya estaban corriendo'
} else {
    Abrir-Ventana 'rastreo - API + frontend' 'pnpm dev'
    Info 'Arrancando en otra ventana...'
    if (-not (Esperar-Url $urlSalud 90)) {
        Fallo "La API no respondió en $urlSalud"
        Info 'Revisa la ventana "rastreo - API + frontend" para ver el error.'
        exit 1
    }
    Ok "API respondiendo en el puerto $puertoApi"
}

# ---------------------------------------------------------------------------
#  6. Simulador
# ---------------------------------------------------------------------------

if (-not $SinSimulador) {
    Paso 'Simulador de flota'
    Abrir-Ventana 'rastreo - simulador' "pnpm simulate --units $Unidades --city $Ciudad"
    Ok "$Unidades vehículos simulados en $Ciudad"
    Info 'Sin GPS reales conectados, el mapa estaría vacío sin esto.'
}

# ---------------------------------------------------------------------------
#  7. Navegador
# ---------------------------------------------------------------------------

$urlWeb = 'http://localhost:5173'
Paso 'Listo'

if (-not $NoAbrirNavegador) {
    # El frontend tarda un poco más que la API en compilar la primera vez.
    Start-Sleep -Seconds 3
    Start-Process $urlWeb | Out-Null
}

Write-Host ''
Write-Host '  ------------------------------------------' -ForegroundColor DarkGray
Write-Host "   Aplicación   $urlWeb"                        -ForegroundColor White
Write-Host "   API          http://localhost:$puertoApi/health" -ForegroundColor DarkGray
Write-Host '   Traccar      http://localhost:8082'          -ForegroundColor DarkGray
Write-Host '  ------------------------------------------' -ForegroundColor DarkGray
Write-Host ''
Write-Host '   Se abrieron ventanas aparte para la API y el simulador.'  -ForegroundColor DarkGray
Write-Host '   Para apagar todo:  .\detener.ps1'                         -ForegroundColor DarkGray
Write-Host ''
