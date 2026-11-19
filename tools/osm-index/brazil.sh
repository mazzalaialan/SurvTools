#!/bin/sh
# Un archivo de OpenStreetMap de UN sector de Brasil (macrorregión del IBGE) para las herramientas de datos, sin Overpass.
#   sh tools/osm-index/brazil.sh <sector> <extracto.osm.pbf> <carpeta-de-salida>   (prepara el sector y lo arma si puede)
#   sh tools/osm-index/brazil.sh <sector> - <carpeta-de-salida>                       (solo arma, con lo ya preparado: ver abajo)
# Sectores (estados): sul = PR SC RS; sudeste = SP RJ MG ES; centro-oeste = MT MS GO DF; nordeste = MA PI CE RN PB PE AL SE BA; norte = AC AM AP PA RO RR TO.
# Deja <salida>/places-BR-<sector>.jsonl (mismo formato que countries.sh; lo lee tools/lib/osm-local.mjs con OSM_LOCAL_DIR=<salida> y el código
# `BR-<sector>`), border-BR-<sector>.geojson (contorno de los estados) y meta-BR-<sector>.json (fecha del extracto, cobertura, fuente).
# Extractos de Geofabrik (descarga única, con User-Agent `VikArg-Prepping-Tools/1.0`; la URL lleva una carpeta más que la página):
#   https://download.geofabrik.de/south-america/brazil/<sector>/<sector>-latest.osm.pbf   (sul 411 MB, sudeste 823 MB, centro-oeste 199 MB, nordeste 425 MB, norte 154 MB)
# Cada sector usa el extracto de Geofabrik de su mismo nombre (los 27 estados caen en el extracto de su macrorregión). Se recorta con las
# fronteras de OpenStreetMap de SUS estados (relaciones `boundary=administrative`, admin_level=4, con ISO3166-2 BR-XX), NO con los `.poly` de
# Geofabrik (traen margen: ver countries.sh). Así lo que cae en los estados vecinos o en otros países queda afuera.
# Relaciones de OSM de los estados (admin_level=4; el script las busca en el extracto y avisa si alguna cambió):
#   sul: PR r297640, SC r296584, RS r242620 · centro-oeste: MS r334051 (las demás: ver REL_IDS abajo; se completan con la primera corrida)
# Los extractos de Geofabrik cortan las relaciones en el límite de cada región (el río Paraná entre PR y MS, por ejemplo, está completo solo en
# el extracto de un lado). Por eso el trabajo va en dos tiempos: al preparar un sector (con su .pbf) se guardan los lugares filtrados
# (<salida>/work-<sector>/places.pbf) y las relaciones de sus estados con sus miembros (<salida>/borders-raw-BR-<sector>.pbf, ~1 MB); al armar,
# el contorno se completa juntando los borders-raw de todos los sectores preparados. Si un contorno queda incompleto, avisa y se vuelve a
# armar (`brazil.sh <sector> - <salida>`) cuando esté preparado el sector vecino. Con eso el .pbf grande se puede borrar enseguida.
# Usa osmium y Node en Docker, un contenedor por vez. Datos © colaboradores de OpenStreetMap, ODbL.
set -eu

SECTOR=${1:?Uso: brazil.sh <sul|sudeste|centro-oeste|nordeste|norte> extracto.osm.pbf carpeta-de-salida}
case "$SECTOR" in
  sul) UFS="PR SC RS"; NAME="Sul" ;;
  sudeste) UFS="SP RJ MG ES"; NAME="Sudeste" ;;
  centro-oeste) UFS="MT MS GO DF"; NAME="Centro-Oeste" ;;
  nordeste) UFS="MA PI CE RN PB PE AL SE BA"; NAME="Nordeste" ;;
  norte) UFS="AC AM AP PA RO RR TO"; NAME="Norte" ;;
  *) echo "sector desconocido: $SECTOR (sul, sudeste, centro-oeste, nordeste, norte)" >&2; exit 1 ;;
esac
PBF=
if [ "${2:?falta el extracto .osm.pbf del sector (o - para solo armar)}" != "-" ]; then PBF=$(readlink -f "$2"); fi
OUT=$(mkdir -p "$3" && cd "$3" && pwd)
HERE=$(cd "$(dirname "$0")" && pwd)
WORK="$OUT/work-$SECTOR"
mkdir -p "$WORK"
ISO=$(for u in $UFS; do printf 'BR-%s,' "$u"; done); ISO=${ISO%,}
RE=$(echo "$UFS" | tr ' ' '|')
COUNT=$(echo "$UFS" | wc -w)
CODE="BR-$SECTOR"

docker build -q -t vikarg-osmium "$HERE" >/dev/null
# El extracto se monta solo lectura en /in (si se pasó); las salidas de los demás sectores, en /o.
osm() { if [ -n "${IN:-}" ]; then docker run --rm -v "$IN:/in:ro" -v "$OUT:/o:ro" -v "$WORK:/w" -w /w vikarg-osmium "$@"; else docker run --rm -v "$OUT:/o:ro" -v "$WORK:/w" -w /w vikarg-osmium "$@"; fi; }
jsnode() { docker run --rm -i -v "$HERE:/t:ro" -v "$WORK:/w:ro" node:26-alpine node "$@"; }

