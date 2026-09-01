# 04 · Migrar a producción

Cómo llevar esto de tu PC de escritorio a un servidor que corra todo el día, y
cuándo apuntar los rastreadores reales.

---

## Las dos reglas que hay que saber desde ahora

### 1. Apunta siempre a un hostname DDNS, nunca a una IP

> Un rastreador guarda la dirección del servidor en su memoria y solo se cambia
> **por SMS, uno por uno**.

Si configuras una IP y esa IP cambia — porque tu proveedor la rota, porque
cambias de casa, porque migras de VPS — tienes que mandar diez SMS y verificar
diez equipos, con los vehículos repartidos por la ciudad.

Con un hostname DDNS (`rastreo.midominio.duckdns.org`), una migración futura es
cambiar un registro DNS y esperar. Los diez vehículos se reconectan solos.

Es la diferencia entre cinco minutos y una tarde perdida, y **se decide hoy**, la
primera vez que configuras un equipo.

> ⚠️ Algunos modelos H02 baratos (varios SinoTrack) solo aceptan IP, no dominio.
> Compruébalo en el manual **antes** de comprar más de esa marca: es una
> limitación con la que vas a vivir años.

### 2. Los rastreadores no pasan por el proxy inverso

Caddy sirve tu frontend y tu API por HTTPS. Los rastreadores **no pasan por
ahí**: abren un socket TCP crudo, sin TLS y sin HTTP, contra los puertos de
protocolo (5023, 5013, 5001…). Ese tráfico va directo al contenedor de Traccar
por reenvío de puertos del router.

