# Prompt final para Claude Code

## Antes de pegarlo: prepara la máquina (15 minutos, una sola vez)

Estos pasos los haces **tú**, no Claude Code. Todo es **Windows nativo**: PowerShell, sin abrir ninguna terminal de Linux.

> **Nota sobre Docker Desktop.** Docker Desktop instala por debajo una máquina virtual ligera de Linux para correr los contenedores — es la única forma en que existen los contenedores en Windows. **Tú nunca la abres ni la usas.** Es una casilla que marcas en el instalador y se acabó. Tú trabajas en PowerShell, con Node de Windows, con tus archivos en `C:\`.
>
> Y en este proyecto eso no te cuesta rendimiento: dentro de Docker solo corren **Traccar y PostgreSQL**, que usan volúmenes propios. Tu código de la API y del frontend corre **nativo en Windows**, con recarga en caliente normal. El problema clásico de "Docker en Windows va lento" viene de montar el código dentro del contenedor, y aquí no pasa.

Abre **PowerShell** (no hace falta como administrador, salvo donde se indique).

### 1. Herramientas base

```powershell
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e
winget install --id GitHub.cli -e
winget install --id Docker.DockerDesktop -e
```

Cierra y vuelve a abrir PowerShell para que tome el PATH. Luego:

```powershell
npm install -g pnpm
```

Verifica que todo responda:

```powershell
git --version; node --version; pnpm --version; gh --version; docker --version
```

### 2. Docker Desktop

Ábrelo una vez y deja que termine de configurarse. Si te pide instalar el componente de WSL, acepta — es solo el motor de contenedores, no vas a usarlo directamente. Espera a que el ícono de la ballena diga **Running**.

Es gratis para uso personal.

### 3. GitHub CLI y autenticación ⭐ **este es el paso que no te puedes saltar**

Claude Code corre comandos en tu terminal con **tus** credenciales. No tiene cuenta propia de GitHub. Si tu PowerShell no puede hacer `git push`, Claude Code tampoco.

```powershell
gh auth login
#   → GitHub.com
#   → HTTPS
#   → Authenticate Git with your GitHub credentials: Yes
#   → Login with a web browser

gh auth status          # debe decir "Logged in to github.com as HackerDonA"

