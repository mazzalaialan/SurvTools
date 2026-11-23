#!/bin/sh
# Agua de la Patagonia desde OpenStreetMap para ubicar los tramos de pesca (ver docs/PESCA.md).
#   sh tools/fishing-data/prepare.sh <argentina-latest.osm.pbf> <carpeta>
# Deja en <carpeta>: rivers.geojsonseq (waterway=river|stream|canal con nombre), lakes.geojsonseq (natural=water / water=* con nombre),
# dams.geojsonseq (presas), bridges.geojsonseq (caminos con bridge=yes) y places.geojsonseq (lugares con nombre). © colaboradores de OpenStreetMap, ODbL.
set -eu
PBF=${1:?Uso: prepare.sh extracto.osm.pbf carpeta}
OUT=${2:?Uso: prepare.sh extracto.osm.pbf carpeta}
mkdir -p "$OUT"
# Patagonia norte y centro (Neuquén, Río Negro, Chubut y los Parques Nacionales del Sur).
osmium extract --overwrite -b -73.6,-46.2,-62.7,-36.0 "$PBF" -o "$OUT/patagonia.osm.pbf"
f() { osmium tags-filter --overwrite "$OUT/patagonia.osm.pbf" "$@"; }
f w/waterway=river,stream,canal -o "$OUT/w-rivers.osm.pbf"
f nwr/natural=water nwr/water=lake,reservoir,lagoon,pond nwr/landuse=reservoir -o "$OUT/w-lakes.osm.pbf"
f nwr/waterway=dam nwr/man_made=dam -o "$OUT/w-dams.osm.pbf"
f w/bridge=yes,viaduct -o "$OUT/w-bridges.osm.pbf"
# Lugares con nombre para los puntos de corte («Balsa Huitrín», «Villa Manzano», «Álamo Guacho»).
f n/place n/amenity=ferry_terminal w/route=ferry n/man_made n/waterway -o "$OUT/w-places.osm.pbf"
for k in rivers lakes dams bridges places; do
  osmium export --overwrite -f geojsonseq -a type,id "$OUT/w-$k.osm.pbf" -o "$OUT/$k.geojsonseq"
done
wc -l "$OUT"/*.geojsonseq
