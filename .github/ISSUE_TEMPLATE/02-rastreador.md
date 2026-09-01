---
name: Un rastreador no conecta
about: Un equipo GPS no llega, o llega y Traccar no lo entiende
title: ''
labels: hardware
---

<!--
ANTES DE ABRIR ESTO, revisa docs/02-conectar-mis-gps.md sección (j):
está en formato síntoma → causas probables → cómo verificarlo, y cubre los
casos más frecuentes.
-->

## Cuál de los tres casos es

- [ ] No llega absolutamente nada al log de Traccar
- [ ] Llega pero Traccar no lo decodifica
- [ ] Se conecta y se desconecta en ciclo
- [ ] Llega pero la unidad aparece como desconocida
- [ ] Otro:

## El equipo

- Marca y modelo:
- Protocolo (si lo sabes):
- Puerto al que apunta:
- Operador del SIM y APN:

## Comprobaciones hechas

- [ ] La unidad está dada de alta en Traccar con su IMEI exacto
- [ ] El puerto está publicado en `infra/docker-compose.yml`
- [ ] Con la app Traccar Client en el celular sí llega (descarta el servidor)
- [ ] El SIM tiene datos (probado en un celular)

## Log de Traccar

<!-- QUITA el IMEI y la dirección IP antes de pegar. -->

```
```
