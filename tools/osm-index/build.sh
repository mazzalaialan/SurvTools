#!/bin/sh
# Arma la base de calles, números de puerta y kilómetros (para «Mi ubicación») desde el extracto de Geofabrik, con osmium en Docker.
#   sh tools/osm-index/build.sh <extracto.osm.pbf> <carpeta de salida> [W,S,E,N]
# Deja <salida>/around.sqlite (se escribe aparte y se renombra al final: el servidor nunca ve una base a medias).
# © OpenStreetMap contributors, ODbL. Ver README.md.
set -eu

PBF=$(readlink -f "${1:?Uso: build.sh extracto.osm.pbf carpeta-de-salida [W,S,E,N]}")
OUT=$(mkdir -p "${2:?}" && cd "$2" && pwd)
# Argentina, Chile, Uruguay, Bolivia, Perú y Paraguay (con algo de los países vecinos): el extracto es de toda Sudamérica.
BBOX=${3:--82,-56,-52,0.5}
HERE=$(cd "$(dirname "$0")" && pwd)
WORK="$OUT/work"
mkdir -p "$WORK"
SRC_DIR=$(dirname "$PBF")
SRC_NAME=$(basename "$PBF")

docker build -q -t vikarg-osmium "$HERE" >/dev/null
# Los archivos de trabajo los crea Docker (root): se borran con Docker.
osm() { docker run --rm -v "$SRC_DIR:/in:ro" -v "$WORK:/w" -w /w vikarg-osmium "$@"; }
clean() { docker run --rm -v "$WORK:/w" alpine:3.20 sh -c 'rm -rf /w/*'; }

echo "recortando a $BBOX"
osm extract -b "$BBOX" "/in/$SRC_NAME" -o region.pbf --overwrite
echo "filtrando"
osm tags-filter region.pbf w/highway=motorway,trunk,primary,secondary,tertiary,unclassified,residential,living_street,road,motorway_link,trunk_link,primary_link,secondary_link,tertiary_link -o roads.pbf --overwrite
osm tags-filter region.pbf nwr/addr:housenumber -o numbers.pbf --overwrite
osm tags-filter region.pbf n/highway=milestone -o milestones.pbf --overwrite
osm tags-filter region.pbf nwr/amenity=police,fire_station,hospital,clinic,pharmacy,fuel,veterinary,drinking_water,water_point,boat_storage,boat_rental,atm,bank,shelter nwr/emergency=ambulance_station,defibrillator nwr/healthcare=pharmacy nwr/shop=tyres,car_repair,boat,boat_repair,ship_chandler nwr/office=government nwr/man_made=water_tap,pier nwr/natural=spring nwr/tourism=alpine_hut,wilderness_hut nwr/waterway=fuel nwr/leisure=marina,slipway nwr/craft=boatbuilder nwr/mooring nwr/seamark:type=mooring -o places.pbf --overwrite

TMP="$OUT/around.sqlite.new"
rm -f "$TMP"
for kind in roads numbers milestones places; do
  echo "cargando $kind"
  osm export "$kind.pbf" -f geojsonseq --add-unique-id=type_id --geometry-types="$( [ "$kind" = roads ] && echo linestring || echo point,polygon )" -o - | node "$HERE/import.mjs" "$TMP" "$kind"
done
node -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.argv[1]);
db.exec('CREATE INDEX road_cell ON road(cell); CREATE INDEX num_cell ON num(cell); CREATE INDEX mile_cell ON mile(cell); CREATE INDEX place_cell ON place(cell);');
db.exec('CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)');
db.prepare('INSERT INTO meta VALUES (?, ?)').run('builtAt', new Date().toISOString());
db.prepare('INSERT INTO meta VALUES (?, ?)').run('source', process.argv[2]);
db.close();
" "$TMP" "$SRC_NAME"
mv "$TMP" "$OUT/around.sqlite"
clean
echo "listo: $OUT/around.sqlite ($(du -h "$OUT/around.sqlite" | cut -f1))"
