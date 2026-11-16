#!/bin/sh
# Vuelve a generar cada mes los paquetes de datos que cambian (parques de
# Argentina y de Chile, comisarías, bomberos y salud de Chile, Uruguay, Bolivia y Perú,
# y los servicios de "Buscar cercanos" de los cinco países: estaciones, gomerías,
# talleres, farmacias, DEA, veterinarias, agua, refugios y cajeros) con
# las mismas herramientas del repositorio (tools/), y los deja donde los sirve
# el servidor (GET /api/data/:file). La app usa la copia del servidor si es más
# nueva que la que trae. Pensado para cron, igual que los mapas:
#
#   0 5 3,17 * * sh ~/vikarg/server/src/data/update-data.sh ~/vikarg/deploy/data-packs
#
# Dos veces por mes: si una fuente (por ejemplo Overpass) está caída o lenta, queda el
# paquete anterior y se reintenta en la otra corrida.
#
# Cada archivo nuevo reemplaza al anterior solo si es JSON válido, trae fecha
# (generatedAt) y no es mucho más chico que el anterior (si una fuente cambió
# o falló, queda el que estaba). Registro en update.log.
set -u

PACKS=$(mkdir -p "${1:?Uso: update-data.sh /ruta/data-packs}" && cd "$1" && pwd)
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../../.." && pwd)
LOG="$PACKS/update.log"
IMAGE=${NODE_IMAGE:-node:22-alpine}
MIN_RATIO=${MIN_RATIO:-0.6}

exec >>"$LOG" 2>&1
echo "== $(date '+%F %T') regenerando paquetes de datos"

exec 9>"$PACKS/.update.lock"
if ! flock -n 9; then echo "ya hay otra actualización corriendo"; exit 0; fi

TMP=$(mktemp -d "$PACKS/.tmp.XXXXXX")
trap 'rm -rf "$TMP"' EXIT

run() {
  docker run --rm --user "$(id -u):$(id -g)" -v "$REPO:/repo:ro" -v "$TMP:/out" -e VIKARG_DATA_OUT=/out "$IMAGE" node "$@"
}

# Reemplaza solo si el archivo nuevo es razonable.
accept() {
  python3 - "$TMP/$1" "$PACKS/$1" "$MIN_RATIO" <<'PY'
import json, os, sys
new, old, ratio = sys.argv[1], sys.argv[2], float(sys.argv[3])
try:
    data = json.load(open(new, encoding='utf-8'))
except Exception as e:
    print(f"   JSON inválido: {e}"); sys.exit(1)
if not data.get('generatedAt'):
    print("   sin generatedAt"); sys.exit(1)
if os.path.exists(old) and os.path.getsize(new) < ratio * os.path.getsize(old):
    print(f"   mucho más chico que el anterior ({os.path.getsize(new)} contra {os.path.getsize(old)} bytes)"); sys.exit(1)
PY
}

step() {
  file=$1
  shift
  echo "-- $file"
  if ! run "$@"; then echo "   falló la herramienta: queda el anterior"; return; fi
  if [ ! -s "$TMP/$file" ]; then echo "   no se generó: queda el anterior"; return; fi
  if accept "$file"; then
    mv -f "$TMP/$file" "$PACKS/$file"
    echo "   listo ($(wc -c <"$PACKS/$file") bytes)"
  else
    echo "   descartado: queda el anterior"
  fi
}

step parks-AR.json /repo/tools/emergency-data/parks.mjs
step parks-CL.json /repo/tools/emergency-data/parks-cl.mjs
step parks-BO.json /repo/tools/emergency-data/parks-bo.mjs
step parks-PE.json /repo/tools/emergency-data/parks-pe.mjs
step parks-PY.json /repo/tools/emergency-data/parks-py.mjs
step parks-UY.json /repo/tools/emergency-data/parks-uy.mjs
step CL.json /repo/tools/country-data/build.mjs CL
step UY.json /repo/tools/country-data/build.mjs UY
step BO.json /repo/tools/country-data/build.mjs BO
step PE.json /repo/tools/country-data/build.mjs PE
step PY.json /repo/tools/country-data/build.mjs PY
# Servicios de "Buscar cercanos": un archivo por categoría y país.
for cc in AR CL UY BO PE PY; do
  for cat in fuel tyres repair pharmacy aed vet water shelter atm nautical; do step "$cat-$cc.json" /repo/tools/services-data/build.mjs "$cc" "$cat"; done
done
echo "== $(date '+%F %T') terminado"
