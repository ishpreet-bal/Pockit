#!/usr/bin/env bash
# Builds the iPhone app's browser version into public/app, served by the website
# at /app (and inside a phone frame at /preview). Run after changing the app:
#   bash scripts/build-app-web.sh
set -euo pipefail
cd "$(dirname "$0")/../mobile"
# Empty API address = talk to the same site it's served from.
EXPO_PUBLIC_API_URL= EXPO_PUBLIC_PREVIEW=0 npx expo export -p web --clear --output-dir ../public/app
# Metro puts package assets (fonts, icons) under assets/node_modules/, which git
# ignores — so they'd never reach the server and the app would wait forever for
# its fonts. Move them to assets/pkg/ and point the bundle there.
if [ -d ../public/app/assets/node_modules ]; then
  mv ../public/app/assets/node_modules ../public/app/assets/pkg
  grep -rl 'assets/node_modules/' ../public/app --include='*.js' --include='*.html' --include='*.json' | xargs sed -i 's#assets/node_modules/#assets/pkg/#g'
fi
echo "Built public/app"
