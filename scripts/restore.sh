#!/usr/bin/env bash
#
# Restaura un respaldo de la base de datos.
#
# OPERACIÓN DESTRUCTIVA. Sobrescribe los datos actuales, incluido todo el
# historial de posiciones. Pide confirmación escrita salvo que se pase --force.
#
# Gemelo de restore.ps1.
#
# Uso:
#   ./scripts/restore.sh ./backups/rastreo_traccar_2026-08-31_143000.dump
#   ./scripts/restore.sh --force ./backups/archivo.dump

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTENEDOR="${CONTENEDOR:-rastreo-postgres}"
FORCE=0
ARCHIVO=""

for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    *) ARCHIVO="$arg" ;;
  esac
done

if [ -z "$ARCHIVO" ]; then
  echo "Uso: $0 [--force] <archivo.dump>" >&2
  exit 1
fi
if [ ! -f "$ARCHIVO" ]; then
  echo "ERROR: no existe el archivo: $ARCHIVO" >&2
  exit 1
fi

POSTGRES_DB=$(grep -E '^\s*POSTGRES_DB=' "$RAIZ/.env" | head -1 | cut -d= -f2- | xargs)
POSTGRES_USER=$(grep -E '^\s*POSTGRES_USER=' "$RAIZ/.env" | head -1 | cut -d= -f2- | xargs)

if [ -z "${POSTGRES_DB:-}" ] || [ -z "${POSTGRES_USER:-}" ]; then
  echo "ERROR: faltan POSTGRES_DB o POSTGRES_USER en el .env" >&2
  exit 1
fi

if [ "$(docker inspect --format '{{.State.Running}}' "$CONTENEDOR" 2>/dev/null)" != "true" ]; then
  echo "ERROR: el contenedor $CONTENEDOR no está corriendo." >&2
  exit 1
fi

TAMANO=$(stat -c%s "$ARCHIVO" 2>/dev/null || stat -f%z "$ARCHIVO")
if [ "$TAMANO" -lt 1048576 ]; then
  LEGIBLE="$(( TAMANO / 1024 )) KB"
else
  LEGIBLE="$(( TAMANO / 1048576 )) MB"
fi

echo
echo "  ATENCIÓN: esto SOBRESCRIBE la base de datos actual."
echo "  Se perderá todo el historial de posiciones posterior al respaldo."
echo
echo "  Archivo : $(basename "$ARCHIVO")  ($LEGIBLE)"
echo "  Destino : base '$POSTGRES_DB' en el contenedor '$CONTENEDOR'"
echo

if [ "$FORCE" -ne 1 ]; then
  read -r -p "  Escribe RESTAURAR para continuar: " respuesta
  if [ "$respuesta" != "RESTAURAR" ]; then
    echo "Cancelado."
    exit 0
  fi
fi

# Traccar tiene que dejar de escribir durante la restauración. PostgreSQL sigue
# arriba, porque es donde corre pg_restore.
TRACCAR_ARRIBA=0
if [ "$(docker inspect --format '{{.State.Running}}' rastreo-traccar 2>/dev/null)" = "true" ]; then
  TRACCAR_ARRIBA=1
  echo "Deteniendo Traccar para que no escriba durante la restauración..."
  docker stop rastreo-traccar > /dev/null
fi

# Se relevanta Traccar pase lo que pase, incluso si pg_restore falla.
levantar_traccar() {
  if [ "$TRACCAR_ARRIBA" -eq 1 ]; then
    echo "Volviendo a levantar Traccar..."
    docker start rastreo-traccar > /dev/null
  fi
}
trap levantar_traccar EXIT

echo "Restaurando..."

# --clean --if-exists borra los objetos antes de recrearlos. Sin eso, la
# restauración falla en cada tabla que ya existe.
# pg_restore devuelve != 0 por avisos que no son errores reales (por ejemplo,
# intentar borrar algo que no existía), así que no se aborta con set -e.
if docker exec -i "$CONTENEDOR" pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
     --clean --if-exists --no-owner --no-acl < "$ARCHIVO"; then
  echo "Restauración terminada."
else
  echo "pg_restore terminó con avisos (código $?). Suele ser normal."
fi

echo
echo "Comprueba que todo está en su sitio:"
echo "  pnpm infra:ps"
echo "  curl http://localhost:3000/api/units"
