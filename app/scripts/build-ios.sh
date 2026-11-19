#!/usr/bin/env bash
# Compila la app de iPhone SIN FIRMAR y deja un .ipa en app/release/. Se corre EN UNA MAC (por ejemplo la de MacinCloud, por SSH o por escritorio
# remoto) con Xcode 26 o más nuevo, Node 22 o más nuevo y el repositorio clonado. Desde Linux no se puede compilar para iPhone.
#
#   cd app && bash scripts/build-ios.sh
#
# El .ipa sale sin firma: se firma e instala después (Sideloadly o AltStore con un Apple ID, o Xcode con la cuenta; TestFlight pide la cuenta paga).
# BORRADOR: escrito sin poder probarlo (no hay una Mac a mano); la primera vez, corregirlo con lo que falle. Ver docs/PENDIENTES.md, «iPhone».
set -euo pipefail
cd "$(dirname "$0")/.."

[ "$(uname)" = "Darwin" ] || { echo "Esto solo corre en una Mac (macOS con Xcode)." >&2; exit 1; }
command -v xcodebuild >/dev/null || { echo "Falta Xcode (xcodebuild)." >&2; exit 1; }
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)
[ "$NODE_MAJOR" -ge 22 ] || { echo "Capacitor 8 pide Node 22 o más nuevo (hay $(node -v 2>/dev/null || echo ninguno))." >&2; exit 1; }
XCODE_MAJOR=$(xcodebuild -version | head -1 | sed -E 's/Xcode ([0-9]+).*/\1/')
[ "$XCODE_MAJOR" -ge 26 ] || { echo "Capacitor 8 y la App Store piden Xcode 26 o más nuevo (hay $(xcodebuild -version | head -1))." >&2; exit 1; }

VERSION=$(node -p "require('./package.json').version")
# Número de compilación: `BUILD_NUMBER` si viene dado; si no, cuántos commits tiene el repositorio (siempre sube; el de la App Store tiene que
# crecer en cada subida).
BUILD="${BUILD_NUMBER:-$(git rev-list --count HEAD 2>/dev/null || echo 1)}"
echo "VikArg $VERSION (compilación $BUILD), Xcode $XCODE_MAJOR, Node $NODE_MAJOR"

npm ci
npm run assets:ios
npm run build
npx cap sync ios

rm -rf build/ios
mkdir -p build/ios release
xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -archivePath build/ios/App.xcarchive \
  MARKETING_VERSION="$VERSION" \
  CURRENT_PROJECT_VERSION="$BUILD" \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" \
  archive

APP=build/ios/App.xcarchive/Products/Applications/App.app
[ -d "$APP" ] || { echo "No apareció $APP: el archivo de compilación falló." >&2; exit 1; }
rm -rf build/ios/Payload
mkdir -p build/ios/Payload
cp -R "$APP" build/ios/Payload/
(cd build/ios && zip -qry "../../release/VikArg-$VERSION-sin-firmar.ipa" Payload)
echo "Listo: release/VikArg-$VERSION-sin-firmar.ipa ($(du -h "release/VikArg-$VERSION-sin-firmar.ipa" | cut -f1))"
