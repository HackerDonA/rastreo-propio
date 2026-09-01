## Qué cambia

<!-- Una o dos frases. Si cierra un issue: "Cierra #123". -->

## Por qué

<!--
El motivo, no la descripción del diff. Qué problema resuelve, o qué decisión
hay detrás. Esto es lo que va a leer alguien dentro de seis meses.
-->

## Cómo se probó

<!-- Qué corriste y qué viste. "Debería funcionar" no cuenta. -->

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] Probado a mano con `pnpm dev` y el simulador

## Lista de verificación

- [ ] Sin `any` ni `@ts-ignore`
- [ ] Sin secretos, IMEIs reales ni IPs reales
- [ ] No escribe en las tablas `tc_*` de Traccar
- [ ] La documentación afectada quedó actualizada en el mismo cambio
- [ ] Los comandos nuevos de la documentación están en PowerShell
