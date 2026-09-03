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
    # Eliminar la regla en vez de crearla.
    [switch] $Quitar
)

$ErrorActionPreference = 'Stop'

$NOMBRE = 'Rastreo - frontend (5173)'
$PUERTO = 5173

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
    if ($Quitar) { $argumentos += '-Quitar' }
    Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $argumentos
    return
}

Write-Host ''

# ---------------------------------------------------------------------------
#  Quitar
# ---------------------------------------------------------------------------

if ($Quitar) {
    $existente = Get-NetFirewallRule -DisplayName $NOMBRE -ErrorAction SilentlyContinue
    if ($existente) {
        Remove-NetFirewallRule -DisplayName $NOMBRE
        Ok 'Regla eliminada. El puerto vuelve a estar cerrado.'
    } else {
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
