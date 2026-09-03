#!/usr/bin/env bash
#
# Respalda la base de datos completa (Traccar + esquema app).
#
# Gemelo de backup.ps1. Hace exactamente lo mismo, para que migrar a la
# Raspberry Pi o al VPS no obligue a reaprender el procedimiento.
#
# Uso:
#   ./scripts/backup.sh
#   DESTINO=/mnt/respaldos CONSERVAR=30 ./scripts/backup.sh
#
# Para programarlo a diario a las 3 de la mañana:
#   0 3 * * * /srv/rastreo-propio/scripts/backup.sh >> /var/log/rastreo-backup.log 2>&1

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESTINO="${DESTINO:-$RAIZ/backups}"
CONSERVAR="${CONSERVAR:-14}"
CONTENEDOR="${CONTENEDOR:-rastreo-postgres}"

if [ ! -f "$RAIZ/.env" ]; then
  echo "ERROR: no se encontró $RAIZ/.env. Copia .env.example a .env primero." >&2
  exit 1
fi

# Lectura simple del .env: clave=valor, ignorando comentarios.
POSTGRES_DB=$(grep -E '^\s*POSTGRES_DB=' "$RAIZ/.env" | head -1 | cut -d= -f2- | xargs)
POSTGRES_USER=$(grep -E '^\s*POSTGRES_USER=' "$RAIZ/.env" | head -1 | cut -d= -f2- | xargs)

if [ -z "${POSTGRES_DB:-}" ] || [ -z "${POSTGRES_USER:-}" ]; then
  echo "ERROR: faltan POSTGRES_DB o POSTGRES_USER en el .env" >&2
  exit 1
fi

if [ "$(docker inspect --format '{{.State.Running}}' "$CONTENEDOR" 2>/dev/null)" != "true" ]; then
  echo "ERROR: el contenedor $CONTENEDOR no está corriendo. Ejecuta: pnpm infra:up" >&2
  exit 1
fi

mkdir -p "$DESTINO"
SELLO=$(date +%Y-%m-%d_%H%M%S)
ARCHIVO="$DESTINO/rastreo_${POSTGRES_DB}_${SELLO}.dump"

echo "Respaldando $POSTGRES_DB desde $CONTENEDOR..."

# pg_dump dentro del contenedor, no una copia del volumen: copiar el volumen en
# caliente produce respaldos corruptos. Formato custom (-Fc): comprimido y
# restaurable por partes.
if ! docker exec "$CONTENEDOR" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
      -Fc --no-owner --no-acl > "$ARCHIVO"; then
  rm -f "$ARCHIVO"
  echo "ERROR: pg_dump falló" >&2
  exit 1
fi

TAMANO=$(stat -c%s "$ARCHIVO" 2>/dev/null || stat -f%z "$ARCHIVO")
if [ "$TAMANO" -lt 1024 ]; then
  rm -f "$ARCHIVO"
  echo "ERROR: el respaldo resultó sospechosamente pequeño; se descartó." >&2
  exit 1
fi

# --- Verificación -----------------------------------------------------------
#
# Que el archivo exista y pese lo suyo NO significa que sirva. Un dump truncado
# a la mitad pesa megabytes y solo falla el día que hace falta restaurarlo, que
# es el peor día posible para enterarse.
#
# `pg_restore --list` abre el archivo y lee su índice: si el formato está roto
# o el archivo quedó cortado, falla aquí, mientras todavía existe el original.
#
# Se verifica la copia que quedó EN EL DISCO, no la del contenedor: el punto de
# fallo es la transferencia, así que comprobar el otro lado no probaría nada.
VERIFICACION="/tmp/verificar_$(basename "$ARCHIVO")"

# En Git Bash sobre Windows, MSYS traduce "/tmp/x" a una ruta de Windows antes
# de que docker la reciba, y la verificación no puede ejecutarse. Se intenta
# desactivar, pero `docker cp` hacia el contenedor sigue fallando ahí por otras
# razones (Docker Desktop y el formato host:ruta).
#
# NO se ha invertido más en arreglarlo: este script es el de Linux, que es donde
# corre en producción por cron, y ahí funciona. En Windows existe backup.ps1,
# que verifica correctamente. Lo que sí importa es que, cuando la verificación
# no puede ejecutarse, el respaldo se conserve y se diga — y eso es lo que hace.
export MSYS_NO_PATHCONV=1

# Si la verificación NO SE PUEDE EJECUTAR, el respaldo se conserva y se avisa.
# Antes se borraba, y eso es exactamente al revés: no tener forma de comprobar
# un archivo no es motivo para destruir la única copia que existe. Solo se
# descarta cuando la comprobación se ejecuta y DICE que el archivo está roto.
if ! docker cp "$ARCHIVO" "$CONTENEDOR:$VERIFICACION" >/dev/null 2>&1; then
  echo "AVISO: no se pudo copiar el respaldo al contenedor para verificarlo." >&2
  echo "       El archivo se conserva SIN VERIFICAR: $ARCHIVO" >&2
  echo "       Compruébalo a mano con: pg_restore --list \"$ARCHIVO\"" >&2
  TABLAS='?'
  SIN_VERIFICAR=1
fi

if [ -z "${SIN_VERIFICAR:-}" ]; then
  if ! INDICE=$(docker exec "$CONTENEDOR" pg_restore --list "$VERIFICACION" 2>&1); then
    docker exec "$CONTENEDOR" rm -f "$VERIFICACION" >/dev/null 2>&1 || true
    rm -f "$ARCHIVO"
    echo "$INDICE" >&2
    echo "ERROR: el respaldo no se puede leer; se descartó. NO hay copia utilizable." >&2
    exit 1
  fi
  docker exec "$CONTENEDOR" rm -f "$VERIFICACION" >/dev/null 2>&1 || true
fi

# Un dump válido pero vacío también es inútil, y pg_restore no se queja de eso.
if [ -z "${SIN_VERIFICAR:-}" ]; then
  TABLAS=$(echo "$INDICE" | grep -c 'TABLE DATA' || true)
  if [ "$TABLAS" -lt 1 ]; then
    rm -f "$ARCHIVO"
    echo "ERROR: el respaldo no contiene datos de ninguna tabla; se descartó." >&2
    exit 1
  fi
fi

# La división entera de bash mostraría "0 MB" para cualquier respaldo menor a
# un megabyte, que es justo el caso al empezar. Se cambia de unidad.
if [ "$TAMANO" -lt 1048576 ]; then
  LEGIBLE="$(( TAMANO / 1024 )) KB"
else
  LEGIBLE="$(( TAMANO / 1048576 )) MB"
fi
echo "OK  $(basename "$ARCHIVO")  ($LEGIBLE, $TABLAS tablas verificadas)"

# --- Rotación ---------------------------------------------------------------
if [ "$CONSERVAR" -gt 0 ]; then
  # -print0/-z para no romperse con espacios en las rutas.
  find "$DESTINO" -maxdepth 1 -name 'rastreo_*.dump' -printf '%T@ %p\0' 2>/dev/null |
    sort -zrn | tail -zn "+$((CONSERVAR + 1))" |
    while IFS= read -r -d '' linea; do
      viejo="${linea#* }"
      rm -f "$viejo"
      echo "  eliminado respaldo viejo: $(basename "$viejo")"
    done
fi

echo
echo "Para restaurarlo:"
echo "  ./scripts/restore.sh \"$ARCHIVO\""
