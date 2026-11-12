#!/bin/bash
set -e
cd "$(dirname "$0")"
if [ -d "Crosspost.app" ]; then
  cd "Crosspost.app/Contents/Resources/app"
fi
if [ -x "runtime/node" ]; then
  ./runtime/node scripts/update.mjs "$@"
else
  node scripts/update.mjs "$@"
fi
read -r -p "Press Enter to close."
