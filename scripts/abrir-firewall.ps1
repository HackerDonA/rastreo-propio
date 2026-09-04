<#
.SYNOPSIS
    Permite que otros equipos de tu red (el celular, una tablet) abran la app.

.DESCRIPTION
    Windows bloquea por omisión las conexiones entrantes, así que aunque el
    servidor de Vite escuche en todas las interfaces, el celular no llega. Esto
    crea la regla que hace falta.

    Solo abre el puerto 5173, el del frontend. El 4000 de la API NO hace falta:
    el navegador del celular habla únicamente con Vite, y es Vite quien
    consulta a la API desde el propio servidor. Un puerto menos expuesto.

    La regla se limita al perfil PRIVADO, es decir, a redes marcadas como "red
    privada" en Windows. En una red pública -un café, un aeropuerto- sigue
    cerrado, que es lo que se quiere: esta aplicación no está pensada para
    exponerse fuera de casa sin HTTPS.

    Hay que ejecutarlo como administrador. Si no lo está, se relanza solo y
    Windows te pedirá confirmación.

.EXAMPLE
    .\scripts\abrir-firewall.ps1

.EXAMPLE
    .\scripts\abrir-firewall.ps1 -Quitar
    Elimina la regla y vuelve a dejar el puerto cerrado.
#>
[CmdletBinding()]
param(
    # Eliminar las reglas en vez de crearlas.
    [switch] $Quitar,

    # Abrir tambien los puertos de los RASTREADORES GPS (5001 y 5023).
    #
    # Va aparte del puerto del frontend a proposito: son cosas distintas. El
    # 5173 lo abre tu celular desde el sofa; el 5001 y el 5023 los abre un
    # equipo que esta en la calle, conectado por la red de Telcel, y para que
    # llegue hace falta ADEMAS reenviar esos puertos en el router.
    [switch] $Gps
)

$ErrorActionPreference = 'Stop'

$NOMBRE = 'Rastreo - frontend (5173)'
$PUERTO = 5173

# Puertos de protocolo de los rastreadores. Cada uno corresponde a un equipo
# concreto; no se abren "por si acaso" porque cada puerto abierto es superficie
# de ataque.
$NOMBRE_GPS = 'Rastreo - rastreadores GPS (5001, 5023)'
$PUERTOS_GPS = @(5001, 5023)

function Ok([string] $t)    { Write-Host "  OK   $t" -ForegroundColor Green }
function Info([string] $t)  { Write-Host "       $t" -ForegroundColor DarkGray }
function Aviso([string] $t) { Write-Host "  !    $t" -ForegroundColor Yellow }

# ---------------------------------------------------------------------------
#  Elevación
# ---------------------------------------------------------------------------
#
# Crear una regla de firewall exige privilegios de administrador. En vez de
# fallar con "Acceso denegado", el script se vuelve a lanzar elevado y Windows
# muestra su aviso, que es el único momento en que hace falta una persona.

$identidad = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identidad)
$esAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $esAdmin) {
    Write-Host ''
    Aviso 'Hace falta administrador. Acepta el aviso de Windows que va a salir.'
    $argumentos = @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass',
        '-File', "`"$PSCommandPath`""
    )
    # Hay que reenviar TODOS los conmutadores. Si se olvida uno, el script
    # elevado hace algo distinto de lo que se pidio y no avisa: se ejecuta
    # "correctamente" sin haber abierto lo que hacia falta.
    if ($Quitar) { $argumentos += '-Quitar' }
    if ($Gps)    { $argumentos += '-Gps' }
    Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $argumentos
    return
}

Write-Host ''

# ---------------------------------------------------------------------------
#  Quitar
# ---------------------------------------------------------------------------

if ($Quitar) {
    $algo = $false
    foreach ($n in @($NOMBRE, $NOMBRE_GPS)) {
        if (Get-NetFirewallRule -DisplayName $n -ErrorAction SilentlyContinue) {
            Remove-NetFirewallRule -DisplayName $n
            Ok "Regla eliminada: $n"
            $algo = $true
        }
    }
    if (-not $algo) {
        Info 'No había ninguna regla que quitar.'
    }
    Write-Host ''
    Read-Host '  Presiona Enter para cerrar' | Out-Null
    return
}

# ---------------------------------------------------------------------------
#  Crear
# ---------------------------------------------------------------------------

$existente = Get-NetFirewallRule -DisplayName $NOMBRE -ErrorAction SilentlyContinue
if ($existente) {
    Ok 'La regla ya existía.'
} else {
    New-NetFirewallRule -DisplayName $NOMBRE `
        -Description 'Permite abrir el panel de rastreo desde otros equipos de la red local.' `
        -Direction Inbound -Protocol TCP -LocalPort $PUERTO `
        -Action Allow -Profile Private | Out-Null
    Ok "Puerto $PUERTO abierto para la red local."
}

