# 02 · Conectar mis GPS reales

> 🚧 **En construcción — llega en la Fase 3.**
>
> Este documento se escribe *después* del simulador y del frontend, a propósito:
> así cada comando que aparezca aquí se puede verificar contra un sistema que ya
> está funcionando, en vez de escribirlo de memoria.
>
> Mientras tanto, para probar **sin tocar tus rastreadores reales**, usa el
> simulador y la app Traccar Client — ver
> [`01-instalacion-local.md`](01-instalacion-local.md) secciones 6 y 7.1.

## Qué va a cubrir

- **(a)** Cómo averiguar qué rastreador y qué protocolo tienes: pestaña Hardware
  de Ruhavik, ToolBox, la etiqueta física, y prueba ordenada contra Traccar.
  Con tabla de firmas de paquete para identificarlos de un vistazo.
- **(b)** Tabla de protocolos y puertos de Traccar para los equipos más comunes
  en México.
- **(c)** Cómo leer los logs de Traccar para confirmar que un equipo está
  llegando, con ejemplos reales de los tres casos: decodifica bien, llega pero no
  se entiende, y no llega nada.
- **(d)** Comandos SMS de configuración por familia de protocolo.
- **(e)** APN de Telcel, AT&T y Movistar, y qué hacer con un SIM M2M.
- **(f)** La zona horaria en UTC 0 y por qué es obligatoria.
- **(g)** Cómo probar sin tocar los rastreadores reales.
- **(h)** Cómo hacer que un rastreador real llegue a una máquina local, y por qué
  Cloudflare Tunnel y Tailscale **no** sirven para eso.
- **(i)** Estrategia de migración desde Ruhavik por lotes, con plan de reversa.
- **(j)** Solución de problemas en formato síntoma → causas → verificación.
- **(k)** Checklist final para dar de alta un rastreador nuevo.

## Inventario de mis unidades

Tabla de trabajo para llenar conforme identifiques cada equipo.

| # | Vehículo | Marca/modelo del equipo | IMEI | Protocolo | Puerto | APN | Estado |
|---|---|---|---|---|---|---|---|
| 1 | | | | | | | ⬜ pendiente |
| 2 | | | | | | | ⬜ pendiente |
| 3 | | | | | | | ⬜ pendiente |
| 4 | | | | | | | ⬜ pendiente |
| 5 | | | | | | | ⬜ pendiente |
| 6 | | | | | | | ⬜ pendiente |
| 7 | | | | | | | ⬜ pendiente |
| 8 | | | | | | | ⬜ pendiente |
| 9 | | | | | | | ⬜ pendiente |
| 10 | | | | | | | ⬜ pendiente |

> ⚠️ **No subas esta tabla llena al repositorio público.** Los IMEI identifican
> hardware concreto. Llena tu copia local, o mueve la tabla a un archivo que esté
> en `.gitignore`.
