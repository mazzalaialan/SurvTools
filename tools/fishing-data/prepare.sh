#!/bin/sh
# Agua de la Patagonia desde OpenStreetMap para ubicar los tramos de pesca (ver docs/PESCA.md).
#   sh tools/fishing-data/prepare.sh <argentina-latest.osm.pbf> <carpeta> [oeste,sur,este,norte]
# Deja en <carpeta>: rivers.geojsonseq (waterway=river|stream|canal con nombre), lakes.geojsonseq (natural=water / water=* con nombre),
# dams.geojsonseq (presas), bridges.geojsonseq (caminos con bridge=yes) y places.geojsonseq (lugares con nombre). © colaboradores de OpenStreetMap, ODbL.
set -eu
PBF=${1:?Uso: prepare.sh extracto.osm.pbf carpeta}
OUT=${2:?Uso: prepare.sh extracto.osm.pbf carpeta}
# Por defecto, la Patagonia hasta Tierra del Fuego; para el Litoral y Buenos Aires: -64.0,-40.2,-53.5,-21.9
BBOX=${3:--73.8,-55.2,-62.7,-36.0}
mkdir -p "$OUT"
# Patagonia hasta Tierra del Fuego (Neuquén, Río Negro, Chubut y los Parques Nacionales del Sur, que llegan a Los Glaciares y Tierra del Fuego).
osmium extract --overwrite -s smart -b "$BBOX" "$PBF" -o "$OUT/patagonia.osm.pbf"
f() { osmium tags-filter --overwrite "$OUT/patagonia.osm.pbf" "$@"; }
f w/waterway=river,stream,canal -o "$OUT/w-rivers.osm.pbf"
f nwr/natural=water nwr/water=lake,reservoir,lagoon,pond nwr/landuse=reservoir -o "$OUT/w-lakes.osm.pbf"
f nwr/waterway=dam nwr/man_made=dam -o "$OUT/w-dams.osm.pbf"
f w/bridge=yes,viaduct -o "$OUT/w-bridges.osm.pbf"
# Lugares con nombre para los puntos de corte («Balsa Huitrín», «Villa Manzano», «Álamo Guacho»).
f n/place n/amenity=ferry_terminal w/route=ferry n/man_made n/waterway -o "$OUT/w-places.osm.pbf"
# Límites de provincias (admin_level=4): en el Litoral la regla depende de la provincia donde cae el tramo.
f r/boundary=administrative -o "$OUT/w-provinces-all.osm.pbf"
osmium tags-filter --overwrite "$OUT/w-provinces-all.osm.pbf" r/admin_level=4 -o "$OUT/w-provinces.osm.pbf"
for k in rivers lakes dams bridges places provinces; do
  osmium export --overwrite -f geojsonseq -a type,id "$OUT/w-$k.osm.pbf" -o "$OUT/$k.geojsonseq"
done
wc -l "$OUT"/*.geojsonseq
