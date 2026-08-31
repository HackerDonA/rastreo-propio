# 04 · Migrar a producción

> 🚧 **En construcción — llega en la Fase 5.**
>
> Esta fase es cuando el servidor deja tu PC de escritorio y se muda a una
> Raspberry Pi o a un VPS, y cuando tus rastreadores reales empiezan a apuntar
> ahí en vez de a Ruhavik.

## Qué va a cubrir

- Elegir el equipo: Raspberry Pi 5 vs. VPS vs. PC vieja
- Averiguar si tu proveedor te da IP pública o estás detrás de CGNAT
- DDNS y port forwarding en el router
- HTTPS con Caddy (ver [`infra/Caddyfile.example`](../infra/Caddyfile.example))
- Respaldos automáticos y verificación de que se pueden restaurar
- Endurecimiento: rol de base de datos de solo lectura, `protocols.enable`,
  firewall

## La regla que hay que saber desde ahora

> ⚠️ **Apunta siempre los rastreadores a un hostname DDNS, nunca a una IP.**

Un rastreador guarda la dirección del servidor en su memoria y solo se cambia por
**SMS, uno por uno**. Si configuras una IP y esa IP cambia —porque tu proveedor la
rota, porque cambias de casa, porque migras de VPS— tienes que mandar diez SMS y
verificar diez equipos.

Con un hostname DDNS (`rastreo.midominio.duckdns.org`), una migración futura es
cambiar un registro DNS y esperar. Los diez vehículos se reconectan solos.

Es la diferencia entre cinco minutos y una tarde perdida, y se decide **hoy**, la
primera vez que configuras un equipo.

## La otra que sorprende a todos

Los rastreadores GPS **no pasan por Caddy ni por ningún proxy inverso**. Abren un
socket TCP crudo, sin TLS y sin HTTP, contra los puertos de protocolo (5023,
5013, 5001…). Ese tráfico va directo al contenedor de Traccar por port forwarding.

Por eso **Cloudflare Tunnel y Tailscale no sirven** para exponer esos puertos:
uno solo entiende HTTP/HTTPS, el otro requiere instalar un cliente en el
dispositivo, y un rastreador barato no puede ejecutar nada.

Caddy es solo para tu frontend y tu API. Detalle completo en
[`02-conectar-mis-gps.md`](02-conectar-mis-gps.md) sección (h).
