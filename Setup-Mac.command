#!/bin/bash
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Install Node.js 24 LTS from https://nodejs.org then run this file again."
  read -r -p "Press Enter to close."
  exit 1
fi
npm install --no-audit --no-fund
npm run setup
echo "Setup complete. Open Start-Mac.command to launch Crosspost."
read -r -p "Press Enter to close."
