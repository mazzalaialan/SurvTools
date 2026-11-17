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

Deja `<salida>/countries/places-<PAÍS>.jsonl` (una línea por lugar: `{id, lat, lon, tags}`), recortado con la **frontera de OpenStreetMap** de cada país (la relación `boundary=administrative` de nivel 2: Argentina r286393, Chile r167454, Uruguay r287072, Bolivia r252645, Perú r288247, Paraguay r287077). **No se usan los `.poly` de Geofabrik:** son el borde de su extracto con margen hacia los vecinos (probado: 1.742 lugares «de Paraguay» caían en Argentina). Lo leen `tools/lib/osm-local.mjs` y, a través de él, `tools/country-data`, `tools/emergency-data` (lugares con teléfono) y `tools/services-data`: si el archivo del país existe lo usan; si no, consultan a Overpass como antes (`OSM_LOCAL=0` fuerza Overpass; `OSM_LOCAL_DIR` cambia la carpeta). Los filtros se escriben una sola vez, con la sintaxis de Overpass. `server/src/maps/update-maps.sh` lo arma cada mes con el mismo extracto, antes de borrarlo. Quedan con Overpass los parques (`emergency-data/parks-*.mjs`) y `geo-data`.

Comparado con los paquetes actuales (hechos con Overpass), con la frontera exacta (2026-11-17): combustible y farmacias de los seis países dentro del 0,5 % (p. ej. Paraguay 1.409 contra 1.408 y 972 contra 969; Argentina 6.068 contra 6.071); `country-data` de Chile, Uruguay, Bolivia, Perú y Paraguay casi idéntico (bomberos 937 contra 936, policía 1.079 contra 1.079, salud 2.003 contra 2.003). Solo 2 elementos caen en dos países (los que cruzan la línea de frontera).

### Áreas protegidas y ríos (etapas 2 y 3)

`countries.sh` deja además, en la misma carpeta:
- `parks-<PAÍS>.jsonl`: las áreas protegidas (`boundary=protected_area|national_park`, `leisure=nature_reserve`) con su geometría en la forma exacta de Overpass `out geom` (caminos y relaciones con sus tramos sueltos: las herramientas los unen en anillos, aunque el contorno quede abierto; el armado de polígonos de osmium rechazaba algunos, como el de Madidi). Cada área queda en un solo país: el que tiene más de sus vértices claramente adentro (a más de ~330 m de la frontera; ver `oplParks.mjs`). Los usan `tools/emergency-data/parks-bo|cl|uy|py.mjs` (`parksByCountry`, `parksById` en `tools/lib/osm-local.mjs`).
- `rivers-near-stations.jsonl`: los ríos con nombre a menos de 12 km de las estaciones de nivel de Argentina y Bolivia (`app/public/data/rivers-AR|BO.json`), para `tools/geo-data`. Lleva una huella de la lista de estaciones: si cambia, `geo-data` no lo usa y vuelve a Overpass hasta el próximo armado mensual.

Todas las herramientas siguen teniendo Overpass de respaldo si falta el archivo del país. Comparado con los paquetes hechos con Overpass (2026-11-17): Uruguay 18 áreas contra 18, Paraguay 23 contra 23, Bolivia 30 contra 30 (polígonos idénticos); Chile 112 contra 112 (111 polígonos idénticos y uno con un vértice de diferencia); ríos de `geo-data`: los mismos 649 (505 de OpenStreetMap).
