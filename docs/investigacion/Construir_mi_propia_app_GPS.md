# Cómo construir mi propia app de monitoreo GPS

**Objetivo:** dejar de depender de Ruhavik y tener una plataforma propia, autoalojada en casa, con mis funciones (avisos de mantenimiento a mi manera), un frontend bonito y útil, app móvil, reportes y comandos remotos — al menor costo posible.

**Fecha:** 31 de agosto de 2026
**Escenario asumido:** uso personal, pocas unidades (1–10), servidor en casa (PC vieja o Raspberry Pi), presupuesto mínimo.

---

## 0. La conclusión, primero

**No escribas el servidor de protocolos GPS desde cero. Usa [Traccar](https://www.traccar.org/) como motor y construye TU app encima.**

Traccar es open source (Apache 2.0), gratis sin límites, soporta **200+ protocolos y 2000+ modelos** de rastreadores, corre en una Raspberry Pi, y expone una **API REST + WebSocket** completa. Es literalmente el mismo tipo de motor que hay detrás de Ruhavik, pero en tu casa y sin mensualidad.

Lo que tú construyes es la capa que realmente te importa y que Ruhavik no te deja tocar:

| Capa | ¿Quién la hace? | Por qué |
|---|---|---|
| Recepción TCP/UDP y decodificación de protocolos | **Traccar** | Son ~200 protocolos binarios distintos, sin documentación oficial en su mayoría. Reimplementarlo son meses de trabajo por cada modelo. |
| Base de datos de posiciones y eventos | **Traccar** | Ya resuelto, con esquema estable. |
| Geocercas, viajes, paradas, comandos | **Traccar** | Ya viene, y accesible por API. |
| **Mantenimientos con tus reglas** | **Tú** | Aquí está tu diferenciador. |
| **Frontend web bonito** | **Tú** | Aquí está tu diferenciador. |
| **App móvil** | **Tú** | Aquí está tu diferenciador. |
| **Reportes y análisis a tu gusto** | **Tú** | Aquí está tu diferenciador. |

Escribir tu propio parser de protocolo es un proyecto interesante y **sí es viable** para un solo modelo (ver §11), pero es el camino largo y no te acerca a lo que quieres.

---

## 1. Arquitectura recomendada

```
   [Rastreador GPS + SIM de datos]
              │  TCP crudo, protocolo del fabricante (ej. GT06)
              ▼
   Internet ──► tu IP pública / DDNS  ──► router (port forward)
                                             │
                        ┌────────────────────▼────────────────────┐
                        │   Raspberry Pi 5 / PC vieja en tu casa  │
                        │                                          │
                        │  ┌────────────┐   ┌──────────────────┐  │
                        │  │  Traccar   │──►│   PostgreSQL     │  │
                        │  │  (Docker)  │   │   (Docker)       │  │
                        │  └─────┬──────┘   └──────────────────┘  │
                        │        │ REST + WebSocket                │
                        │  ┌─────▼──────────────────────────────┐ │
                        │  │  TU API / BFF  (Node o Python)     │ │
                        │  │  · lógica de mantenimientos        │ │
                        │  │  · reportes propios                │ │
                        │  │  · push notifications              │ │
                        │  └─────┬──────────────────────────────┘ │
                        │        │                                 │
                        │  ┌─────▼──────┐   ┌──────────────────┐  │
                        │  │ Caddy      │   │ TU frontend web  │  │
                        │  │ (HTTPS)    │   │ (React + mapa)   │  │
                        │  └─────┬──────┘   └──────────────────┘  │
                        └────────┼─────────────────────────────────┘
                                 │ HTTPS
                     ┌───────────┴───────────┐
                     ▼                       ▼
              [Tu app móvil]          [Navegador]
```

**Por qué un "BFF" (Backend For Frontend) propio y no pegar la app directo a Traccar:**

- Ahí vive tu lógica de mantenimientos, que Traccar no hace como tú quieres.
- No expones las credenciales de Traccar en la app.
- Puedes agregar caché, tus propios cálculos y tus propias tablas sin tocar Traccar (y así poder actualizarlo sin romper nada).

---

## 2. Hardware: qué necesitas en casa

### Opción A — PC o laptop vieja (costo: $0)

Es la mejor opción si ya la tienes. Cualquier equipo con 4 GB de RAM y un procesador de la última década sobra. Instálale Ubuntu Server o Debian y olvídate del escritorio gráfico.

**Contra:** consume 30–60 W (≈$60–130 MXN/mes de luz) y hace ruido.

### Opción B — Raspberry Pi 5 (4 GB) — recomendada

| Componente | Costo aproximado (MXN) |
|---|---|
| Raspberry Pi 5 · 4 GB | $1,400 – $1,900 |
| Fuente oficial 27 W | $350 |
| microSD 64 GB A2 (o mejor, SSD NVMe + HAT) | $250 – $900 |
| Disipador / carcasa con ventilador | $300 |
| **Total una sola vez** | **≈ $2,300 – $3,500** |

Consumo ≈ 4–7 W → **$10–20 MXN/mes de electricidad**. Una Pi 5 con 4 GB soporta holgadamente 10 unidades reportando cada 10–30 segundos; Traccar mismo corre en equipos mucho más modestos.

### Extras muy recomendables

- **No-break / UPS pequeño** ($800–1,500 MXN): un corte de luz con la microSD escribiendo la puede corromper.
- **SSD por USB o NVMe** en lugar de microSD: las microSD mueren con la escritura constante de una base de datos. Es la falla #1 de estos proyectos a los 6–12 meses.
- **Cable Ethernet** en lugar de WiFi.

---

## 3. El problema #1: que tu rastreador pueda llegar a tu casa

Esto es lo que hace difícil el autoalojamiento, y casi nadie lo menciona hasta que ya te compraste la Pi. **Léelo antes de gastar un peso.**

Tu rastreador abre una conexión **TCP cruda** (no HTTP) hacia una dirección IP y un puerto. Necesita que esa dirección sea **alcanzable desde internet**.

### Paso 1: averigua si tienes IP pública

```bash
# 1) Qué IP ve el mundo:
curl -s https://ifconfig.me

# 2) Qué IP tiene el WAN de tu router (entra a su panel: 192.168.1.1 o 192.168.0.1)
```

- **Si coinciden** → tienes IP pública. Perfecto, sigue al paso 2.
- **Si la del router es 100.64.x.x – 100.127.x.x, o 10.x.x.x** → estás detrás de **CGNAT**. No puedes abrir puertos. Ve al paso 3.

En México, Telmex/Infinitum normalmente entrega IP pública dinámica (funciona). Totalplay y varios cableros usan CGNAT con frecuencia. Puedes llamar y pedir IP pública; a veces la dan gratis, a veces la cobran.

### Paso 2 (con IP pública): DDNS + port forwarding

Tu IP pública cambia cada tanto, así que necesitas un nombre fijo:

1. **DDNS gratis:** [DuckDNS](https://www.duckdns.org/) (gratis, sin caducidad) o No-IP. Te da `mistrackers.duckdns.org`.
2. Instala el actualizador de DuckDNS en la Pi (un cron cada 5 minutos).
3. En el router, **redirige los puertos** que necesites a la IP local de la Pi:
   - El puerto del protocolo de tu rastreador (ej. `5023` TCP para GT06).
   - `443` TCP si vas a exponer tu frontend con HTTPS.
   - **Nunca** expongas el `8082` de Traccar directo ni el `5432` de PostgreSQL.

> ⚠️ **Advertencia importante:** Cloudflare Tunnel, ngrok gratuito y Tailscale **no sirven** para recibir a los rastreadores. Esos túneles manejan HTTP o requieren un cliente instalado; tu rastreador chino solo sabe abrir un socket TCP a una IP:puerto. Sí sirven para exponer tu frontend web, no para la ingesta.

### Paso 3 (con CGNAT o sin IP pública): un relay TCP

Rentas la máquina más barata posible que sí tenga IP pública, y la usas solo como puente hacia tu casa.

**La opción gratis real:** [Oracle Cloud Always Free](https://www.oracle.com/cloud/free/) regala de forma permanente instancias ARM (hasta 4 vCPU / 24 GB) con IP pública. Ahí puedes:

- **(a)** correr el relay TCP hacia tu casa vía WireGuard, o
- **(b)** simplemente correr Traccar completo ahí y olvidarte del hardware en casa.

Si prefieres pagar por algo más simple: Hetzner (≈€3.8/mes) o cualquier VPS de $5 USD.

**Relay con WireGuard + socat, en el VPS:**

```bash
# El VPS y la Pi están unidos por WireGuard (Pi = 10.8.0.2)
# Reenviar el puerto del protocolo GPS hacia la Pi:
socat TCP4-LISTEN:5023,fork,reuseaddr TCP4:10.8.0.2:5023
```

### Paso 4: la tarjeta SIM

- El SIM del rastreador solo necesita **salida** a internet; no requiere IP pública. Cualquier plan de datos M2M sirve (Telcel M2M, Dataxion, Emnify, etc.), típicamente **$40–100 MXN/mes por unidad**.
- Algunos operadores bloquean puertos altos poco comunes o el uso de nombres DNS. Si el equipo no conecta, prueba con **IP numérica** en lugar del dominio DDNS — es un problema reportado con frecuencia.

---

## 4. Instalación de Traccar (la parte fácil: una tarde)

Versión actual: **6.15.x**, gratis y open source, con builds para Linux x64, **Linux ARM (Raspberry Pi)**, Windows y Docker.

### 4.1 Con Docker Compose (recomendado)

`docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: traccar
      POSTGRES_USER: traccar
      POSTGRES_PASSWORD: cambia_esto_por_algo_largo
    volumes:
      - ./pgdata:/var/lib/postgresql/data

  traccar:
    image: traccar/traccar:latest
    restart: unless-stopped
    depends_on: [db]
    ports:
      - "8082:8082"        # web + API (NO exponer al internet directo)
      - "5023:5023"        # protocolo GT06 (Concox/Jimi y clones)
      - "5013:5013"        # protocolo H02 (SinoTrack ST-901/906)
      - "5027:5027"        # Teltonika
      - "5001:5001"        # GPS103 (Coban TK103 y clones)
      - "5055:5055"        # OsmAnd / Traccar Client (celulares)
    volumes:
      - ./traccar.xml:/opt/traccar/conf/traccar.xml:ro
      - ./logs:/opt/traccar/logs
```

`traccar.xml` mínimo:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE properties SYSTEM "http://java.sun.com/dtd/properties.dtd">
<properties>
  <entry key='config.default'>./conf/default.xml</entry>
  <entry key='database.driver'>org.postgresql.Driver</entry>
  <entry key='database.url'>jdbc:postgresql://db:5432/traccar</entry>
  <entry key='database.user'>traccar</entry>
  <entry key='database.password'>cambia_esto_por_algo_largo</entry>
  <!-- Limpieza automática del historial: conserva 365 días -->
  <entry key='database.historyDays'>365</entry>
</properties>
```

```bash
docker compose up -d
docker compose logs -f traccar
```

Entra a `http://IP-DE-TU-PI:8082`. La primera cuenta que registres es el administrador.

### 4.2 Abrir solo los puertos que usas

Cada protocolo tiene su propio puerto. Los más comunes (verifica siempre en `conf/default.xml` de tu instalación, ahí está la lista completa):

| Protocolo | Puerto | Equipos típicos |
|---|---|---|
| `gps103` | 5001 | Coban TK103, GPS103 y clones |
| `tk103` | 5002 | TK103-B y variantes |
| `h02` | 5013 | SinoTrack ST-901 / ST-906, muchos chinos |
| `gt06` | 5023 | Concox / Jimi GT06N, JC, VL02 y clones (el más común) |
| `teltonika` | 5027 | Teltonika FMB/FMC (Codec 8 / 8E) |
| `meitrack` | 5020 | Meitrack MVT/T3xx |
| `osmand` | 5055 | Traccar Client (app de celular) |

**Consejo de seguridad:** abre en el router únicamente el puerto del protocolo que uses. Menos superficie de ataque.

---

## 5. ¿Y si no sé qué rastreador tengo?

Tienes cuatro caminos, del más rápido al más laborioso:

1. **Míralo en Ruhavik.** Ajustes de la unidad → pestaña **Hardware**: ahí aparece el *tipo de dispositivo* con el que lo diste de alta. Ese nombre casi siempre coincide (o se parece mucho) al nombre del protocolo en Traccar.
2. **ToolBox de Ruhavik** te muestra los mensajes crudos que envía el equipo. El encabezado del paquete delata el protocolo (`78 78` = GT06; `*HQ,` = H02; `imei:` = GPS103).
3. **La etiqueta física** del aparato y la caja: modelo, IMEI y a veces el protocolo.
4. **Fuerza bruta ordenada:** deja Traccar corriendo, abre 4–5 puertos candidatos, apunta el equipo a cada uno y revisa `docker compose logs -f traccar`. Cuando aciertas, verás las posiciones decodificadas; cuando fallas, verás datos sin decodificar o nada.

En Traccar también puedes activar el log detallado para ver los bytes crudos que llegan:

```xml
<entry key='logger.level'>all</entry>
```

---

## 6. Migrar desde Ruhavik

1. **Exporta tu historial antes de irte.** Ruhavik permite exportar recorridos en `.kml`, `.gpx`, `.geojson` y `.wln`, y eventos/timeline en `.xlsx`, `.csv` y `.pdf`. Bájalo todo primero — cuando dejes de pagar, se va.
2. **Anota el IMEI** de cada equipo (es el identificador que usarás en Traccar).
3. **Da de alta las unidades en Traccar** (Configuración → Dispositivos → +), usando el IMEI como *identificador*.
4. **Reapunta el rastreador** a tu servidor. Se hace por SMS al número del SIM del equipo. Ejemplos típicos — **verifica el manual de tu modelo exacto, la sintaxis cambia entre fabricantes**:

   ```
   # Familia GT06 (Concox/Jimi y clones)
   APN,internet.itelcel.com#
   SERVER,1,mistrackers.duckdns.org,5023,0#
   GPRS,1#
   RESET#

   # SinoTrack ST-901 (protocolo H02) — usa IP, no dominio
   # 203.0.113.10 es una IP de ejemplo (rango reservado para documentación).
   # Sustitúyela por la IP pública de TU servidor.
   8040000 203.0.113.10 5013
   ```

   Regla general: **primero el APN, después el servidor, al final un reinicio.**
5. **Verifica** en los logs de Traccar que llegue la primera posición.
6. Cuando confirmes que todo funciona por unos días, cancela la suscripción de Ruhavik.

> **Advertencia:** la mayoría de los rastreadores baratos solo apuntan a **un servidor a la vez**. En cuanto lo reapuntes, desaparece de Ruhavik. Haz la migración con un solo equipo primero, y de preferencia con el vehículo estacionado en casa.

---

## 7. Tu capa propia: lo que de verdad vas a construir

### 7.1 Cómo hablas con Traccar

**API REST:** base `http://tu-servidor:8082/api`. Autenticación por *Basic Auth*, por *token* de sesión, o creando un **token de API** desde el perfil de usuario (lo más limpio para tu backend).

Endpoints que vas a usar constantemente:

| Endpoint | Para qué |
|---|---|
| `GET /api/devices` | Lista de tus unidades |
| `GET /api/positions?deviceId=&from=&to=` | Posiciones (historial) |
| `GET /api/reports/trips`, `/stops`, `/summary`, `/route` | Reportes ya calculados por Traccar |
| `GET/POST /api/geofences` | Geocercas |
| `POST /api/commands/send` | Enviar comandos al equipo |
| `GET /api/events` | Eventos (geocerca, encendido, alarma, mantenimiento…) |
| `GET/POST /api/maintenance` | El módulo de mantenimiento nativo |
| `WS /api/socket` | **WebSocket**: posiciones y eventos en tiempo real, sin hacer polling |

El WebSocket es la clave para que tu frontend se sienta en vivo: te empuja `devices`, `positions` y `events` en cuanto ocurren.

**Consejo:** para reportes pesados y análisis propio, consulta **directo la base de datos** en modo lectura (tablas `tc_devices`, `tc_positions`, `tc_events`). Es mucho más rápido que la API para agregaciones grandes.

### 7.2 Mantenimientos — tu diferenciador

Traccar trae un módulo de mantenimiento básico: defines un tipo (odómetro, horas motor, fecha), un valor de inicio y un periodo, y genera un evento cuando se cumple.

Eso te sirve como base, pero seguramente quieres más. Lo que yo construiría en **tus propias tablas**:

```sql
CREATE TABLE mantenimientos (
  id            SERIAL PRIMARY KEY,
  device_id     INT NOT NULL,
  nombre        TEXT NOT NULL,          -- 'Cambio de aceite'
  tipo          TEXT NOT NULL,          -- 'km' | 'dias' | 'horas_motor'
  intervalo     NUMERIC NOT NULL,       -- 5000
  aviso_previo  NUMERIC DEFAULT 500,    -- avisar 500 km antes
  ultimo_valor  NUMERIC,                -- km del último servicio
  ultima_fecha  DATE,
  costo_ultimo  NUMERIC,
  taller        TEXT,
  notas         TEXT,
  activo        BOOLEAN DEFAULT TRUE
);

CREATE TABLE mantenimientos_historial (
  id            SERIAL PRIMARY KEY,
  mantenimiento_id INT REFERENCES mantenimientos(id),
  fecha         DATE NOT NULL,
  km            NUMERIC,
  costo         NUMERIC,
  taller        TEXT,
  factura_url   TEXT,
  notas         TEXT
);
```

Y un *job* que corre cada hora:

```
para cada mantenimiento activo:
    km_actual = último odómetro del device en tc_positions
    km_restantes = (ultimo_valor + intervalo) - km_actual
    si km_restantes <= aviso_previo  →  push "Cambio de aceite en 480 km"
    si km_restantes <= 0             →  push "⚠️ Cambio de aceite VENCIDO"
```

Cosas que ganas y que ninguna app comercial te da exactamente como quieres:

- Costo histórico por vehículo y **costo por kilómetro** real.
- Recordatorios combinados: "lo que ocurra primero, 6 meses o 5,000 km".
- Verificación vehicular y tenencia como mantenimientos por fecha.
- Subir la foto de la factura del taller.
- Proyección: "a tu ritmo actual, el próximo servicio cae el 12 de noviembre".

> **Nota sobre el odómetro:** muchos rastreadores no reportan el odómetro real del vehículo. Traccar puede calcular la distancia acumulada a partir de las posiciones (atributo `totalDistance`). Es suficientemente bueno, pero **acumula error**; conviene poder corregirlo manualmente contra el tablero del carro de vez en cuando.

### 7.3 Reportes y análisis

Traccar ya te da viajes, paradas, resumen y ruta por API. Encima de eso puedes construir lo que Ruhavik cobra:

- Kilómetros por día/semana/mes, por vehículo y comparativo entre vehículos.
- Costo estimado de combustible (km ÷ rendimiento × precio de gasolina).
- Mapa de calor de dónde pasa más tiempo el vehículo.
- Ranking de conducción: aceleraciones, frenadas y excesos de velocidad (si el equipo los reporta).
- Exportar todo a Excel con `exceljs` (Node) o `openpyxl` (Python).

### 7.4 Comandos remotos

`POST /api/commands/send` con `{deviceId, type, attributes}`. Traccar traduce el comando genérico al dialecto de tu protocolo. Tipos comunes: `engineStop` / `engineResume` (corte de motor), `positionSingle`, `rebootDevice`, `setTimezone`, `custom` (envías la cadena cruda).

> ⚠️ **El corte de motor es peligroso.** Nunca lo dispares sin confirmación doble en la app, y jamás con el vehículo en movimiento. Muchas instalaciones lo cablean solo al arranque, no a la bomba de gasolina, precisamente por eso.

### 7.5 Notificaciones push

- **App nativa (Expo/React Native):** Firebase Cloud Messaging. **Gratis**, sin límite práctico para uso personal.
- **PWA:** Web Push con claves VAPID. Gratis y sin intermediarios. **iOS lo soporta desde 16.4 siempre que la PWA esté instalada en la pantalla de inicio.**
- **Ruta corta mientras construyes:** Traccar envía notificaciones a **Telegram** de fábrica; creas un bot con BotFather, pones el token y ya tienes alertas en el celular el primer día, sin escribir código.

---

## 8. Stack sugerido (todo gratis y open source)

| Pieza | Elección | Por qué |
|---|---|---|
| Motor GPS | **Traccar 6.15.x** | Apache 2.0, 200+ protocolos, ARM nativo |
| Base de datos | **PostgreSQL 16** | Robusta; opcionalmente TimescaleDB para series de tiempo |
| Tu API / BFF | **Node + Fastify** o **Python + FastAPI** | Rápidos, ligeros, con buena documentación automática |
| Frontend web | **React + Vite + TypeScript** | Estándar, enorme ecosistema |
| Mapa | **MapLibre GL JS** | Fork libre de Mapbox GL, sin costo ni API key |
| Tiles del mapa | **OpenFreeMap** o **Protomaps (PMTiles)** | Gratis e ilimitados. Con PMTiles incluso puedes servir México entero desde tu Pi, sin internet |
| Geocodificación inversa | **Nominatim** público (con límite) o **Photon** autoalojado | Convertir coordenadas en direcciones |
| UI | **Tailwind CSS + shadcn/ui** | Para que se vea bien sin ser diseñador |
| Gráficas | **Recharts** o **visx** | Reportes |
| App móvil | **Expo (React Native)** | Un solo código para iOS, Android y web; push incluido |
| HTTPS y proxy | **Caddy** | Certificado Let's Encrypt automático, dos líneas de configuración |
| Contenedores | **Docker Compose** | Todo reproducible; si truenas la Pi, levantas de nuevo en 20 minutos |

### Nativa vs PWA — la decisión que te ahorra $99 USD al año

| | PWA | App nativa (Expo) |
|---|---|---|
| Costo de publicación | **$0** | Google Play $25 USD (una vez) · Apple **$99 USD/año** |
| Push notifications | Sí (iOS 16.4+ requiere instalarla en pantalla de inicio) | Sí, más confiable |
| Acceso a GPS del celular, cámara, background | Limitado | Completo |
| Esfuerzo | Menor: es tu misma web | Medio |

**Para uso personal empieza con PWA.** Se instala en la pantalla de inicio, se ve como app, manda push y no le pagas nada a nadie. Si después te hace falta algo nativo, Expo te deja migrar sin tirar el código de React.

---

## 9. Plan de trabajo por fases

| Fase | Qué haces | Tiempo estimado | Resultado |
|---|---|---|---|
| **0** | Levantar Traccar en Docker en la Pi, resolver red (DDNS/port forward), conectar **un** rastreador | 1 fin de semana | Ya tienes tu propio servidor funcionando |
| **1** | Usar la web oficial de Traccar tal cual, con Telegram para alertas. Migrar el resto de las unidades. Anotar todo lo que te falta | 1–2 semanas de uso real | Sabes exactamente qué construir, sin adivinar |
| **2** | Tu BFF (Fastify/FastAPI) + tu frontend web con mapa en vivo y lista de unidades | 2–3 semanas | Ya es *tu* app |
| **3** | Módulo de mantenimientos propio con tus tablas y el job de avisos | 1–2 semanas | Tu razón principal para hacer esto |
| **4** | PWA instalable + Web Push + pulido visual | 2 semanas | Alertas en el celular, se ve bonita |
| **5** | Reportes, exportación a Excel, comandos remotos, histórico y gráficas | 2–3 semanas | Paridad total con Ruhavik y más |

**Total realista trabajando ratos libres: 2 a 3 meses.** La Fase 0 y 1 solas ya te quitan la mensualidad; todo lo demás es mejora.

**No te saltes la Fase 1.** Vivir con Traccar tal cual unas semanas te va a cambiar la lista de lo que creías que necesitabas.

---

## 10. Costos reales

### Una sola vez

| Concepto | Costo |
|---|---|
| Raspberry Pi 5 + fuente + almacenamiento + carcasa | $2,300 – $3,500 MXN (o **$0** si reciclas una PC) |
| No-break pequeño (opcional pero recomendado) | $800 – $1,500 MXN |
| Dominio propio (opcional, DuckDNS es gratis) | ~$200 MXN/año |

### Mensual

| Concepto | Costo |
|---|---|
| Software (Traccar, PostgreSQL, MapLibre, Firebase, Let's Encrypt, DuckDNS) | **$0** |
| Electricidad de la Pi | $10 – $20 MXN |
| VPS con IP pública (**solo si tienes CGNAT**) | $0 con Oracle Always Free · ~$90 MXN con Hetzner |
| SIM de datos por rastreador | $40 – $100 MXN |
| **Total mensual (1 vehículo, sin CGNAT)** | **≈ $50 – $120 MXN**, y de eso casi todo es el SIM que ya pagas hoy |

**Comparación:** Ruhavik Premium son ~$3.49 USD/mes por unidad (≈$65 MXN). El ahorro puro no es dramático con 1–2 vehículos; **el verdadero valor está en el control, las funciones a tu medida y que tus datos son tuyos.** Con 5+ unidades el ahorro ya sí es real.

---

## 11. Si de plano quieres escribir tu propio servidor de protocolo

Es un proyecto muy educativo y **factible para un solo modelo**. El protocolo **GT06** es el mejor punto de partida: es binario pero simple y está bien documentado por ingeniería inversa.

Estructura de un paquete GT06:

```
78 78 | LEN | PROTO | ...payload... | SERIAL(2) | CRC(2) | 0D 0A
 ↑                                                          ↑
inicio                                                     fin
```

Lo que tendrías que implementar:

1. Servidor TCP (Node `net`, Python `asyncio`, Go `net`).
2. *Framing*: acumular bytes hasta encontrar `0D 0A` y validar el CRC-ITU.
3. Decodificar el paquete de **login** (`0x01`) — trae el IMEI — y **responder el ACK**; si no respondes, el equipo se desconecta.
4. Decodificar **posición** (`0x12`/`0x22`): fecha/hora BCD, satélites, lat/lon en formato propio, velocidad, banderas de curso.
5. Responder los **heartbeats** (`0x13`).
6. Guardar en PostgreSQL.

**Tiempo estimado:** de un fin de semana (versión que funciona) a varias semanas (versión que aguanta reconexiones, buffers, alarmas y comandos).

**Mi recomendación:** hazlo *después*, como proyecto paralelo, cuando ya tengas tu app corriendo sobre Traccar. Así aprendes sin quedarte sin monitoreo. Y si tu equipo resulta ser de otra familia, el trabajo no se reutiliza — que es justo la razón por la que Traccar existe.

---

## 12. Riesgos y qué puede salir mal

| Riesgo | Mitigación |
|---|---|
| **microSD corrupta** por escritura constante | Usa SSD, o `log2ram` + respaldos automáticos |
| **Se va la luz o el internet** | Casi todos los rastreadores guardan posiciones offline y las reenvían al reconectar. Un no-break cubre los apagones cortos |
| **Cambió tu IP pública y el DDNS no actualizó** | Cron cada 5 min; monitorea con un healthcheck (Uptime Kuma en la misma Pi) |
| **Exponer puertos a internet** | Abre solo el puerto del protocolo. Nunca expongas 8082 ni la base de datos. Frontend siempre detrás de HTTPS con Caddy. Contraseñas largas. Actualiza Traccar |
| **Pierdes la base de datos** | `pg_dump` diario a un disco externo **y** a la nube (rclone a Google Drive/Backblaze B2). Pruébalo restaurando de verdad al menos una vez |
| **Se te acaba el tiempo/ganas a medio proyecto** | Por eso la Fase 0–1 usa la interfaz de Traccar tal cual: aunque nunca construyas tu frontend, ya tienes monitoreo funcionando |
| **Ahora tú eres el soporte técnico** | Es el costo oculto real. Si el sistema se cae a las 2 a.m., no hay a quién llamarle |

### Cuándo NO vale la pena

Si tu única motivación es ahorrar $65 pesos al mes en un vehículo, no vale la pena. **Vale la pena si**: quieres funciones que ninguna app te da, te interesa el proyecto en sí, tienes varias unidades, o te importa que la ubicación de tu familia no viva en un servidor europeo.

---

## 13. Checklist de arranque

- [ ] Averiguar en Ruhavik el **tipo de dispositivo** y el **IMEI** de cada rastreador (Ajustes de unidad → Hardware)
- [ ] **Exportar el historial** de Ruhavik (`.gpx`/`.geojson` y `.xlsx`) antes de cancelar
- [ ] Verificar si tengo **IP pública o CGNAT** (`curl ifconfig.me` vs. la WAN del router)
- [ ] Conseguir el hardware (Pi o PC reciclada) e instalar Debian/Ubuntu Server
- [ ] Instalar Docker y levantar Traccar + PostgreSQL
- [ ] Configurar DuckDNS + port forwarding (o el VPS relay si hay CGNAT)
- [ ] Dar de alta una unidad de prueba y **reapuntar un solo rastreador** (vehículo estacionado en casa)
- [ ] Confirmar posiciones en el mapa y activar alertas por **Telegram**
- [ ] Configurar `pg_dump` diario + copia fuera del equipo
- [ ] Vivir con Traccar 2 semanas y **escribir la lista de lo que me falta**
- [ ] Recién entonces: empezar el BFF y el frontend

---

## 14. Recursos

**Traccar**
- Sitio y descargas: <https://www.traccar.org/download/>
- Documentación: <https://www.traccar.org/documentation/>
- Arquitectura: <https://www.traccar.org/architecture/>
- Referencia de API: <https://www.traccar.org/api-reference/>
- Atributos calculados (JEXL): <https://www.traccar.org/computed-attributes/>
- Notificaciones: <https://www.traccar.org/notifications/>
- Protocolos soportados: <https://www.traccar.org/protocols/>
- Código fuente: <https://github.com/traccar/traccar>
- Foro (buscar el modelo exacto de tu rastreador): <https://www.traccar.org/forums/>

**Infraestructura**
- DuckDNS (DDNS gratis): <https://www.duckdns.org/>
- Oracle Cloud Always Free (VM ARM gratis con IP pública): <https://www.oracle.com/cloud/free/>
- Caddy (HTTPS automático): <https://caddyserver.com/>

**Frontend y mapas**
- MapLibre GL JS: <https://maplibre.org/>
- OpenFreeMap (tiles gratis): <https://openfreemap.org/>
- Protomaps / PMTiles (tiles autoalojados): <https://protomaps.com/>
- Expo (React Native): <https://expo.dev/>

**Referencia de protocolo**
- GT06, formato de paquete y comandos: <https://traxelio.com/trackers/protocol/gt06>

---

*Documento generado el 31 de agosto de 2026. Los precios de hardware son estimados para México y cambian; las versiones de software indicadas son las vigentes a esta fecha.*