Por eso **Cloudflare Tunnel y Tailscale no sirven** para esos puertos. Detalle
en [`02-conectar-mis-gps.md`](02-conectar-mis-gps.md#h-que-un-rastreador-real-llegue-a-mi-máquina).

---

## Paso 0 · ¿Tienes IP pública?

Antes de gastar un peso en hardware, comprueba esto. Si estás detrás de CGNAT,
**no puedes abrir puertos** y el plan cambia por completo.

```powershell
# La IP que ve el mundo
(Invoke-RestMethod https://api.ipify.org?format=json).ip
```

Compárala con la IP WAN del panel de tu router (normalmente `192.168.1.1` o
`192.168.0.1`).

| Resultado | Qué significa |
|---|---|
| **Coinciden** | Tienes IP pública. Adelante. |
| La del router es `100.64.x.x` – `100.127.x.x` | **CGNAT.** No puedes abrir puertos. |
| La del router es `10.x.x.x` o `172.16–31.x.x` | **CGNAT** o doble NAT. |

En México, Telmex/Infinitum suele entregar IP pública dinámica (sirve).
Totalplay y varios cableros usan CGNAT con frecuencia. Puedes llamar y pedir IP
pública; a veces la dan gratis, a veces la cobran.

**Si estás detrás de CGNAT** tienes dos salidas: pedir IP pública a tu
proveedor, o poner el servidor en un VPS con IP propia (~$100 MXN/mes), que
además resuelve el problema de la luz y del ruido.

---

## Paso 1 · Elegir el equipo

| Opción | Costo inicial | Consumo | Notas |
|---|---|---|---|
| **PC o laptop vieja** | $0 | 30–60 W (≈$60–130 MXN/mes) | Si ya la tienes, es lo más barato de arrancar |
| **Raspberry Pi 5 (4 GB)** | $2,300–3,500 MXN | 4–7 W (≈$10–20 MXN/mes) | Silenciosa, se paga sola en 2–3 años |
| **VPS** | $0 | — | ~$100 MXN/mes. Resuelve CGNAT, luz y ruido |

Con 10 unidades reportando cada 15–30 segundos, una Pi 5 con 4 GB va sobrada.

### Dos extras que no son opcionales

**SSD en lugar de microSD.** Las microSD mueren con la escritura constante de una
base de datos. Es la falla número uno de estos proyectos, y aparece a los 6–12
meses, justo cuando ya confías en el sistema.

**Un no-break pequeño** ($800–1,500 MXN). Un corte de luz con PostgreSQL
escribiendo puede corromper la base.

Y usa **cable Ethernet**, no WiFi.

---

## Paso 2 · DDNS

Un servicio de DNS dinámico te da un hostname fijo que sigue a tu IP cambiante.
[DuckDNS](https://www.duckdns.org/) es gratis y suficiente.

1. Crea el subdominio, por ejemplo `rastreo.duckdns.org`.
2. Instala el actualizador en el servidor (DuckDNS da un cron de una línea).
3. Verifica que resuelve a tu IP pública:
   ```powershell
   Resolve-DnsName rastreo.duckdns.org
   ```

Comprueba que sigue funcionando **una semana después**, cuando tu IP ya haya
cambiado al menos una vez. Un DDNS que no se actualiza es peor que no tenerlo:
falla en silencio.

---

## Paso 3 · Reenvío de puertos en el router

Reenvía **solo** los puertos de los protocolos que realmente uses:

| Puerto | Protocolo | ¿Abrir? |
|---|---|---|
| 5023 | gt06 | Solo si tienes Concox/Jimi viejos |
| 5013 | h02 | Solo si tienes SinoTrack |
| 5001 | gps103 | Solo si tienes Coban |
| 5027 | teltonika | Solo si tienes Teltonika |
| 5055 | osmand | Solo si usas Traccar Client en el celular |
| **8082** | web de Traccar | **No.** Ver abajo |
| **5432** | PostgreSQL | **Nunca** |
| 443 | HTTPS (Caddy) | Sí, para tu frontend |

**Reserva la IP local del servidor por MAC** en el router. Si no, un reinicio le
cambia la IP y el reenvío deja de apuntar a ningún lado.

> **No publiques el 8082.** La interfaz nativa de Traccar da control total sobre
> todas las unidades, incluido el corte de motor. Si necesitas entrar desde
> fuera, ponla detrás de Caddy con `basic_auth` — hay un ejemplo comentado en
> [`infra/Caddyfile.example`](../infra/Caddyfile.example).

Cuando ya sepas exactamente qué equipos tienes, descomenta `protocols.enable` en
[`infra/traccar.xml`](../infra/traccar.xml) para que Traccar abra solo esos
puertos en vez de los 268.

---

## Paso 4 · HTTPS con Caddy

```bash
cp infra/Caddyfile.example infra/Caddyfile
# edita el dominio
```

Caddy consigue y renueva el certificado de Let's Encrypt solo. No hay que correr
certbot ni programar renovaciones.

Requisitos: el puerto **80 y 443** reenviados, y el hostname resolviendo a tu IP
antes de arrancar Caddy (necesita el 80 para validar el certificado).

---

## Paso 5 · Endurecer

### Un rol de base de datos de solo lectura sobre `public`

Hoy el BFF y Traccar usan el mismo usuario de PostgreSQL. La regla "las tablas
`tc_*` se leen, nunca se escriben" la sostiene la disciplina. En producción
conviene que la imponga la base:

```sql
CREATE ROLE app_bff LOGIN PASSWORD 'una-contrasena-larga';
GRANT USAGE ON SCHEMA public TO app_bff;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_bff;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO app_bff;
GRANT ALL ON SCHEMA app TO app_bff;
GRANT ALL ON ALL TABLES IN SCHEMA app TO app_bff;
GRANT ALL ON ALL SEQUENCES IN SCHEMA app TO app_bff;
```

Y apunta el BFF a ese rol. Así el privilegio de escritura sobre `tc_*` deja de
existir a nivel de base de datos.

### Lo demás

- **Cambia la contraseña del admin de Traccar** si venías usando la generada.
- **Firewall del servidor** (`ufw` en Debian/Ubuntu): permite solo los puertos
  que reenviaste.
- **`logger.level` en `info`**, nunca `debug` de forma permanente.
- **`server.statistics` vacío** — ya viene así en este proyecto.
- **Actualizaciones de seguridad automáticas** del sistema operativo.

---

## Paso 6 · Respaldos que de verdad puedas restaurar

```bash
crontab -e
```

```cron
# Respaldo diario a las 3 de la mañana, conservando 30 días
0 3 * * * /srv/rastreo-propio/scripts/backup.sh >> /var/log/rastreo-backup.log 2>&1
```

`backup.sh` usa `pg_dump` dentro del contenedor, que produce una instantánea
consistente. **No copies el volumen en caliente**: PostgreSQL puede estar a media
escritura y el respaldo sale corrupto.

Un solo dump cubre los dos esquemas — el `public` de Traccar y el `app` nuestro
— que es una ventaja concreta de tenerlos en la misma base de datos.

> 🚨 **Un respaldo que nunca has restaurado no es un respaldo.** Prueba
> `restore.sh` al menos una vez, de preferencia en otra máquina. Es la única
> forma de saber que funciona.

**Sácalos del servidor.** Un respaldo en el mismo disco que la base no protege
de un disco muerto. Cópialos a otra máquina, a un disco externo, o a
almacenamiento en la nube.

---

## Paso 7 · Reapuntar los rastreadores

Solo cuando todo lo anterior esté listo y probado.

El plan por lotes completo, con el plan de reversa, está en
[`02-conectar-mis-gps.md`](02-conectar-mis-gps.md#i-migrar-desde-ruhavik). En
resumen:

1. Exporta el historial de Ruhavik **antes** de mover nada.
2. Anota el servidor y puerto **originales** de cada equipo (es el único camino
   de vuelta).
3. Da de alta las 10 unidades en Traccar con sus IMEI.
4. Reapunta **una** unidad, con el vehículo estacionado, y déjala varios días.
5. Después dos o tres más. Después el resto, de dos en dos.
6. Cancela Ruhavik solo cuando las diez lleven **una semana** estables.

---

## Checklist de producción

**Antes de mover el servidor**

- [ ] IP pública confirmada (no CGNAT)
- [ ] DDNS funcionando y verificado tras un cambio de IP
- [ ] SSD, no microSD
- [ ] No-break conectado
- [ ] Cable Ethernet

**Al desplegar**

- [ ] `.env` con contraseñas nuevas, distintas a las de desarrollo
- [ ] `pnpm infra:up` y ambos contenedores *healthy*
- [ ] Admin de Traccar creado con contraseña propia
- [ ] Token de API nuevo generado
- [ ] Caddy sirviendo HTTPS con certificado válido
- [ ] Puertos reenviados: solo los necesarios
- [ ] Puerto 8082 **no** publicado a internet
- [ ] `protocols.enable` limitado a tus protocolos
- [ ] Rol `app_bff` de solo lectura sobre `public`
- [ ] Firewall del sistema operativo activo
- [ ] Respaldo diario programado
- [ ] **Restauración probada al menos una vez**
- [ ] Respaldos copiándose fuera del servidor

**Al reapuntar los rastreadores**

- [ ] Historial de Ruhavik exportado
- [ ] Servidor y puerto originales anotados para cada unidad
- [ ] Las 10 unidades dadas de alta en Traccar con su IMEI
- [ ] Apuntan a **hostname DDNS**, no a una IP
- [ ] Migración por lotes, empezando por una sola
- [ ] Una semana estable antes de cancelar Ruhavik
