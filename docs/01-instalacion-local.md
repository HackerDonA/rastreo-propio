# 01 · Instalación local en Windows 11

Guía para levantar el proyecto desde cero en **Windows 11 nativo**, con PowerShell.
No se usa WSL como entorno de trabajo: tu código, Node y pnpm corren en Windows.
Docker Desktop usa un motor de Linux por debajo, pero tú nunca lo abres — dentro
de contenedores solo van **Traccar y PostgreSQL**.

> **Por qué eso no te cuesta rendimiento.** El problema clásico de "Docker en
> Windows va lento" viene de montar el código fuente dentro del contenedor, donde
> cada lectura cruza el sistema de archivos compartido. Aquí no pasa: los
> contenedores solo tienen sus propios volúmenes de datos, y tu API y tu frontend
> corren nativos con recarga en caliente normal.

---

## Índice

1. [Requisitos](#1-requisitos)
2. [Clonar y configurar](#2-clonar-y-configurar)
3. [Levantar la infraestructura](#3-levantar-la-infraestructura)
4. [Crear el administrador y el token](#4-crear-el-administrador-y-el-token)
5. [Levantar la API y el frontend](#5-levantar-la-api-y-el-frontend)
6. [Arrancar el simulador](#6-arrancar-el-simulador)
7. [Cosas específicas de Windows 11](#7-cosas-específicas-de-windows-11)
8. [Comandos de uso diario](#8-comandos-de-uso-diario)

---

## 1. Requisitos

| Herramienta | Versión mínima | Verificar con |
|---|---|---|
| Git | 2.40 | `git --version` |
| Node.js | 22 LTS | `node --version` |
| pnpm | 10 | `pnpm --version` |
| Docker Desktop | 4.30 | `docker --version` |
| GitHub CLI *(opcional)* | 2.40 | `gh --version` |

### Instalación con winget

```powershell
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e
winget install --id GitHub.cli -e
winget install --id Docker.DockerDesktop -e
```

Docker Desktop necesita el subsistema de Linux como motor. Si el instalador no lo
pone solo, ejecútalo **en una PowerShell como administrador**:

```powershell
wsl --install --no-launch
```

> `--no-launch` instala el motor sin abrirte una distribución de Linux. No la vas
> a usar; es solo la máquina virtual donde corren los contenedores.

Cierra y vuelve a abrir PowerShell para que tome el PATH, y luego:

```powershell
npm install -g pnpm
```

**Verificación:**

```powershell
git --version; node --version; pnpm --version; docker --version
```

Los cuatro deben responder. Si `docker` o `pnpm` dicen *"no se reconoce como
nombre de un cmdlet"*, es que la terminal tiene el PATH viejo: ciérrala y abre
una nueva. Si sigue fallando, reinicia la PC.

### Arrancar el motor de Docker

Abre **Docker Desktop** una vez y espera a que el ícono de la ballena, abajo a la
izquierda, diga **Running** (verde). Hasta que no diga eso, ningún comando
`docker` va a funcionar.

```powershell
docker info --format 'Motor {{.ServerVersion}} sobre {{.OSType}}'
```

Debe responder algo como `Motor 29.7.2 sobre linux`. Ese `linux` es correcto y
esperado: es el motor de contenedores, no tu sistema.

---

## 2. Clonar y configurar

```powershell
git clone https://github.com/HackerDonA/rastreo-propio.git
cd rastreo-propio
pnpm install
```

Crea tu archivo de configuración a partir de la plantilla:

```powershell
Copy-Item .env.example .env
```

Genera una contraseña fuerte para PostgreSQL y pégala en `.env`:

```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

Abre `.env` y reemplaza el valor de `POSTGRES_PASSWORD`. Deja
`TRACCAR_API_TOKEN` como está por ahora — lo generas en el paso 4.

> **`.env` nunca se sube al repositorio.** Está en `.gitignore`. Compruébalo:
> ```powershell
> git check-ignore -v .env
> ```
> Debe responder `.gitignore:3:.env  .env`. Si no responde nada, **detente**: tu
> contraseña acabaría publicada en GitHub.

> ⚠️ **La contraseña solo se aplica la primera vez.** PostgreSQL usa
> `POSTGRES_PASSWORD` únicamente cuando inicializa un volumen vacío. Si la
> cambias después, el contenedor la ignora y Traccar dejará de conectar. Para
> cambiarla de verdad hay que hacer `ALTER USER` dentro de la base, o borrar el
> volumen — y con él, todo el historial.

---

## 3. Levantar la infraestructura

```powershell
pnpm infra:up
```

La primera vez descarga ~400 MB de imágenes. Verás una avalancha de líneas
`Pulling` / `Downloading` y al final:

```
 Container rastreo-postgres  Started
 Container rastreo-traccar   Started
```

**Traccar tarda entre 30 y 90 segundos más** en estar listo, porque Liquibase
crea las 49 tablas `tc_*`. Espéralo:

```powershell
pnpm infra:ps
```

Lo que quieres ver es **`(healthy)` en los dos**:

```
NAME               STATUS
rastreo-postgres   Up 7 minutes (healthy)
rastreo-traccar    Up 2 minutes (healthy)
```

Confirma que la API de Traccar responde:

```powershell
Invoke-RestMethod http://127.0.0.1:8082/api/server | Select-Object version, registration
```

```
version  registration
-------  ------------
6.15.3          False
```

### Si Traccar se queda en `Restarting`

Mira el log, que es donde siempre está la respuesta:

```powershell
pnpm infra:logs
```

| Lo que dice el log | Qué significa |
|---|---|
| `SAXParseException (... < Config:45 ...)` | `infra/traccar.xml` está mal formado. La causa más común: **dos guiones seguidos dentro de un comentario XML**, que XML prohíbe. Usa `=====` como separador, no `-----`. |
| `Connection refused` / `UnknownHostException: postgres` | PostgreSQL todavía no arranca. Normal los primeros segundos; si persiste, revisa `pnpm infra:ps`. |
| `password authentication failed for user "traccar"` | Cambiaste `POSTGRES_PASSWORD` después de inicializar el volumen. Ver el aviso del paso 2. |
| `Port XXXX disabled due to conflict` | Otro programa ocupa ese puerto. Ver la [sección 7.3](#73-un-puerto-aparece-ocupado). |

---

## 4. Crear el administrador y el token

La base arranca **sin ningún usuario**. Traccar tiene una regla especial para
esto: cuando la tabla de usuarios está vacía, **el primer usuario que se cree se
vuelve administrador automáticamente**, sin importar que el registro público esté
deshabilitado. Está en
[`UserResource.java:117`](https://github.com/traccar/traccar/blob/master/src/main/java/org/traccar/api/resource/UserResource.java#L117).

> Por eso `registration: False` en el paso anterior no es un problema — pero sí
> significa que **debes crear tu cuenta ahora**, antes de exponer nada. Si alguien
> más llega primero a un servidor con la tabla vacía, se queda con el control.

### 4.1 Crear la cuenta

Abre <http://localhost:8082> y usa la opción de registro de la pantalla de
acceso. O hazlo desde PowerShell, que es más directo:

```powershell
$body = @{
  name     = 'Luis Andrés'
  email    = 'tu-correo@ejemplo.com'
  password = 'LA-CONTRASEÑA-QUE-TU-ELIJAS'
} | ConvertTo-Json

Invoke-RestMethod -Uri 'http://127.0.0.1:8082/api/users' `
  -Method Post -ContentType 'application/json' -Body $body |
  Select-Object id, name, administrator
```

```
 id name         administrator
 -- ----         -------------
  1 Luis Andrés           True
```

`administrator: True` es lo que confirma que quedó como cuenta de administrador.

### 4.2 Generar el token de API

```powershell
$cred  = 'tu-correo@ejemplo.com:LA-CONTRASEÑA-QUE-TU-ELIJAS'
$basic = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($cred))

$token = Invoke-RestMethod -Uri 'http://127.0.0.1:8082/api/session/token' `
  -Method Post -Headers @{ Authorization = "Basic $basic" } `
  -ContentType 'application/x-www-form-urlencoded' -Body ''

$token
```

Sale una cadena de ~186 caracteres. También puedes generarlo desde la interfaz:
menú de usuario → **Cuenta** → **Token**.

Pégala en `.env`:

```
TRACCAR_API_TOKEN=RzBFAiEA...
```

### 4.3 Para qué usa el token nuestra API

El token **nunca llega al navegador**. Solo lo conoce el BFF, y lo usa de dos
formas distintas — esto no es un detalle cosmético, es una restricción real de
Traccar:

| Uso | Cómo |
|---|---|
| Llamadas REST | Encabezado `Authorization: Bearer <token>` |
| WebSocket `/api/socket` | **No acepta Bearer.** Hay que llamar primero a `GET /api/session?token=<token>`, quedarse con la cookie `JSESSIONID`, y abrir el WebSocket con esa cookie. |

La [documentación oficial](https://www.traccar.org/traccar-api/) lo dice textual:
*"Session cookie is the only authorization option for the WebSocket connection."*

Ver [`docs/adr/0002-bff-propio.md`](adr/0002-bff-propio.md).

---

## 5. Levantar la API y el frontend

```powershell
pnpm dev
```

Arranca las dos cosas en paralelo:

- API (Fastify) en <http://localhost:3000>
- Frontend (Vite) en <http://localhost:5173>

Comprueba la API:

```powershell
Invoke-RestMethod http://localhost:3000/health
```

```
status checks                                        wsClients uptimeSeconds
------ ------                                        --------- -------------
ok     @{postgres=ok; traccarSocket=conectado}               0            20
```

`traccarSocket: conectado` es la señal de que el relay de WebSocket abrió sesión
con Traccar correctamente. Si dice `desconectado`, revisa `TRACCAR_API_TOKEN`.

---

## 6. Arrancar el simulador

En **otra** ventana de PowerShell, dejando `pnpm dev` corriendo en la primera:

```powershell
pnpm simulate --units 10 --city cdmx
```

```
  Simulador de flota  ·  Ciudad de Mexico
  ----------------------------------------------------
  Unidades:        10
  Servidor:        http://127.0.0.1:5055  (protocolo OsmAnd)
  ...
  Dando de alta 10 unidad(es) en Traccar...
    + SIM001  Nissan NP300 · Reparto 1
    + SIM002  Ford Transit · Reparto 2
    ...
  [3:49:53 p.m.] tick    4  ·   10/10 en movimiento  ·   47 km/h promedio
```

Abre <http://localhost:5173> y verás las 10 unidades moviéndose.

Opciones:

| Bandera | Qué hace | Por omisión |
|---|---|---|
| `--units` | Cuántos vehículos simular (1–200) | 10 |
| `--city` | `cdmx`, `monterrey` o `guadalajara` | `cdmx` |
| `--interval` | Segundos entre reportes | 5 |
| `--speed-factor` | Acelera el tiempo simulado | 1 |

> **El simulador da de alta sus unidades por la API, no solas.** Traccar
> **rechaza** con `WARN: Unknown device` y HTTP 400 cualquier identificador que
> no conozca. Existe una opción para desactivar esa protección
> (`database.registerUnknown`), pero dejarla encendida significa que cualquiera
> que alcance tu puerto puede crear unidades en tu servidor. Por eso el
> simulador las registra explícitamente — que además es lo que harás con los
> rastreadores reales.

Para probar el puerto a mano, sin el simulador, primero **da de alta la unidad**
en Traccar (Configuración → Dispositivos → +) con el identificador `PRUEBA001`, y
luego:

```powershell
$ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
Invoke-RestMethod "http://localhost:5055/?id=PRUEBA001&lat=19.4326&lon=-99.1332&timestamp=$ts&speed=0&bearing=0"
```

Si responde HTTP 400, casi siempre es que esa unidad no existe en Traccar.

> **`speed` va en NUDOS, no en km/h.** Traccar guarda todas las velocidades en
> nudos; el decodificador de OsmAnd interpreta el parámetro así
> ([`OsmAndProtocolDecoder.java:152`](https://github.com/traccar/traccar/blob/master/src/main/java/org/traccar/protocol/OsmAndProtocolDecoder.java#L152)).
> Para convertir: **km/h ÷ 1.852 = nudos**. 60 km/h son 32.4 nudos.

Para probar el puerto a mano, sin el simulador:

```powershell
Invoke-RestMethod "http://localhost:5055/?id=PRUEBA001&lat=19.4326&lon=-99.1332&timestamp=$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())&speed=0&bearing=0"
```

> **`speed` va en NUDOS, no en km/h.** Traccar guarda todas las velocidades en
> nudos; el decodificador de OsmAnd interpreta el parámetro así
> ([`OsmAndProtocolDecoder.java:152`](https://github.com/traccar/traccar/blob/master/src/main/java/org/traccar/protocol/OsmAndProtocolDecoder.java#L152)).
> Para convertir: **km/h ÷ 1.852 = nudos**. 60 km/h son 32.4 nudos.

---

## 7. Cosas específicas de Windows 11

Esta sección es la que te va a ahorrar las tardes perdidas.

### 7.1 Abrir el firewall para probar con tu celular

Para usar la app **Traccar Client** desde tu teléfono en la misma WiFi, Windows
tiene que dejar entrar el puerto 5055. Por omisión lo bloquea **en silencio**: el
celular envía, nada llega, y parece que el servidor está roto.

En PowerShell **como administrador**:

```powershell
New-NetFirewallRule -DisplayName "Traccar OsmAnd 5055" `
  -Direction Inbound -Protocol TCP -LocalPort 5055 `
  -Action Allow -Profile Private
```

> `-Profile Private` limita la regla a redes marcadas como privadas (tu casa). No
> uses `Any`: eso abriría el puerto también en redes públicas, como la WiFi de
> una cafetería.

Verificar que quedó:

```powershell
Get-NetFirewallRule -DisplayName "Traccar OsmAnd 5055" |
  Select-Object DisplayName, Enabled, Direction, Action
```

Para quitarla cuando termines de probar:

```powershell
Remove-NetFirewallRule -DisplayName "Traccar OsmAnd 5055"
```

Si vas a probar también con otros protocolos, repite cambiando el puerto (5023
GT06, 5013 H02, 5001 GPS103, 5027 Teltonika).

### 7.2 La IP local de tu PC, y por qué el celular no puede usar `localhost`

```powershell
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
  Select-Object InterfaceAlias, IPAddress
```

```
InterfaceAlias  IPAddress
--------------  ---------
Wi-Fi           192.168.1.87
```

O el clásico `ipconfig`, buscando **"Dirección IPv4"** bajo tu adaptador.

En la app Traccar Client del celular configuras:

| Campo | Valor |
|---|---|
| Dirección del servidor | `http://192.168.1.87:5055` ← **tu** IP, no ésta |
| Identificador | el que quieras, ej. `CELULAR01` |
| Frecuencia | 30 s |

> **`localhost` significa "yo mismo".** En tu PC apunta a tu PC; en el celular
> apunta al celular. Por eso el teléfono necesita la IP de tu PC en la red local.

Dos advertencias:

- **La IP local cambia.** El router la asigna por DHCP y puede darte otra al
  reiniciar. Si un día el celular deja de reportar, vuelve a correr el comando de
  arriba. Para fijarla, reserva la IP por MAC en el panel del router.
- **Ambos deben estar en la misma red.** Si el celular está en datos móviles, o
  en una red de invitados con aislamiento de clientes, no va a llegar.

Prueba de fuego, desde el navegador **del celular**:

```
http://192.168.1.87:8082
```

Si carga la pantalla de Traccar, la red está bien y el problema estaría en otro
lado. Si no carga, es firewall o red.

### 7.3 Un puerto aparece ocupado

Windows y Hyper-V se reservan rangos de puertos para uso dinámico. Si uno de
nuestros puertos cae dentro, Docker no puede publicarlo y verás
`bind: An attempt was made to access a socket in a way forbidden by its access permissions`.

```powershell
netsh int ipv4 show excludedportrange protocol=tcp
```

```
Puerto de inicio    Puerto final
----------          --------
     50000       50059     *
     59551       59650
     ...
```

Comprueba de un golpe si alguno de nuestros puertos está afectado:

```powershell
$ports = 5001,5013,5023,5027,5055,8082,3000,5173,5432
$raw = netsh int ipv4 show excludedportrange protocol=tcp
$ranges = @()
foreach ($l in $raw) { if ($l -match '^\s*(\d+)\s+(\d+)\s*$') { $ranges += ,@([int]$matches[1], [int]$matches[2]) } }
foreach ($p in $ports) {
  $hit = $ranges | Where-Object { $p -ge $_[0] -and $p -le $_[1] }
  if ($hit) { "  $p -> RESERVADO ($($hit[0][0])-$($hit[0][1]))" } else { "  $p -> libre" }
}
```

Los puertos de este proyecto (5001, 5013, 5023, 5027, 5055) están **muy por
debajo** del rango dinámico habitual, así que normalmente salen todos `libre`.

Si el puerto no está reservado pero sigue ocupado, busca quién lo tiene:

```powershell
Get-NetTCPConnection -LocalPort 8082 -State Listen |
  Select-Object LocalPort, OwningProcess,
                @{n='Proceso';e={(Get-Process -Id $_.OwningProcess).ProcessName}}
```

Para cambiar de puerto, edita `.env` (no `docker-compose.yml`) y vuelve a
levantar:

```powershell
pnpm infra:down; pnpm infra:up
```

> ⚠️ Si cambias un puerto **de protocolo**, tienes que reconfigurar cada
> rastreador que ya apuntara al anterior. En equipos reales eso es un SMS por
> vehículo. Piénsalo antes.

### 7.4 Finales de línea (CRLF)

El repositorio trae un `.gitattributes` con `* text=auto eol=lf`, y los `.sh`
forzados a LF. Esto evita dos problemas concretos:

- Diffs enormes donde cambia el archivo entero aunque solo tocaras una línea.
- El error `bad interpreter: /bin/bash^M` cuando los scripts `.sh` lleguen a la
  Raspberry Pi.

No tienes que hacer nada: ya está configurado. Solo **no cambies**
`core.autocrlf` a `true` globalmente.

### 7.5 Docker Desktop se quedó colgado

En orden, de menos a más agresivo:

```powershell
# 1. Reiniciar solo nuestros contenedores
pnpm infra:down; pnpm infra:up

# 2. Reiniciar el motor de Docker (conserva imágenes y volúmenes)
Stop-Process -Name 'Docker Desktop' -Force -ErrorAction SilentlyContinue
Start-Process "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"

# 3. Reiniciar la máquina virtual del motor (conserva imágenes y volúmenes)
wsl --shutdown
Start-Process "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
```

Después de cualquiera de las tres, espera a que la ballena vuelva a decir
**Running** antes de correr `pnpm infra:up`.

> 🚨 **`docker compose down -v` borra los volúmenes**, y con ellos **todo tu
> historial de posiciones**. No es un comando de "limpiar por si acaso". Antes de
> ejecutarlo, haz un respaldo con `scripts/backup.ps1`.

### 7.6 Reinicio limpio (borrando todo)

Solo cuando quieras empezar de cero a propósito:

```powershell
pnpm infra:down
docker volume rm rastreo-propio_postgres-data rastreo-propio_traccar-logs rastreo-propio_traccar-media
pnpm infra:up
```

Esto te deja otra vez sin usuarios: hay que rehacer el paso 4.

---

## 8. Comandos de uso diario

| Qué quiero | Comando |
|---|---|
| Levantar todo | `pnpm infra:up` |
| Ver si está sano | `pnpm infra:ps` |
| Ver el log de Traccar en vivo | `pnpm infra:logs` |
| API + frontend | `pnpm dev` |
| Simular 10 vehículos | `pnpm simulate --units 10 --city cdmx` |
| Apagar (conservando datos) | `pnpm infra:down` |
| Respaldar la base | `.\scripts\backup.ps1` |
| Ver los puertos publicados | `docker compose -f infra/docker-compose.yml ps` |
| Entrar a la base con psql | `docker exec -it rastreo-postgres psql -U traccar -d traccar` |

---

## Siguiente paso

Cuando ya veas la flota simulada moviéndose, sigue con
[`02-conectar-mis-gps.md`](02-conectar-mis-gps.md) para conectar tus rastreadores
reales.
