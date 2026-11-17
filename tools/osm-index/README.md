# Base de calles, números y kilómetros (para «Mi ubicación»)

Convierte el extracto de OpenStreetMap de Geofabrik (`south-america-latest.osm.pbf`) en una base SQLite chica que el servidor consulta en milisegundos (`GET /api/osm/around`, `server/src/osm/around.ts`). Reemplaza, para «Mi ubicación», las consultas a Overpass público (lento y a veces caído); la app lo usa primero y, si el servidor no responde, vuelve a Overpass.

```sh
sh tools/osm-index/build.sh <extracto.osm.pbf> <carpeta-de-salida> [W,S,E,N]
```

- Necesita solo Docker: `Dockerfile` arma la imagen `vikarg-osmium` (Debian con `osmium-tool`) y Node para cargar la base (`node:sqlite`).
- Recorta a Argentina, Chile, Uruguay, Bolivia, Perú y Paraguay (con algo de los vecinos): `-82,-56,-52,0.5` por defecto.
- Guarda: **calles y rutas** (vértices cada 40 m o más, con nombre y/o referencia y su clase), **números de puerta** (con `addr:street`) y **mojones** (`highway=milestone`).
- Las celdas de 0,02° (~2,2 km) indexan todo; las consultas usan los mismos radios que usaba la app con Overpass (120 m calles, 400 m rutas, 80 m números, 3 km mojones).
- Medido el 2026-11-16 con Uruguay: 14 s y 66 MB; consultas de 2 a 20 ms.
- Datos © colaboradores de OpenStreetMap, ODbL (hay que citarlo; ya figura en los créditos de la app).
