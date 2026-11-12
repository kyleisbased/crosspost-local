#!/bin/bash
set -e
cd "$(dirname "$0")/../Resources/app"
logdir="${CROSSPOST_DATA:-$HOME/Library/Application Support/CrosspostLocal}"
mkdir -p "$logdir"
if ! ./runtime/node ./scripts/portable-launch.mjs 2>"$logdir/launch.log"; then
  if [ "${CROSSPOST_NO_OPEN:-}" = "1" ]; then
    cat "$logdir/launch.log" >&2
  else
    /usr/bin/osascript -e 'display alert "Crosspost could not start" message "Check launch.log in your CrosspostLocal application-data folder for details." as critical'
  fi
  exit 1
fi
