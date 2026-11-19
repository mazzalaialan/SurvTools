#!/usr/bin/env bash
# Compila la app de iPhone en una Mac remota por SSH (por ejemplo MacinCloud con «Enable SSH for Remote Build») y trae el .ipa sin firmar.
#
#   cd app && bash scripts/build-ios-remote.sh usuario@direccion-de-la-mac [puerto]
#
# Hace falta en la Mac: Xcode 26+, Node 22+, git, y haber aceptado la licencia de Xcode una vez por escritorio remoto (`sudo xcodebuild -license`).
# Sube el código que está commiteado (git archive: no sube node_modules, secretos ni el árbol sin commitear). Las credenciales de la Mac NO van
# en el repositorio: se usa la clave SSH o la contraseña que pida ssh.
# IMPORTANTE (MacinCloud): el tiempo se cuenta mientras haya una sesión iniciada; esto abre y cierra la conexión, pero igual conviene cerrar la
# sesión de escritorio remoto desde el menú de Apple («Cerrar sesión de…»). BORRADOR sin probar.
set -euo pipefail
cd "$(dirname "$0")/.."
TARGET="${1:?Uso: build-ios-remote.sh usuario@host [puerto]}"
PORT="${2:-22}"
SSH=(ssh -p "$PORT" -o ServerAliveInterval=30)
SCP=(scp -P "$PORT")
VERSION=$(node -p "require('./package.json').version")
REMOTE="vikarg-build"

echo "Subiendo el código commiteado a $TARGET…"
git -C .. archive --format=tar.gz HEAD | "${SSH[@]}" "$TARGET" "rm -rf $REMOTE && mkdir -p $REMOTE && tar xz -C $REMOTE"
echo "Compilando en la Mac (tarda unos minutos)…"
# El archivo de git no trae .git: el número de compilación sale de la fecha (siempre crece).
"${SSH[@]}" "$TARGET" "cd $REMOTE/app && export PATH=/opt/homebrew/bin:/usr/local/bin:\$PATH && BUILD_NUMBER=\$(date +%s) bash scripts/build-ios.sh"
mkdir -p release
"${SCP[@]}" "$TARGET:$REMOTE/app/release/VikArg-$VERSION-sin-firmar.ipa" release/
echo "Listo: release/VikArg-$VERSION-sin-firmar.ipa. Cerrá la sesión de la Mac (menú de Apple > Cerrar sesión)."
