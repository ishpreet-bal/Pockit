#!/usr/bin/env bash
# Builds the iPhone app's browser version into public/app, served by the website
# at /app (and inside a phone frame at /preview). Run after changing the app:
#   bash scripts/build-app-web.sh
set -euo pipefail
cd "$(dirname "$0")/../mobile"
# Empty API address = talk to the same site it's served from.
EXPO_PUBLIC_API_URL= EXPO_PUBLIC_PREVIEW=0 npx expo export -p web --clear --output-dir ../public/app
echo "Built public/app"
