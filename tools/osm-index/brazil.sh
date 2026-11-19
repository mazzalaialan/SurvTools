#!/bin/sh
# Un archivo de OpenStreetMap de la región Sul + Mato Grosso do Sul de Brasil (RS, SC, PR y MS) para las herramientas de datos, sin Overpass.
#   sh tools/osm-index/brazil.sh <sul.osm.pbf> <centro-oeste.osm.pbf> <carpeta-de-salida>
# Deja <salida>/places-BR.jsonl (mismo formato que countries.sh; lo lee tools/lib/osm-local.mjs con OSM_LOCAL_DIR=<salida>).
# Brasil entero pesa 2,0 GB (Geofabrik): se parte por región. Los extractos son los de Geofabrik (south-america/brazil/sul y centro-oeste;
# descarga única, con User-Agent `VikArg-Prepping-Tools/1.0`). Se recorta con las fronteras de OpenStreetMap de los cuatro estados (relaciones
# `boundary=administrative`, admin_level=4, con ISO3166-2 BR-RS, BR-SC, BR-PR y BR-MS), NO con los `.poly` de Geofabrik (traen margen: ver
# countries.sh). Así lo que cae en São Paulo, Mato Grosso, Goiás, Argentina o Paraguay queda afuera. Usa osmium y Node en Docker.
# Datos © colaboradores de OpenStreetMap, ODbL.
set -eu

SUL=$(readlink -f "${1:?Uso: brazil.sh sul.osm.pbf centro-oeste.osm.pbf carpeta-de-salida}")
CO=$(readlink -f "${2:?falta el extracto del centro-oeste}")
OUT=$(mkdir -p "$3" && cd "$3" && pwd)
HERE=$(cd "$(dirname "$0")" && pwd)
WORK="$OUT/work"
mkdir -p "$WORK"
IN_SUL=$(dirname "$SUL"); N_SUL=$(basename "$SUL")
IN_CO=$(dirname "$CO"); N_CO=$(basename "$CO")

docker build -q -t vikarg-osmium "$HERE" >/dev/null
# Un contenedor por vez. Los extractos se montan solo lectura en /sul y /co.
osm() { docker run --rm -v "$IN_SUL:/sul:ro" -v "$IN_CO:/co:ro" -v "$WORK:/w" -w /w vikarg-osmium "$@"; }
jsnode() { docker run --rm -i -v "$HERE:/t:ro" -v "$WORK:/w:ro" node:26-alpine node "$@"; }
clean() { docker run --rm -v "$WORK:/w" alpine:3.20 sh -c 'rm -rf /w/*'; }

FILTER="nwr/amenity=fire_station,police,hospital,clinic,ranger_station,doctors,pharmacy,fuel,veterinary,drinking_water,water_point,boat_storage,boat_rental,atm,bank,shelter \
  nwr/healthcare=hospital,clinic,centre,pharmacy nwr/emergency=defibrillator nwr/shop=tyres,car_repair,boat,boat_repair,ship_chandler \
  nwr/man_made=water_tap,pier nwr/natural=spring nwr/tourism=alpine_hut,wilderness_hut nwr/waterway=fuel nwr/leisure=marina,slipway \
  nwr/craft=boatbuilder nwr/mooring nwr/seamark:type=mooring"

for r in sul co; do
  if [ "$r" = sul ]; then SRC="/sul/$N_SUL"; else SRC="/co/$N_CO"; fi
  echo "$r: filtrando los lugares"
  # shellcheck disable=SC2086
  osm tags-filter "$SRC" $FILTER -o "places-$r.pbf" --overwrite
  echo "$r: buscando las fronteras de los estados"
  osm tags-filter "$SRC" r/ISO3166-2=BR-RS,BR-SC,BR-PR,BR-MS -R -o "states-$r.pbf" --overwrite
  osm cat "states-$r.pbf" -f opl -o "states-$r.opl" --overwrite
done
# Ids de las relaciones de cada estado (admin_level=4 y boundary=administrative; ISO3166-2 también la llevan otras relaciones).
ids_of() { awk '/^r/ && /admin_level=4/ && /boundary=administrative/ && /ISO3166-2=BR-(RS|SC|PR|MS)/ { sub(/^r/, "", $1); print $1 }' "$@" | sort -u; }
ids=$(ids_of "$WORK"/states-*.opl)
echo "relaciones: $(echo $ids)"
[ "$(echo "$ids" | wc -l)" -eq 4 ] || { echo "se esperaban 4 relaciones de estados, hay: $ids" >&2; exit 1; }

for r in sul co; do
  if [ "$r" = sul ]; then SRC="/sul/$N_SUL"; else SRC="/co/$N_CO"; fi
  # Cada estado se pide al extracto que lo tiene (osmium getid falla si un id no está): los de su región; los vecinos pueden aparecer cortados
  # en el otro, y se juntan después (los caminos y nodos de uno completan al otro).
  mine=$(ids_of "$WORK/states-$r.opl")
  # shellcheck disable=SC2086
  osm getid -r "$SRC" $(for i in $mine; do printf 'r%s ' "$i"; done) -o "borders-$r.pbf" --overwrite || echo "aviso: getid no encontró algún miembro de las relaciones en $r (normal en los estados vecinos, que vienen cortados); se verifica al armar el contorno"
done
osm merge borders-sul.pbf borders-co.pbf -o borders.pbf --overwrite
echo "armando el contorno de los cuatro estados"
# shellcheck disable=SC2046
osm export borders.pbf -f geojsonseq --add-unique-id=type_id --geometry-types=polygon -o - | jsnode /t/pickareas.mjs $ids > "$WORK/BR.geojson"

osm merge places-sul.pbf places-co.pbf -o places.pbf --overwrite
echo "recorte"
osm extract -p BR.geojson places.pbf -o places-BR.pbf --overwrite
osm export places-BR.pbf -f geojsonseq --add-unique-id=type_id --geometry-types=point,polygon -o - | jsnode /t/flatten.mjs > "$OUT/places-BR.jsonl.new"
mv "$OUT/places-BR.jsonl.new" "$OUT/places-BR.jsonl"
# Fecha del extracto (la de la réplica de Geofabrik, en la cabecera del .pbf) y qué cubre, para los metadatos de los paquetes.
# El contenedor de osmium no tiene `date`: se lee con fileinfo del extracto original.
TS_SUL=$(osm fileinfo -g header.option.osmosis_replication_timestamp "/sul/$N_SUL")
TS_CO=$(osm fileinfo -g header.option.osmosis_replication_timestamp "/co/$N_CO")
cat > "$OUT/meta-BR.json" <<EOF
{"country":"BR","coverage":"Sul y Mato Grosso do Sul (RS, SC, PR, MS)","states":["BR-RS","BR-SC","BR-PR","BR-MS"],"source":"OpenStreetMap, extractos de Geofabrik (sul y centro-oeste)","license":"ODbL","extractDate":"$(echo "$TS_SUL" | cut -c1-10)","extractTimestamps":{"sul":"$TS_SUL","centro-oeste":"$TS_CO"}}
EOF
cp "$WORK/BR.geojson" "$OUT/border-BR.geojson"
clean
echo "listo: $(wc -l < "$OUT/places-BR.jsonl") lugares en $OUT/places-BR.jsonl"
