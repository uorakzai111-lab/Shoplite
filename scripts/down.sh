#!/usr/bin/env bash
set -euo pipefail

PURGE=false
if [[ "${1:-}" == "--purge" ]]; then
  PURGE=true
fi

for name in frontend orders inventory catalog postgres; do
  docker rm -f "$name" >/dev/null 2>&1 || true
done

for net in frontend-net backend-net; do
  docker network rm "$net" >/dev/null 2>&1 || true
done

if [[ "$PURGE" == true ]]; then
  docker volume rm -f pgdata >/dev/null 2>&1 || true
  echo "Stopped stack and purged pgdata volume."
else
  echo "Stopped stack (pgdata volume preserved)."
fi
