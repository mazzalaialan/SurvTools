#!/bin/sh
# Un archivo de OpenStreetMap por país (lugares de emergencia, salud y servicios) para las herramientas de datos, sin Overpass.
#   sh tools/osm-index/countries.sh <extracto.osm.pbf> <carpeta-de-salida> [PAÍSES]
# Deja <salida>/countries/places-<PAÍS>.jsonl (lo lee tools/lib/osm-local.mjs). Los países se recortan con su frontera de OpenStreetMap (la
# relación `boundary=administrative` de nivel 2, la misma de `area["ISO3166-1"=...]` de Overpass). Ojo: los `.poly` de Geofabrik NO sirven,
# son el borde de su extracto con margen hacia los países vecinos (probado: 1.742 lugares «de Paraguay» caían en Argentina). Usa osmium y
# Node en Docker. Ver README.md.
set -eu

PBF=$(readlink -f "${1:?Uso: countries.sh extracto.osm.pbf carpeta-de-salida [AR CL UY BO PE PY]}")
OUT=$(mkdir -p "$2/countries" && cd "$2/countries" && pwd)
shift 2
COUNTRIES=${*:-AR CL UY BO PE PY}
HERE=$(cd "$(dirname "$0")" && pwd)
WORK="$OUT/work"
mkdir -p "$WORK"
SRC_DIR=$(dirname "$PBF")
SRC_NAME=$(basename "$PBF")

docker build -q -t vikarg-osmium "$HERE" >/dev/null
osm() { docker run --rm -v "$SRC_DIR:/in:ro" -v "$WORK:/w" -w /w vikarg-osmium "$@"; }
jsnode() { docker run --rm -i -v "$HERE:/t:ro" node:26-alpine node "$@"; }
clean() { docker run --rm -v "$WORK:/w" alpine:3.20 sh -c 'rm -rf /w/*'; }
# Relación de OpenStreetMap con la frontera de cada país (admin_level=2).
relation_id() {
  case "$1" in AR) echo 286393;; CL) echo 167454;; UY) echo 287072;; BO) echo 252645;; PE) echo 288247;; PY) echo 287077;; *) echo "país desconocido: $1" >&2; return 1;; esac
}

echo "filtrando los lugares"
osm tags-filter "/in/$SRC_NAME" \
  nwr/amenity=fire_station,police,hospital,clinic,ranger_station,doctors,pharmacy,fuel,veterinary,drinking_water,water_point,boat_storage,boat_rental,atm,bank,shelter \
  nwr/healthcare=hospital,clinic,centre,pharmacy nwr/emergency=defibrillator nwr/shop=tyres,car_repair,boat,boat_repair,ship_chandler \
  nwr/man_made=water_tap,pier nwr/natural=spring nwr/tourism=alpine_hut,wilderness_hut nwr/waterway=fuel nwr/leisure=marina,slipway \
  nwr/craft=boatbuilder nwr/mooring nwr/seamark:type=mooring -o places.pbf --overwrite

echo "extrayendo las fronteras"
ids=""
for cc in $COUNTRIES; do ids="$ids r$(relation_id "$cc")"; done
# shellcheck disable=SC2086
osm getid -r "/in/$SRC_NAME" $ids -o borders.pbf --overwrite

for cc in $COUNTRIES; do
  echo "$cc: frontera y recorte"
  # En osmium, `getid -r` trae la relación con sus caminos y nodos; `export` arma el multipolígono del país.
  osm getid -r borders.pbf "r$(relation_id "$cc")" -o "border-$cc.pbf" --overwrite
  # Solo el contorno del país: la relación trae otras fronteras como miembros (islas), que no son el país.
  osm export "border-$cc.pbf" -f geojsonseq --add-unique-id=type_id --geometry-types=polygon -o - | jsnode /t/pickarea.mjs "$(relation_id "$cc")" > "$WORK/$cc.geojson"
  osm extract -p "$cc.geojson" places.pbf -o "places-$cc.pbf" --overwrite
  osm export "places-$cc.pbf" -f geojsonseq --add-unique-id=type_id --geometry-types=point,polygon -o - | jsnode /t/flatten.mjs > "$OUT/places-$cc.jsonl.new"
  mv "$OUT/places-$cc.jsonl.new" "$OUT/places-$cc.jsonl"
done
clean
echo "listo: $(ls "$OUT"/places-*.jsonl | wc -l) países en $OUT"
