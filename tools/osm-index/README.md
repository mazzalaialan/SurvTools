# Base de calles, números y kilómetros (para «Mi ubicación»)

Convierte el extracto de OpenStreetMap de Geofabrik (`south-america-latest.osm.pbf`) en una base SQLite chica que el servidor consulta en milisegundos (`GET /api/osm/around` y `GET /api/osm/nearby`, `server/src/osm/around.ts`). Reemplaza, para «Mi ubicación» y «Buscar cercanos», las consultas a Overpass público (lento y a veces caído); la app lo usa primero y, si el servidor no responde, vuelve a Overpass.

```sh
sh tools/osm-index/build.sh <extracto.osm.pbf> <carpeta-de-salida> [W,S,E,N]
```

- Necesita solo Docker: `Dockerfile` arma la imagen `vikarg-osmium` (Debian con `osmium-tool`) y Node para cargar la base (`node:sqlite`).
- Recorta a Argentina, Chile, Uruguay, Bolivia, Perú y Paraguay (con algo de los vecinos): `-82,-56,-52,0.5` por defecto.
- Guarda: **calles y rutas** (vértices cada 40 m o más, con nombre y/o referencia y su clase), **números de puerta** (con `addr:street`) **mojones** (`highway=milestone`) y **lugares** para «Buscar cercanos» (policía, bomberos, salud, Defensa Civil y las categorías de servicios: combustible, gomería, taller, farmacia, desfibrilador, veterinaria, agua, refugio, cajero y náutico; con todas sus etiquetas, para que la app los clasifique igual que con Overpass).
- Las celdas de 0,02° (~2,2 km) indexan todo; las consultas usan los mismos radios que usaba la app con Overpass (120 m calles, 400 m rutas, 80 m números, 3 km mojones).
- Medido el 2026-11-16 con Uruguay: 14 s y 66 MB; consultas de 2 a 20 ms.
- Datos © colaboradores de OpenStreetMap, ODbL (hay que citarlo; ya figura en los créditos de la app).

## Un archivo por país para las herramientas de datos (sin Overpass)

```sh
sh tools/osm-index/countries.sh <extracto.osm.pbf> <carpeta-de-salida> [AR CL UY BO PE PY]
```

Deja `<salida>/countries/places-<PAÍS>.jsonl` (una línea por lugar: `{id, lat, lon, tags}`), recortado con el contorno oficial del país que publica Geofabrik (`.poly`). Lo leen `tools/lib/osm-local.mjs` y, a través de él, `tools/country-data`, `tools/emergency-data` (lugares con teléfono) y `tools/services-data`: si el archivo del país existe lo usan; si no, consultan a Overpass como antes (`OSM_LOCAL=0` fuerza Overpass; `OSM_LOCAL_DIR` cambia la carpeta). Los filtros se escriben una sola vez, con la sintaxis de Overpass. `server/src/maps/update-maps.sh` lo arma cada mes con el mismo extracto, antes de borrarlo. Quedan con Overpass los parques (`emergency-data/parks-*.mjs`) y `geo-data`.

Comparado con Overpass en Uruguay (2026-11-17): mismas cantidades con pequeñas diferencias por la fecha de los datos (p. ej. farmacias 590 contra 588, combustible 498 contra 484); policía, bomberos y salud: ningún elemento que Overpass tuviera faltó en el archivo local.