FILTER="nwr/amenity=fire_station,police,hospital,clinic,ranger_station,doctors,pharmacy,fuel,veterinary,drinking_water,water_point,boat_storage,boat_rental,atm,bank,shelter \
  nwr/healthcare=hospital,clinic,centre,pharmacy nwr/emergency=defibrillator nwr/shop=tyres,car_repair,boat,boat_repair,ship_chandler \
  nwr/man_made=water_tap,pier nwr/natural=spring nwr/tourism=alpine_hut,wilderness_hut nwr/waterway=fuel nwr/leisure=marina,slipway \
  nwr/craft=boatbuilder nwr/mooring nwr/seamark:type=mooring"

if [ -n "$PBF" ]; then
  IN=$(dirname "$PBF"); N=$(basename "$PBF")
  echo "$SECTOR: filtrando los lugares"
  # shellcheck disable=SC2086
  osm tags-filter "/in/$N" $FILTER -o places.pbf --overwrite
  echo "$SECTOR: buscando las fronteras de los estados"
  osm tags-filter "/in/$N" "r/ISO3166-2=$ISO" -R -o states.pbf --overwrite
  osm cat states.pbf -f opl -o states.opl --overwrite
  # Ids de las relaciones de cada estado (admin_level=4 y boundary=administrative; ISO3166-2 también la llevan otras relaciones).
  ids=$(awk -v re="ISO3166-2=BR-($RE)(,| |$)" '/^r/ && /admin_level=4/ && /boundary=administrative/ && $0 ~ re { sub(/^r/, "", $1); print $1 }' "$WORK/states.opl" | sort -u)
  echo "relaciones: $(echo $ids)"
  [ "$(echo "$ids" | wc -l)" -eq "$COUNT" ] || { echo "se esperaban $COUNT relaciones de estados, hay: $ids" >&2; exit 1; }
  echo "$ids" > "$WORK/ids.txt"
  # getid sale con error si algún miembro no está en el extracto (normal en los límites con otras regiones); se completa al armar.
  # shellcheck disable=SC2046
  osm getid -r "/in/$N" $(for i in $ids; do printf 'r%s ' "$i"; done) -o borders.pbf --overwrite || echo "aviso: faltan miembros de las relaciones en este extracto (límite con otra región); se completan con el sector vecino"
  # Fecha del extracto (la de la réplica de Geofabrik, en la cabecera del .pbf). El contenedor de osmium no tiene `date`: se lee con fileinfo.
  osm fileinfo -g header.option.osmosis_replication_timestamp "/in/$N" > "$WORK/timestamp.txt"
  cp "$WORK/borders.pbf" "$OUT/borders-raw-$CODE.pbf"
fi
[ -f "$WORK/places.pbf" ] && [ -f "$WORK/ids.txt" ] || { echo "$SECTOR: no está preparado (falta el extracto)" >&2; exit 1; }
ids=$(cat "$WORK/ids.txt")
TS=$(cat "$WORK/timestamp.txt")

echo "$SECTOR: armando el contorno de los estados (con las fronteras de: $(cd "$OUT" && ls borders-raw-BR-*.pbf | sed 's/borders-raw-BR-//; s/\.pbf//' | tr '\n' ' '))"
# shellcheck disable=SC2046
osm merge $(cd "$OUT" && for f in borders-raw-BR-*.pbf; do printf '/o/%s ' "$f"; done) -o borders-all.pbf --overwrite
# shellcheck disable=SC2046
if ! osm export borders-all.pbf -f geojsonseq --add-unique-id=type_id --geometry-types=polygon -o - | jsnode /t/pickareas.mjs $ids > "$WORK/border.geojson"; then
  echo "$SECTOR: contorno INCOMPLETO (falta el borde de un estado vecino de otra región). Preparar el sector vecino y repetir: sh brazil.sh $SECTOR - $OUT" >&2
  exit 2
fi

echo "recorte"
osm extract -p border.geojson places.pbf -o places-sector.pbf --overwrite
osm export places-sector.pbf -f geojsonseq --add-unique-id=type_id --geometry-types=point,polygon -o - | jsnode /t/flatten.mjs > "$OUT/places-$CODE.jsonl.new"
mv "$OUT/places-$CODE.jsonl.new" "$OUT/places-$CODE.jsonl"
STATES=$(for u in $UFS; do printf '"BR-%s",' "$u"; done); STATES=${STATES%,}
COV="$NAME ($(echo "$UFS" | sed 's/ /, /g'))"
cat > "$OUT/meta-$CODE.json" <<EOT
{"country":"BR","sector":"$SECTOR","coverage":"$COV","states":[$STATES],"relations":"$(echo $ids)","source":"OpenStreetMap, extracto de Geofabrik ($SECTOR)","license":"ODbL","extractDate":"$(echo "$TS" | cut -c1-10)","extractTimestamp":"$TS"}
EOT
cp "$WORK/border.geojson" "$OUT/border-$CODE.geojson"
# Se borran los intermedios (root de Docker: con un contenedor); quedan places-, meta-, border- y borders-raw- de cada sector.
docker run --rm -v "$WORK:/w" alpine:3.20 sh -c 'rm -rf /w/places-sector.pbf /w/borders-all.pbf /w/border.geojson /w/places.pbf /w/states.* /w/borders.pbf'
echo "listo: $(wc -l < "$OUT/places-$CODE.jsonl") lugares en $OUT/places-$CODE.jsonl"
