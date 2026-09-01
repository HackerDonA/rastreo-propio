#!/usr/bin/env bash
#
# Borra posiciones antiguas del historial. Gemelo de purge-history.ps1.
#
# Traccar 6.15 NO tiene retencion automatica: la clave database.historyDays fue
# eliminada. Este script es el sustituto, y viene APAGADO por omision.
#
# QUE PROTEGE, Y POR QUE IMPORTA
# ------------------------------
# tc_devices.positionid apunta a la ultima posicion de cada unidad, pero Traccar
# NO define una clave foranea sobre esa columna. Borrar esa fila no da ningun
# error: deja una referencia colgante, y la unidad desaparece del mapa sin que
# nada lo explique. Por eso la consulta la excluye explicitamente.
#
# Uso:
#   ./scripts/purge-history.sh 365              # solo informa
#   ./scripts/purge-history.sh 365 --confirmar  # borra de verdad

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTENEDOR="${CONTENEDOR:-rastreo-postgres}"
DIAS="${1:-365}"
CONFIRMAR=0
for arg in "$@"; do
  [ "$arg" = "--confirmar" ] && CONFIRMAR=1
done

if ! [[ "$DIAS" =~ ^[0-9]+$ ]] || [ "$DIAS" -lt 7 ] || [ "$DIAS" -gt 3650 ]; then
  echo "ERROR: los dias deben ser un numero entre 7 y 3650" >&2
  exit 1
fi

POSTGRES_DB=$(grep -E '^\s*POSTGRES_DB=' "$RAIZ/.env" | head -1 | cut -d= -f2- | xargs)
POSTGRES_USER=$(grep -E '^\s*POSTGRES_USER=' "$RAIZ/.env" | head -1 | cut -d= -f2- | xargs)
if [ -z "${POSTGRES_DB:-}" ] || [ -z "${POSTGRES_USER:-}" ]; then
  echo "ERROR: faltan POSTGRES_DB o POSTGRES_USER en el .env" >&2
  exit 1
fi

if [ "$(docker inspect --format '{{.State.Running}}' "$CONTENEDOR" 2>/dev/null)" != "true" ]; then
  echo "ERROR: el contenedor $CONTENEDOR no esta corriendo. Ejecuta: pnpm infra:up" >&2
  exit 1
fi

# La condicion se define UNA vez y se usa para contar y para borrar, para que lo
# que se informa sea exactamente lo que se borra.
CONDICION="fixtime < now() - interval '$DIAS days'
  AND id NOT IN (SELECT positionid FROM tc_devices WHERE positionid IS NOT NULL)"

echo
echo "  Analizando posiciones anteriores a $DIAS dias..."

RESUMEN=$(docker exec "$CONTENEDOR" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -A -F '|' -c "
SELECT
  (SELECT count(*) FROM tc_positions),
  (SELECT count(*) FROM tc_positions WHERE $CONDICION),
  pg_size_pretty(pg_total_relation_size('tc_positions'));
")

TOTAL=$(echo "$RESUMEN" | cut -d'|' -f1 | xargs)
A_BORRAR=$(echo "$RESUMEN" | cut -d'|' -f2 | xargs)
TAMANO=$(echo "$RESUMEN" | cut -d'|' -f3 | xargs)

echo
echo "  Total de posiciones : $TOTAL"
echo "  Tamano en disco     : $TAMANO"
echo "  Se borrarian        : $A_BORRAR"
echo "  Quedarian           : $(( TOTAL - A_BORRAR ))"
echo

if [ "$A_BORRAR" -eq 0 ]; then
  echo "  No hay nada que borrar."
  exit 0
fi

if [ "$CONFIRMAR" -ne 1 ]; then
  echo "  Modo informativo. No se borro nada."
  echo "  Para borrar de verdad, vuelve a ejecutarlo con --confirmar"
  echo
  echo "  ANTES DE HACERLO: respalda."
  echo "    ./scripts/backup.sh"
  exit 0
fi

echo "  ATENCION: esto es IRREVERSIBLE."
read -r -p "  Escribe BORRAR para continuar: " respuesta
if [ "$respuesta" != "BORRAR" ]; then
  echo "Cancelado."
  exit 0
fi

echo "  Borrando..."

# Por lotes y no en una sola sentencia: un DELETE de millones de filas mantiene
# una transaccion abierta durante minutos, bloquea la tabla y Traccar no puede
# insertar posiciones nuevas mientras tanto.
TOTAL_BORRADAS=0
while true; do
  SALIDA=$(docker exec "$CONTENEDOR" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -A -c "
WITH lote AS (
  SELECT id FROM tc_positions WHERE $CONDICION LIMIT 50000
)
DELETE FROM tc_positions WHERE id IN (SELECT id FROM lote);
")
  N=$(echo "$SALIDA" | grep -oE 'DELETE [0-9]+' | grep -oE '[0-9]+' || echo 0)
  [ "$N" -eq 0 ] && break
  TOTAL_BORRADAS=$(( TOTAL_BORRADAS + N ))
  echo "    $TOTAL_BORRADAS borradas..."
done

echo
echo "  Listo: $TOTAL_BORRADAS posiciones borradas."
echo
# El espacio no vuelve al sistema operativo hasta que PostgreSQL reorganiza la
# tabla. VACUUM normal lo reutiliza internamente; VACUUM FULL lo devuelve pero
# bloquea la tabla mientras corre.
echo "  Para que PostgreSQL reutilice el espacio:"
echo "    docker exec $CONTENEDOR psql -U $POSTGRES_USER -d $POSTGRES_DB -c 'VACUUM ANALYZE tc_positions;'"
