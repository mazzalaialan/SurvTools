#!/usr/bin/env bash
# Cierra a internet los puertos que Docker y el escritorio remoto publican en este equipo, que está en la zona DMZ del módem.
# Sigue abierto a todo internet: 80 y 443 (Caddy / VikArg) y SSH (22).
# Se puede usar desde la LAN (192.168.0.0/24): todos los servicios de Docker (nomad en :8080, Jellyfin, etc.).
# Escritorio remoto (3389): solo desde 192.168.0.102.
# Sin --apply solo muestra lo que haría. Con --apply lo aplica y deja un servicio systemd para que sobreviva al reinicio.
set -euo pipefail

LAN="${LAN:-192.168.0.0/24}"
RDP_FROM="${RDP_FROM:-192.168.0.102}"
OPEN_PORTS="${OPEN_PORTS:-80,443}"
IFACE="${IFACE:-$(ip route show default | awk '/default/{print $5; exit}')}"
APPLY=0; [ "${1:-}" = "--apply" ] && APPLY=1
run() { echo "+ $*"; [ "$APPLY" = 1 ] && "$@" || true; }

[ "$APPLY" = 1 ] && [ "$(id -u)" != 0 ] && { echo "Con --apply hace falta sudo."; exit 1; }
echo "Interfaz de internet: $IFACE · LAN: $LAN · RDP solo desde: $RDP_FROM · abiertos: $OPEN_PORTS"
[ "$APPLY" = 1 ] || echo "(simulación: no se cambia nada; agregá --apply para aplicar)"

# --- 1. Docker: los puertos publicados pasan por FORWARD, no por ufw. Se filtran en DOCKER-USER. ---
# ctorigdstport = el puerto original al que se conectó quien llama (antes de que Docker lo redirija al contenedor).
fw() {
  local ipt="$1" lan="$2" bridges="$3"
  if [ "$APPLY" = 1 ]; then $ipt -nL DOCKER-USER >/dev/null 2>&1 || { echo "($ipt: no hay cadena DOCKER-USER, se omite)"; return; }; fi
  run $ipt -F DOCKER-USER
  run $ipt -A DOCKER-USER -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
  run $ipt -A DOCKER-USER -s "$bridges" -j RETURN                       # tráfico entre contenedores
  run $ipt -A DOCKER-USER -i "$IFACE" -s "$lan" -j RETURN               # tu red local
  for port in ${OPEN_PORTS//,/ }; do
    run $ipt -A DOCKER-USER -i "$IFACE" -p tcp -m conntrack --ctorigdstport "$port" -j RETURN
  done
  run $ipt -A DOCKER-USER -i "$IFACE" -j DROP                           # el resto desde internet
  run $ipt -A DOCKER-USER -j RETURN
}
fw iptables "$LAN" "172.16.0.0/12"
fw ip6tables "fe80::/10" "fc00::/7"

# --- 2. Escritorio remoto: solo desde una IP ---
if command -v ufw >/dev/null; then
  for p in tcp udp; do
    ufw delete allow 3389/$p >/dev/null 2>&1 || true
    run ufw allow from "$RDP_FROM" to any port 3389 proto $p
    run ufw deny 3389/$p
  done
fi

# --- 3. Que sobreviva al reinicio ---
if [ "$APPLY" = 1 ]; then
  install -m 755 "$0" /usr/local/sbin/vikarg-cerrar-puertos.sh
  cat >/etc/systemd/system/cerrar-puertos.service <<U
[Unit]
Description=Filtra a internet los puertos publicados por Docker (DMZ)
After=docker.service network-online.target
Wants=network-online.target
[Service]
Type=oneshot
Environment=LAN=$LAN RDP_FROM=$RDP_FROM OPEN_PORTS=$OPEN_PORTS
ExecStart=/usr/local/sbin/vikarg-cerrar-puertos.sh --apply
[Install]
WantedBy=multi-user.target
U
  systemctl daemon-reload && systemctl enable cerrar-puertos.service
  echo "Listo. Probá desde afuera (datos del celular) que 9999, 6333, 11434 y 3389 ya no respondan, y desde 192.168.0.102 que sigan andando nomad (:8080) y el escritorio remoto."
  echo "Para deshacer: sudo iptables -F DOCKER-USER && sudo iptables -A DOCKER-USER -j RETURN; sudo systemctl disable --now cerrar-puertos; sudo ufw delete deny 3389/tcp"
fi
