# Datos de pesca (`app/public/data/fish-AR.json`)

Ver `docs/PESCA.md`. Los pasos, con la carpeta de trabajo `~/vikarg-fishing-work/` (fuera del repo: fuentes descargadas, transcripción del
reglamento y la tabla de carnadas):

1. `sh tools/fishing-data/prepare.sh <argentina-latest.osm.pbf de Geofabrik> ~/vikarg-fishing-work/osm`: ríos, lagos, presas, puentes y
   lugares con nombre de la Patagonia (osmium).
2. `node tools/fishing-data/locate.mjs ~/vikarg-fishing-work/osm ~/vikarg-fishing-work/ambientes.json <Jurisdicción> ~/vikarg-fishing-work/geo-<Jurisdicción>.json`:
   ubica cada tramo. Los ríos y lagos enteros salen solos por el nombre; las zonas se cortan con los puntos de `cuts.json` (confluencia,
   lago, presa, primer puente, distancia por el cauce, lugar con nombre o coordenada). Informa lo que no encontró.
3. `node tools/fishing-data/build.mjs ~/vikarg-fishing-work <Jurisdicción>[,<Jurisdicción>…]`: arma el paquete (modalidad, temporada,
   cupo y devolución leídos del texto del tramo; el texto literal va siempre en `notes`), y después `npm run data-sizes` en `app/`.

Licencias: reglamento sin licencia declarada (atribución); OpenStreetMap ODbL; dieta de FishBase CC BY-NC (se usa mientras la app sea
gratuita). Las carnadas son una tabla propia, orientativa.
