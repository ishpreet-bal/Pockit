#!/usr/bin/env bash
# Builds the iPhone app's browser version into public/app, served by the website
# at /app (and inside a phone frame at /preview). Run after changing the app:
#   bash scripts/build-app-web.sh
set -euo pipefail
node "$(dirname "$0")/build-app-web.mjs"
