# Cómo contribuir

Este es un proyecto personal, pero está abierto: si te sirve, úsalo, y si
encuentras algo roto o quieres proponer una mejora, adelante.

## Antes de escribir código

Lee [`docs/adr/`](docs/adr/). Ahí están las decisiones de fondo con su motivo, y
te ahorra proponer algo que ya se descartó y por qué.

## Arrancar el entorno

Todo el paso a paso está en
[`docs/01-instalacion-local.md`](docs/01-instalacion-local.md). En corto:

```powershell
pnpm install
Copy-Item .env.example .env    # y rellena POSTGRES_PASSWORD
pnpm infra:up                  # Traccar + PostgreSQL
pnpm dev                       # API + frontend
pnpm simulate --units 10       # flota simulada, en otra terminal
```

## Antes de abrir un pull request

```powershell
pnpm lint
pnpm typecheck
pnpm test
```

Los tres tienen que pasar. El CI corre exactamente eso, más el build.

## Reglas del proyecto

Son pocas, y todas tienen un motivo detrás.

**TypeScript estricto, sin `any` ni `@ts-ignore`.** No es purismo: el proyecto
convierte unidades (nudos a km/h, metros a kilómetros, milisegundos a horas) y
un error ahí no lanza ninguna excepción, solo muestra un número equivocado.
ESLint lo verifica.

**Las tablas `tc_*` se leen, nunca se escriben.** Son de Traccar, que las migra
solo en cada arranque. Lo nuestro va en el esquema `app`. Ver
[ADR 0004](docs/adr/0004-schema-app-separado.md).

**Nada de servicios de pago.** Ni Google Maps, ni Mapbox, ni nada que cobre por
uso. Ver [ADR 0003](docs/adr/0003-maplibre-openfreemap.md).

**Nada de decodificadores de protocolo.** Para eso está Traccar. Ver
[ADR 0001](docs/adr/0001-motor-traccar.md).

**Cero secretos, IMEIs reales o IPs reales en el repositorio.** Usa siempre
valores de ejemplo. Para IPs, el rango de documentación `203.0.113.0/24`
(RFC 5737), que nunca se enruta.

**Los comandos de la documentación van en PowerShell.** El entorno de
referencia es Windows 11 nativo. Si algo solo existe en Linux, busca la
alternativa de Windows o resuélvelo con un script de Node.

**Si tocas un comando SMS de un rastreador, cita la fuente.** Un comando
inventado puede dejar un equipo apuntando a un servidor inexistente, y entonces
ya no responde ni por SMS: hay que desmontarlo del vehículo. Si no puedes
verificarlo contra el manual del fabricante, márcalo como
"verificar contra el manual del modelo" en vez de rellenarlo con algo plausible.

## Estilo del código

- **Comentarios y documentación en español.** Nombres de variables, funciones,
  ramas y mensajes de commit en inglés.
- **Los comentarios explican el porqué, no el qué.** El código ya dice lo que
  hace. El comentario dice por qué se hizo así, o qué pasa si se cambia.
- **La documentación se escribe con el código, no después.** Un cambio que
  invalida algo de `docs/` no está terminado hasta que lo actualiza.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), un commit por
entregable lógico.

```
feat(api): allow renaming a unit and changing its vehicle type
fix(web): keep the map from chasing the selected unit
docs: record the map rendering trade-off
```

El cuerpo del mensaje explica el **porqué** y lo que se descartó. Es lo que
convierte un historial en documentación.

## Estructura

```
apps/api/      BFF en Fastify. Lo único que conoce el token de Traccar.
apps/web/      Frontend React + MapLibre.
infra/         Docker Compose, traccar.xml, Caddyfile de ejemplo.
scripts/       Simulador de flota, respaldos.
docs/          Guías y ADRs.
```
