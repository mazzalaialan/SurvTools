#!/bin/bash
# Mantiene al día la copia propia de Open-Meteo (contenedor `openmeteo-sync`, ver docker-compose.yml y docs/SERVIDOR.md).
# Baja del bucket público de Open-Meteo solo la región (region.json: Sudamérica sur y Perú) y se queda con:
#   - pronóstico: ECMWF IFS, GFS, ICON, probabilidad de lluvia y olas, y para «Comparación de pronósticos» también ARPEGE, UKMO y JMA,
#     92 días hacia atrás (cada hora);
#   - historial ERA5: desde el año OPEN_METEO_ARCHIVE_FROM (2020) hasta hoy (una vez por día);
#   - relieve (Copernicus DEM 90 m), una sola vez: la altura corrige la temperatura.
# Si una etapa falla se anota y se sigue: el servidor VikArg y la app pasan solos al servicio público mientras tanto.
BIN=/app/openmeteo-api
REGION=/region.json
FROM=${OPEN_METEO_ARCHIVE_FROM:-2020}
PAST=92
DATA=/app/data
log() { echo "$(date -u +%FT%TZ) $*"; }

sync_models() { # modelos variables [args...]
  local models=$1 vars=$2; shift 2
  log "sync $models"
  $BIN sync "$models" "$vars" --polygon @$REGION -c 4 "$@" 2>&1 | grep -v "Download \|Downloaded bbox" | tail -3
  [ "${PIPESTATUS[0]}" -eq 0 ] || log "falló: $models"
}

forecast() {
  sync_models ecmwf_ifs025 temperature_2m,relative_humidity_2m,precipitation,showers,snowfall_water_equivalent,snow_depth,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,pressure_msl,surface_pressure,wind_u_component_10m,wind_v_component_10m,wind_gusts_10m,cape,shortwave_radiation,temperature_700hPa,wind_u_component_700hPa,wind_v_component_700hPa --past-days $PAST --execute
  sync_models ncep_gfs013 temperature_2m,relative_humidity_2m,precipitation,showers,snowfall_water_equivalent,snow_depth,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,shortwave_radiation,diffuse_radiation,uv_index,uv_index_clear_sky,wind_u_component_10m,wind_v_component_10m,frozen_precipitation_percent --past-days $PAST --execute
  sync_models ncep_gfs025 cape,freezing_level_height,pressure_msl,visibility,wind_gusts_10m,temperature_700hPa,wind_u_component_700hPa,wind_v_component_700hPa --past-days $PAST --execute
  sync_models dwd_icon temperature_2m,relative_humidity_2m,precipitation,rain,showers,snowfall_water_equivalent,snow_depth,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,pressure_msl,wind_u_component_10m,wind_v_component_10m,wind_gusts_10m,cape,freezing_level_height,weather_code,direct_radiation,diffuse_radiation,temperature_700hPa,wind_u_component_700hPa,wind_v_component_700hPa --past-days $PAST --execute
  sync_models meteofrance_arpege_world025 temperature_2m,relative_humidity_2m,precipitation,cloud_cover,pressure_msl,wind_u_component_10m,wind_v_component_10m,wind_gusts_10m --past-days $PAST --execute
  sync_models ukmo_global_deterministic_10km temperature_2m,relative_humidity_2m,precipitation,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m --past-days $PAST --execute
  sync_models jma_gsm temperature_2m,relative_humidity_2m,precipitation,cloud_cover,pressure_msl,wind_u_component_10m,wind_v_component_10m --past-days $PAST --execute
  sync_models ncep_gefs025,ecmwf_ifs025_ensemble precipitation_probability --past-days $PAST --execute
  sync_models ncep_gfswave025,ecmwf_wam025,meteofrance_wave wave_height,wave_period,wave_direction,swell_wave_height,swell_wave_period,swell_wave_direction --past-days $PAST --execute
}

archive() {
  local year
  year=$(date -u +%Y)
  sync_models copernicus_era5 temperature_2m,dew_point_2m,precipitation,snowfall_water_equivalent,cloud_cover,pressure_msl,wind_u_component_10m,wind_v_component_10m,wind_gusts_10m,shortwave_radiation,direct_radiation --year "$FROM-$year"
}

# ICON necesita la grilla nativa de varios dominios (grid.bin, coordinates.om, HSURF.om, meta.json): `sync` solo baja la global y sin las otras
# el servidor responde «Missing native ICON grid artifact». Son ~85 MB por dominio y no cambian.
icon_static() {
  local d f
  for d in dwd_icon_global_native dwd_icon_global_eps_native dwd_icon_eu_native; do
    [ -f "$DATA/$d/static/grid.bin" ] && continue
    log "grilla de $d"
    mkdir -p "$DATA/$d/static"
    for f in $(curl -s "https://openmeteo.s3.amazonaws.com/?list-type=2&prefix=data/$d/static/" | grep -o "<Key>[^<]*" | sed 's/<Key>//'); do
      curl -sf -o "$DATA/$d/static/$(basename "$f")" "https://openmeteo.s3.amazonaws.com/$f" || log "falló $f"
    done
  done
}

dem() {
  [ -n "$(ls $DATA/copernicus_dem90/static 2>/dev/null)" ] && return
  sync_models copernicus_dem90 elevation
}

last_archive=""
while true; do
  dem
  icon_static
  today=$(date -u +%F)
  if [ "$today" != "$last_archive" ]; then archive; last_archive=$today; fi
  forecast
  log "listo; próxima pasada en 60 minutos"
  sleep 3600
done