git config --global user.name "Luis Andrés"
git config --global user.email "tu-correo@ejemplo.com"
git config --global core.autocrlf input
```

> **Nunca** le pegues un token personal (PAT) a Claude Code en el chat: quedaría escrito en el historial de la conversación.

### 4. La carpeta del proyecto

```powershell
mkdir $HOME\proyectos\rastreo-propio
cd $HOME\proyectos\rastreo-propio
claude
```

Y ahí pegas todo lo que está debajo de la línea.

> El prompt termina pidiéndole a Claude Code que **te haga preguntas y te muestre el plan antes de escribir código**. Es intencional: ahí es donde se corrigen los malentendidos baratos.

---

# PROYECTO: Plataforma propia de rastreo GPS vehicular

## Contexto

Actualmente uso **Ruhavik** (de GPS-Trace/Gurtam) para monitorear mis vehículos y pago suscripción. Quiero construir mi propia plataforma autoalojada, con funciones a mi medida —sobre todo un módulo de **mantenimientos** propio— y un frontend mucho mejor que el que tengo hoy.

**Decisión de arquitectura ya tomada, no la cuestiones:** uso **Traccar** (open source, Apache 2.0, 200+ protocolos GPS) como motor de ingesta y decodificación. No voy a reimplementar decodificadores de protocolos binarios. Encima de Traccar construyo **mi propia API (BFF) y mi propio frontend**, que es donde está el valor: mantenimientos, reportes y diseño.

Este proyecto además es para **mi portafolio en GitHub**, así que la calidad del repo, del historial de commits y de la documentación pesa tanto como el código.

## Mi entorno

- **Sistema operativo:** **Windows 11 nativo**. Trabajo en **PowerShell**, con el proyecto en `C:\Users\...`, Node y pnpm instalados en Windows, y Docker Desktop corriendo. **No uso WSL ni ninguna terminal de Linux, y no quiero que el proyecto dependa de eso.** Todos los comandos que me des deben ser de PowerShell. Docker Desktop usa su propio motor por debajo, pero yo nunca lo toco: dentro de contenedores solo van Traccar y PostgreSQL; mi API y mi frontend corren nativos en Windows.
- **Usuario de GitHub:** `HackerDonA` — ya tengo `gh` instalado y autenticado, y `git config` con mi nombre y correo.
- **Vehículos:** voy a monitorear **10 unidades**, y quiero poder agregar más sin límite ni rediseño. Diseña pensando en decenas de unidades, no en una.
- **Rastreadores:** ya tengo hardware funcionando en Ruhavik, pero **no sé con certeza el modelo ni el protocolo exacto de cada uno**, y podrían ser de marcas distintas entre sí. Necesito que la documentación me enseñe a averiguarlo.
- **Nivel:** sé programar, pero es mi primera vez con Traccar y con telemática GPS. Explícame el *por qué* de las decisiones, no solo el *qué*.
- **Idioma:** español para toda la documentación, los comentarios de código y tus explicaciones. Nombres de variables, funciones, ramas y mensajes de commit en inglés.

## Alcance de esta sesión

**Fase 0 + Fase 1: entorno local completo y repositorio documentado en GitHub.**

Al terminar quiero poder:

1. Levantar todo con `docker compose up -d` y `pnpm dev`.
2. Ver **varios vehículos simulados** moviéndose en **mi propio frontend**, sin tocar mis rastreadores reales.
3. Tener una guía que me permita conectar mis 10 GPS reales **yo solo, sin ayuda**.
4. Tener el repo público en `github.com/HackerDonA` con un historial de commits que se vea profesional.

**Todavía NO** vamos a producción ni voy a reapuntar mis rastreadores reales. Eso es la siguiente fase.

## Stack acordado

No lo cambies sin preguntarme primero y explicarme el motivo.

| Capa | Tecnología |
|---|---|
| Motor GPS | Traccar 6.15.x (imagen oficial de Docker) |
| Base de datos | PostgreSQL 16 |
| Mi API / BFF | Node 22 + TypeScript + **Fastify** |
| Frontend | React 19 + TypeScript + **Vite** |
| Mapas | **MapLibre GL JS** + tiles de OpenFreeMap |
| Estilos | Tailwind CSS + shadcn/ui |
| Gráficas | Recharts |
| Monorepo | pnpm workspaces |
| Orquestación | Docker Compose |
| Validación | Zod |
| Tests | Vitest |

**Prohibido:** Google Maps o Mapbox (cobran por carga). Servicios de pago de cualquier tipo. Secretos en el repositorio.

---

## Entregables

### 1. Estructura del monorepo

```
rastreo-propio/
├── apps/
│   ├── api/          # BFF en Fastify
│   └── web/          # Frontend React
├── infra/
│   ├── docker-compose.yml
│   ├── traccar.xml
│   └── Caddyfile.example      # para la fase de producción
├── scripts/
│   ├── backup.ps1            # el que uso yo, en Windows
│   ├── restore.ps1
│   ├── backup.sh             # para cuando migre a Linux
│   ├── restore.sh
│   └── simulate-fleet.ts
├── docs/
├── .github/
├── .env.example
├── README.md
└── LICENSE
```

### 2. Infraestructura (`infra/`)

- `docker-compose.yml` con **Traccar + PostgreSQL**, volúmenes con nombre, `restart: unless-stopped`, healthchecks y todas las variables leídas del `.env`.
- Expón únicamente los puertos de protocolo que voy a necesitar (incluye `5055` para OsmAnd/Traccar Client, más `5023`, `5013`, `5001` y `5027` como candidatos) y **comenta cada uno con el protocolo y los equipos que le corresponden**.
- `traccar.xml` con PostgreSQL, `database.historyDays` y logging en nivel útil para depurar.
- **Índices en la base de datos pensados para 10+ unidades reportando cada 10–30 segundos.** Explícame en un comentario cuántas filas al mes implica eso y cuándo tendría que preocuparme por particionar o usar TimescaleDB.
- `.env.example` completo y comentado, con `.env` en el `.gitignore`.

### 3. API / BFF (`apps/api`)

- Fastify + TypeScript estricto (`strict: true`, cero `any`).
- Cliente tipado de la **API de Traccar** (REST) con autenticación por **token de API**, nunca usuario y contraseña en el frontend.
- Relay de **WebSocket** de Traccar (`/api/socket`) hacia mi frontend, para posiciones y eventos en tiempo real. Debe manejar bien decenas de unidades emitiendo a la vez: agrupa o limita la frecuencia de emisión hacia el cliente si hace falta.
- Endpoints propios:
  - `GET /health`
  - `GET /api/units` — todas las unidades con su última posición y estado, en **una sola llamada** (no N+1)
  - `GET /api/units/:id/history?from=&to=` — con paginación o simplificación de la ruta, porque un mes de historial de una unidad son decenas de miles de puntos
  - `GET /api/units/:id/trips`
  - `GET /api/fleet/summary` — vista de flota: kilómetros del día, unidades en movimiento, alertas abiertas
  - **Módulo de mantenimientos** (CRUD completo)
- Mis tablas van en un **schema separado** (`app`) del mismo PostgreSQL, para no tocar el esquema de Traccar y poder actualizarlo sin miedo. Solo leo las tablas `tc_*`, nunca las modifico.
- Migraciones SQL versionadas para el schema `app`, con `mantenimientos`, `mantenimientos_historial` y `avisos`. Las reglas de mantenimiento deben soportar **kilometraje, fecha y horas motor**, con aviso previo configurable y lógica de "lo que ocurra primero".
- Como voy a tener 10+ vehículos, los mantenimientos deben poder definirse como **plantilla aplicable a varias unidades** (ej. "cambio de aceite cada 5,000 km" aplicado a toda la flota), no capturarse uno por uno.
- Un **job programado** (cada hora) que evalúa los mantenimientos pendientes y escribe a la tabla `avisos` y al log. Las notificaciones push vienen en una fase posterior.
- Validación de entrada con Zod en todas las rutas, manejo de errores centralizado y logs estructurados con Pino.

### 4. Frontend (`apps/web`)

Que se vea **bien de verdad**, no un formulario pelón. Diseño limpio, modo claro y oscuro, responsive.

Diseña la interfaz para **una flota de 10+ unidades**, no para un solo vehículo:

- **Mapa en vivo** (MapLibre) con todas las unidades, agrupamiento de marcadores cuando estén encimadas, rumbo, y actualización por WebSocket.
- **Panel lateral** con la lista de unidades: buscador, filtro por estado (en movimiento / detenido / sin señal / con alerta) y orden configurable.
- **Dashboard de flota**: kilómetros del día, unidades activas, mantenimientos por vencer, alertas abiertas.
- **Vista de detalle** por vehículo con pestañas: Mapa · Historial · Mantenimientos.
- **Historial**: selector de rango de fechas y trazo de la ruta sobre el mapa.
- **Mantenimientos**: vista de flota completa con barras de progreso ("faltan 480 km" / "vencido hace 12 días"), alta y edición, aplicación masiva de plantillas, y registro del historial de servicios.
- Estados de carga, vacío y error bien resueltos en todas las vistas.

### 5. Scripts (`scripts/`)

- **`simulate-fleet.ts`** — el más importante para poder desarrollar. Simula **10 vehículos simultáneos** inyectando posiciones al puerto OsmAnd (`5055`) de Traccar por HTTP, cada uno recorriendo una ruta realista en México, con velocidad, rumbo, paradas y arranques. Parámetros por línea de comandos (número de unidades, velocidad de simulación, ciudad). **Sin esto no puedo diseñar nada, porque un mapa vacío no se puede maquetar** y una lista de un solo vehículo no me deja ver los problemas reales de una flota.
- **`backup.ps1` y `restore.ps1`** — versiones de **PowerShell**, que son las que voy a usar en mi máquina. `pg_dump` comprimido con fecha en el nombre, y restauración con confirmación.
- **`backup.sh` y `restore.sh`** — las mismas en Bash, para cuando migre a la Raspberry Pi o al VPS. Que hagan exactamente lo mismo, para que la migración no me obligue a reescribirlas.

### 6. Documentación (`docs/`) — pesa tanto como el código

#### `docs/01-instalacion-local.md`
Paso a paso desde cero: requisitos, clonar, `.env`, levantar, crear el usuario administrador de Traccar, generar el token de API, arrancar el simulador y ver la flota en mi frontend. **Todos los comandos en PowerShell**, con qué debo ver en pantalla en cada paso.

Incluye una sección específica de **Windows 11** con lo que sé que me va a morder:

- Cómo abrir el **Firewall de Windows Defender** para el puerto `5055` cuando quiera probar con la app Traccar Client desde mi celular en la misma red. Sin esa regla, el celular no llega y parece que el servidor está roto.
- Cómo saber la **IP local de mi PC** (`ipconfig`) y por qué el celular necesita esa IP y no `localhost`.
- Qué hacer si un puerto aparece ocupado por el **rango dinámico reservado de Windows/Hyper-V** (`netsh int ipv4 show excludedportrange protocol=tcp`) y cómo cambiar de puerto si toca.
- Un `.gitattributes` con `* text=auto eol=lf` para que los finales de línea de Windows no me ensucien los diffs ni rompan los scripts `.sh`.
- Cómo reiniciar limpio si Docker Desktop se queda colgado.

#### `docs/02-conectar-mis-gps.md` ⭐ **EL DOCUMENTO MÁS IMPORTANTE**

Este es el que más me urge y el que quiero que hagas con más cuidado y detalle. Investígalo bien (consulta la documentación oficial y el foro de Traccar) y escríbelo asumiendo que yo no sé nada de telemática. Ten presente que tengo **10 equipos que podrían ser de marcas distintas**, así que el documento debe servirme como procedimiento repetible, no como receta de un solo caso.

Debe cubrir, mínimo:

**a) Cómo averiguar qué rastreador y qué protocolo tengo.** Cuatro métodos, del más rápido al más lento:
   1. En **Ruhavik**: Ajustes de la unidad → pestaña **Hardware** muestra el tipo de dispositivo y el ID. Explícame cómo mapear ese nombre al nombre del protocolo en Traccar.
   2. En **ToolBox de Ruhavik**: ver los mensajes crudos y reconocer el protocolo por el encabezado del paquete (`78 78` = GT06, `*HQ,` = H02, `imei:` = GPS103, etc.). Dame una **tabla de firmas** para identificarlos de un vistazo.
   3. La **etiqueta física** del aparato y su IMEI.
   4. **Prueba ordenada** contra Traccar: abrir varios puertos candidatos y leer los logs.

   Incluye una **tabla vacía para llenar** con mis 10 unidades: vehículo, marca/modelo del equipo, IMEI, protocolo, puerto, APN, estado. Que sea mi inventario de trabajo.

**b) Tabla de protocolos y puertos** de Traccar para los equipos más comunes en México (GT06/Concox/Jimi, H02/SinoTrack, GPS103/Coban/TK103, Teltonika, Meitrack, OsmAnd), con los modelos típicos de cada familia. Explica dónde ver la lista completa (`conf/default.xml`).

**c) Cómo leer los logs de Traccar** para confirmar que un equipo está llegando: qué comando usar, cómo activar el log detallado, y cómo se ve un paquete decodificado correctamente vs. uno que llega pero no se entiende vs. nada llegando. Con ejemplos de salida real.

**d) Comandos SMS de configuración** por familia de protocolo: APN, dirección del servidor, puerto, intervalo de reporte y reinicio. Al menos GT06, H02/SinoTrack, GPS103/Coban y Teltonika. **Marca claramente que la sintaxis cambia entre modelos y que hay que verificar el manual del equipo**, y explica el orden correcto (APN primero, servidor después, reinicio al final).

**e) APN de los operadores mexicanos** (Telcel, AT&T, Movistar) y qué hacer si el SIM es de un proveedor M2M.

**f) La zona horaria en UTC 0** y por qué es obligatoria (si no, los viajes y eventos salen desfasados).

**g) Cómo probar SIN tocar mis rastreadores reales**, que es lo que quiero hacer primero:
   - La app **Traccar Client** en mi celular (protocolo OsmAnd, puerto 5055) apuntando a la IP local de mi PC.
   - Inyección manual con `curl` al endpoint OsmAnd.
   - Mi script `simulate-fleet.ts`.

**h) Cómo hacer que un rastreador real llegue a mi máquina local.** Explícame claramente que un rastreador con SIM sale a internet y **no puede alcanzar una IP privada de mi red**, y dame las opciones reales: port forwarding temporal en el router, un túnel TCP, o esperar a la fase de producción. **Advierte explícitamente que Cloudflare Tunnel y Tailscale no sirven para esto**, porque el rastreador solo abre un socket TCP crudo.

**i) Estrategia de migración desde Ruhavik para 10 unidades.** La mayoría de los equipos baratos apuntan a un solo servidor a la vez, así que reapuntar significa desaparecer de Ruhavik. Propón un **plan por lotes**: primero una unidad de prueba con el vehículo estacionado, validar unos días, y después el resto. Incluye qué exportar de Ruhavik antes (historial en `.gpx`/`.geojson`, eventos en `.xlsx`) y un plan de reversa por si algo sale mal.

**j) Solución de problemas**, en formato "síntoma → causas probables → cómo verificarlo":
   - No llega absolutamente nada
   - Llega pero Traccar no lo decodifica
   - Se conecta y se desconecta en ciclo
   - Posiciones con fecha u hora incorrecta
   - Posiciones en el mar cerca de África (coordenadas 0,0)
   - El equipo reporta pero el odómetro no avanza
   - Una unidad de las diez deja de reportar y las demás siguen bien

**k) Checklist final** para dar de alta un rastreador nuevo, pensado para repetirlo diez veces sin equivocarme.

#### `docs/03-arquitectura.md`
Diagrama en **Mermaid** del flujo completo (rastreador → Traccar → PostgreSQL → BFF → frontend), decisiones de diseño, el modelo de datos de mi schema `app`, y una nota sobre volumen de datos esperado con 10 unidades.

#### `docs/04-migrar-a-produccion.md`
Cómo llevar esto a una Raspberry Pi o a un VPS: DDNS, port forwarding, HTTPS con Caddy, respaldos, y el detalle de **apuntar siempre los rastreadores a un hostname DDNS y nunca a una IP**, para que una migración futura no me obligue a reconfigurar diez vehículos por SMS uno por uno.

#### `docs/adr/`
Registros breves de decisiones de arquitectura (una página cada uno): por qué Traccar y no un servidor propio; por qué un BFF y no pegar el frontend directo a Traccar; por qué MapLibre y no Google Maps; por qué un schema separado en la misma base de datos.

### 7. README.md — calidad de portafolio

Es lo primero que va a ver un reclutador en `github.com/HackerDonA`. Debe:

- Explicar en **tres líneas** qué es y qué problema resuelve (incluye el contexto: "sustituyo una plataforma comercial de suscripción por una propia para monitorear una flota de 10 vehículos").
- Incluir el **diagrama de arquitectura** en Mermaid, embebido.
- Tener una sección de **stack** con badges.
- Tener **espacio reservado para capturas y un GIF** de la app funcionando, con un `TODO` claro de dónde ponerlos.
- Tener un **Quick Start** que funcione de verdad copiando y pegando.
- Tener una sección de **funcionalidades** con checkboxes de lo hecho y lo pendiente.
- Tener una sección de **decisiones técnicas** que enlace a los ADRs. Esto es lo que distingue un repo de portafolio de un tutorial copiado.
- Tener una sección de **qué aprendí** construyéndolo.
- Enlazar a los documentos de `docs/`.
- Estar en español, con un resumen corto en inglés al inicio.

### 8. GitHub

Ya tengo `gh` autenticado como `HackerDonA` y `git config` listo. Tú te encargas del resto:

- `.gitignore` correcto (Node, `.env`, volúmenes de Docker, dumps de base de datos).
- `.gitattributes` con `* text=auto eol=lf`, porque trabajo en Windows y no quiero que los CRLF me ensucien los diffs ni rompan los scripts de Bash.
- `LICENSE` — MIT.
- `.github/workflows/ci.yml` — lint, typecheck, tests y build en cada push y PR.
- Plantillas de issue y de pull request, y un `CONTRIBUTING.md` breve.
- Crea el repositorio **público** con `gh repo create HackerDonA/rastreo-propio --public`, con una descripción y topics que propongas tú.
- **Historial de commits que se lea como trabajo real:** Conventional Commits, un commit por entregable lógico, mensajes descriptivos. Nada de un solo commit gigante llamado "initial commit".

---

## Cómo quiero que trabajes

1. **Antes de escribir una sola línea de código:** hazme las preguntas que necesites y muéstrame el plan de trabajo por fases. **Espera mi aprobación.**
2. Ve **fase por fase**. Al terminar cada una: haz los commits correspondientes, **haz `git push`**, dime qué probar y cómo, y espera a que confirme antes de seguir. Quiero que el repo vaya creciendo visiblemente, no que aparezca todo de golpe al final.
3. La documentación se escribe **junto con** el código de cada fase, no al final. Un entregable sin su documentación no está terminado.
4. TypeScript estricto en todo. Sin `any`, sin `@ts-ignore`.
5. Si algo de lo que pedí es mala idea, **dímelo y propón la alternativa** en lugar de implementarlo en silencio.
6. **Todos los comandos que me des deben ser de PowerShell**, no de Bash. Si una herramienta solo existe en Linux, busca la alternativa de Windows o resuélvelo con un script de Node en vez de asumir que tengo WSL.
7. Si necesitas verificar algo de Traccar (puertos, endpoints, formato de la API, comandos de un protocolo), **búscalo en su documentación oficial y en su foro** en vez de asumirlo. Que la documentación sea correcta importa más que escribirla rápido.
8. **No inventes comandos SMS ni puertos.** Si no estás seguro de algo, márcalo explícitamente como "verificar contra el manual del modelo". Un comando SMS inventado me puede dejar un rastreador mudo hasta desmontarlo del vehículo.

## Criterios de aceptación

- [ ] `docker compose up -d` levanta Traccar y PostgreSQL sin errores desde **PowerShell en Windows 11**.
- [ ] Puedo entrar a Traccar en `localhost:8082`, crear el admin y generar un token de API.
- [ ] `pnpm dev` levanta la API y el frontend.
- [ ] `pnpm simulate` mete **10 vehículos simulados** y **los veo moverse en tiempo real en mi frontend**, no en el de Traccar.
- [ ] La lista y el mapa siguen siendo usables y fluidos con 10 unidades reportando a la vez.
- [ ] Puedo crear una plantilla de mantenimiento por kilometraje, aplicarla a toda la flota, y ver el progreso de cada unidad conforme acumulan kilómetros.
- [ ] `docs/02-conectar-mis-gps.md` es lo bastante claro y completo como para que yo conecte mis GPS reales sin volver a preguntarte.
- [ ] El repo está publicado en `github.com/HackerDonA/rastreo-propio`, el CI pasa en verde, y el README se entiende en 30 segundos.

## Restricciones

- **No** implementes decodificadores de protocolos GPS: para eso está Traccar.
- **No** uses servicios de pago, ni Google Maps, ni Mapbox.
- **No** modifiques el esquema de base de datos de Traccar (tablas `tc_*`); solo léelas. Mis tablas van en el schema `app`.
- **No** metas credenciales, tokens, IMEIs reales ni IPs reales en el repositorio. Usa siempre valores de ejemplo.
- **No** toques la configuración de mis rastreadores reales en esta fase.
- Todo debe funcionar **sin conexión a internet** más allá de descargar las imágenes y los paquetes (los tiles del mapa sí necesitan red).

## Empieza aquí

Léelo completo, hazme las preguntas que te falten, y proponme el plan de trabajo por fases con lo que vas a hacer en cada una. **No escribas código hasta que te dé el visto bueno.**
