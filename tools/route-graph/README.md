# Medición de un grafo de rutas por calles (experimento, 2026-11-15)

Scripts para medir si es factible rutear por calles sin conexión en el teléfono. **No son parte de la app ni del servidor.**

```bash
mkdir -p /tmp/ruta && cd /tmp/ruta
curl -LO https://download.geofabrik.de/south-america/uruguay-latest.osm.pbf   # © OpenStreetMap contributors, ODbL
npm init -y && npm i osm-pbf-parser through2
cp <repo>/tools/route-graph/*.mjs .
PBF=./uruguay-latest.osm.pbf node --max-old-space-size=8000 graph.mjs vehicle   # o: all (con senderos)
node bench.mjs vehicle
```

`graph.mjs` arma el grafo (cruces y extremos como nodos, tramos con largo, clase y sentido único) y mide su peso comprimido; `bench.mjs` mide A* sobre pares de puntos al azar por rango de distancia. Resultados y conclusiones: `docs/PENDIENTES.md`, «Rutas por calles sin conexión».
