#!/bin/sh
# Revisa si hay datos de OpenStreetMap más nuevos que el mapa del servidor y,
# si los hay, vuelve a armar vector.pmtiles. Pensado para cron (una vez por mes; el criterio de MIN_DAYS evita reconstruir si no hay datos nuevos):
#
#   0 4 1 * * sh ~/vikarg/server/src/maps/update-maps.sh ~/vikarg/deploy/maps
#
# La elevación (Terrain Tiles de AWS) es un conjunto fijo: no se regenera.
# El archivo nuevo reemplaza al anterior recién cuando está completo, y el
# servidor lo abre solo al ver que cambió. Deja el registro en update.log.
set -eu

MAPS=$(cd "${1:?Uso: update-maps.sh /ruta/maps}" && pwd)
HERE=$(cd "$(dirname "$0")" && pwd)
LOG="$MAPS/update.log"
SRC="$MAPS/planetiler/sources"
PBF_URL=https://download.geofabrik.de/south-america-latest.osm.pbf
WATER=https://osmdata.openstreetmap.de/download/water-polygons-split-3857.zip
WATER_COPY=https://web.archive.org/web/20260107000623id_/$WATER
MIN_DAYS=${MIN_DAYS:-30}

exec >>"$LOG" 2>&1
echo "== $(date '+%F %T') revisando"

# Una sola corrida a la vez.
exec 9>"$MAPS/.update.lock"
if ! flock -n 9; then echo "ya hay otra actualización corriendo"; exit 0; fi

remote=$(curl -sSfIL -m 60 "$PBF_URL" | tr -d '\r' | awk -F': ' 'tolower($1)=="last-modified"{v=$2} END{print v}')
if [ -z "$remote" ]; then echo "Geofabrik no responde; se reintenta en la próxima corrida"; exit 1; fi
remote_s=$(date -d "$remote" +%s)
local_s=$(stat -c %Y "$MAPS/vector.pmtiles" 2>/dev/null || echo 0)
if [ $((remote_s - local_s)) -lt $((MIN_DAYS * 86400)) ]; then
  echo "el mapa está al día (OSM del $(date -d "$remote" +%F))"
  exit 0
fi
echo "hay datos nuevos (OSM del $(date -d "$remote" +%F)); armando el mapa"

# Los archivos bajados quedan de root (los crea Docker): se borran con Docker.
clean() { docker run --rm -v "$SRC:/s" alpine:3.20 rm -f "$@"; }
mkdir -p "$SRC"
clean /s/south_america.osm.pbf /s/south_america.osm.pbf_inprogress
water_url=$WATER
if curl -sSf -m 30 -o /dev/null -I "$WATER"; then
  clean /s/water-polygons-split-3857.zip
elif [ -n "$(ls "$SRC"/water-polygons-split-3857.zip 2>/dev/null)" ]; then
  echo "osmdata no responde: se usa el agua de la corrida anterior"
else
  echo "osmdata no responde: se usa la copia del Wayback Machine"
  water_url=$WATER_COPY
fi

before=$(stat -c %s "$MAPS/vector.pmtiles" 2>/dev/null || echo 0)
MEMORY=${MEMORY:-7g} WATER_URL=$water_url sh "$HERE/build-vector.sh" "$MAPS"
after=$(stat -c %s "$MAPS/vector.pmtiles")
echo "listo: $((before / 1048576)) MB -> $((after / 1048576)) MB"
# La base de calles y números (para «Mi ubicación» y «Buscar cercanos») se arma con este mismo extracto antes de borrarlo. Si falla, el mapa
# ya quedó listo y el servidor sigue con la base anterior (o con los servicios públicos si no había).
OSM_BUILD="$HERE/../../../tools/osm-index/build.sh"
if [ -f "$OSM_BUILD" ]; then
  echo "armando la base de calles y números"
  sh "$OSM_BUILD" "$SRC/south_america.osm.pbf" "$MAPS/../osm" || echo "no se pudo armar la base de calles y números"
fi
# Un archivo de OpenStreetMap por país para las herramientas de datos (países, emergencias y servicios), sin Overpass (tools/lib/osm-local.mjs).
OSM_COUNTRIES="$HERE/../../../tools/osm-index/countries.sh"
if [ -f "$OSM_COUNTRIES" ]; then
  echo "armando los archivos por país para las herramientas de datos"
  sh "$OSM_COUNTRIES" "$SRC/south_america.osm.pbf" "$MAPS/../osm" || echo "no se pudieron armar los archivos por país (las herramientas usan Overpass)"
fi
clean /s/south_america.osm.pbf