if ($Gps) {
    $existenteGps = Get-NetFirewallRule -DisplayName $NOMBRE_GPS -ErrorAction SilentlyContinue
    if ($existenteGps) {
        Ok 'La regla de los rastreadores ya existía.'
    } else {
        New-NetFirewallRule -DisplayName $NOMBRE_GPS `
            -Description 'Permite que los rastreadores GPS lleguen a Traccar desde internet.' `
            -Direction Inbound -Protocol TCP -LocalPort $PUERTOS_GPS `
            -Action Allow -Profile Any | Out-Null
        Ok "Puertos $($PUERTOS_GPS -join ' y ') abiertos para los rastreadores."
    }
    Write-Host ''
    Info 'ESTO SOLO ES LA MITAD. El rastreador está en la calle, no en tu red:'
    Info 'hay que reenviar además los puertos 5001 y 5023 en el router, hacia'
    Info 'la IP local de esta máquina. Ver docs/04-migrar-a-produccion.md.'
    Write-Host ''
    Info 'Perfil "Any" a propósito, y no "Private" como el del frontend: el'
    Info 'tráfico llega desde internet, y limitarlo a redes privadas lo'
    Info 'bloquearía en cuanto Windows reclasifique la red.'
}

# ---------------------------------------------------------------------------
#  La trampa: red clasificada como "pública"
# ---------------------------------------------------------------------------
#
# Una regla de perfil Private NO se aplica en una red que Windows considera
# pública, y no avisa de nada: la regla aparece creada y habilitada, y la
# conexión se sigue rechazando en silencio. Es el fallo más probable de todo
# este script, así que se comprueba explícitamente.
#
# Windows marca como pública toda red nueva salvo que se le diga lo contrario,
# de modo que un Wi-Fi de casa acaba ahí por omisión.

$publicas = @(Get-NetConnectionProfile | Where-Object { $_.NetworkCategory -eq 'Public' })

if ($publicas.Count -gt 0) {
    Write-Host ''
    Aviso 'Tu red está marcada como PÚBLICA, y la regla solo aplica en redes privadas.'
    Info  'Mientras siga así, el celular no va a poder conectarse.'
    Write-Host ''
    foreach ($p in $publicas) {
        Info "  - $($p.Name)  (interfaz: $($p.InterfaceAlias))"
    }
    Write-Host ''
    Info 'Marcarla como PRIVADA le dice a Windows "esta es mi red de casa, confío'
    Info 'en los equipos que hay en ella". Es lo correcto para tu Wi-Fi, y lo que'
    Info 'hace falta aquí. No lo hagas en la red de un café o un aeropuerto.'
    Write-Host ''

    $respuesta = Read-Host '  ¿Marcarlas como privadas? (s/n)'
    if ($respuesta -match '^[sSyY]') {
        foreach ($p in $publicas) {
            Set-NetConnectionProfile -InterfaceIndex $p.InterfaceIndex -NetworkCategory Private
            Ok "'$($p.Name)' ahora es una red privada."
        }
    } else {
        Aviso 'Sin ese cambio, el celular seguirá sin poder entrar.'
        Info  'Puedes hacerlo también en Configuración -> Red e Internet -> Wi-Fi'
        Info  '-> (tu red) -> Tipo de perfil de red -> Privada.'
    }
}

# ---------------------------------------------------------------------------
#  Decirle al usuario la URL que tiene que escribir
# ---------------------------------------------------------------------------
#
# Sin esto, el paso siguiente es "averigua tu IP con ipconfig y descifra cuál
# de las cinco que salen es la buena". Se filtran las interfaces virtuales de
# Docker, WSL y VirtualBox, que aparecen en ipconfig y no sirven para nada
# aquí.

$direcciones = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object {
        $_.IPAddress -notlike '127.*' -and
        $_.IPAddress -notlike '169.254.*' -and
        $_.InterfaceAlias -notmatch 'vEthernet|WSL|Loopback|VirtualBox'
    }

Write-Host ''
if ($direcciones) {
    Info 'Desde el celular, en la MISMA red Wi-Fi, abre:'
    Write-Host ''
    # Las que asigna el router (Dhcp) van primero: son las de la red de verdad.
    # Las manuales suelen ser adaptadores de VirtualBox o similares, que
    # aparecen aqui y no llevan a ninguna parte desde el celular.
    foreach ($d in ($direcciones | Sort-Object { $_.PrefixOrigin -ne 'Dhcp' })) {
        $probable = if ($d.PrefixOrigin -eq 'Dhcp') { '   <-- probablemente esta' } else { '' }
        Write-Host ("      http://{0}:{1}{2}" -f $d.IPAddress, $PUERTO, $probable) -ForegroundColor White
        Info "        (interfaz: $($d.InterfaceAlias))"
    }
    Write-Host ''
    $dhcp = $direcciones | Where-Object { $_.PrefixOrigin -eq 'Dhcp' }
    if ($dhcp) {
        Aviso 'Esa IP la asigna el router y PUEDE CAMBIAR al reiniciarlo.'
        Info  'Si un dia deja de funcionar, vuelve a ejecutar este script para'
        Info  'ver la nueva, o resérvala por MAC en la configuracion del router.'
    }
} else {
    Aviso 'No se encontró ninguna dirección de red utilizable.'
    Info  '¿Está la máquina conectada a la red?'
}

Write-Host ''
Info 'La app NO se podrá instalar como aplicación desde esta dirección:'
Info 'eso exige HTTPS. Funciona en el navegador, que es lo que se busca aquí.'
Write-Host ''
Read-Host '  Presiona Enter para cerrar' | Out-Null
