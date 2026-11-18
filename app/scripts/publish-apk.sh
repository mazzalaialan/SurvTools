#!/usr/bin/env bash
# Sube el APK de la versión actual a su Release de GitHub, para que el aviso de «hay una versión nueva» de la app nativa lleve a la descarga directa
# (`core/portable/update.ts` busca un archivo `.apk` en la Release). Se corre DESPUÉS de publicar la versión (existe la Release `vX.Y.Z`) y desde el
# commit «Versión X.Y.Z», así el APK no lleva el «+N» de los cambios sin publicar.
#
#   cd app && bash scripts/publish-apk.sh
#
# El APK sale firmado con la llave de DEPURACIÓN de esta máquina (~/.android/debug.keystore): sirve para instalar encima de las pruebas hechas con esta
# misma llave. Para Google Play va una llave de firma propia (ver docs/PENDIENTES.md, «App nativa»).
set -euo pipefail
cd "$(dirname "$0")/.."
source ~/Android/env.sh

VERSION=$(node -p "require('./package.json').version")
TAG="v$VERSION"
REPO="mazzalaialan/SurvTools"

gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1 || { echo "No existe la Release $TAG: publicá la versión primero." >&2; exit 1; }
[ -z "$(git status --porcelain -- . ':!../p.json' ':!../viz.png')" ] || { echo "Hay cambios sin commitear en app/: el APK saldría con un «+N». Commiteá o guardalos y volvé a correr." >&2; exit 1; }
[ "$(git log -1 --format=%s)" = "Versión $VERSION" ] || { echo "El último commit no es «Versión $VERSION»: el APK saldría con un «+N». Pasate a ese commit." >&2; exit 1; }

npm run android:debug
APK=android/app/build/outputs/apk/debug/app-debug.apk
NAME="VikArg-$VERSION.apk"
BUILT=$(cat android/app/version-name.txt)
[ "$BUILT" = "$VERSION" ] || { echo "El APK salió con versión «$BUILT», no «$VERSION»: no lo subo." >&2; exit 1; }
echo "APK versión $BUILT"
mkdir -p release
cp "$APK" "release/$NAME"
gh release upload "$TAG" "release/$NAME" --repo "$REPO" --clobber
echo "Listo: $(gh release view "$TAG" --repo "$REPO" --json assets -q '.assets[] | select(.name|endswith(".apk")) | .url')"
