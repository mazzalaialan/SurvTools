#!/usr/bin/env bash
# SSH solo con clave: apaga el login por contraseña y el de root con contraseña. Se aplica como un archivo aparte en sshd_config.d (no toca
# /etc/ssh/sshd_config), se valida con `sshd -t` antes de recargar, y la sesión SSH abierta no se corta.
# ANTES de correrlo: confirmá que entrás por clave desde otra terminal (`ssh -o PasswordAuthentication=no usuario@equipo`).
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Hace falta sudo."; exit 1; }
F=/etc/ssh/sshd_config.d/10-solo-clave.conf
mkdir -p /etc/ssh/sshd_config.d
printf 'PasswordAuthentication no\nPermitRootLogin prohibit-password\nKbdInteractiveAuthentication no\n' >"$F"
if sshd -t; then
  systemctl reload ssh
  echo "Listo: SSH solo con clave. Para deshacer: sudo rm $F && sudo systemctl reload ssh"
else
  rm -f "$F"; echo "La configuración no validó: no se cambió nada."; exit 1
fi
