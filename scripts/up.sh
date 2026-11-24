#!/usr/bin/env bash
set -euo pipefail

TAG="${TAG:-1.0.0}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Copy .env.example to .env first." >&2
  exit 1
fi

wait_healthy() {
  local name="$1"
  local elapsed=0
  while (( elapsed < 60 )); do
    local status
    status="$(docker inspect --format '{{.State.Health.Status}}' "$name" 2>/dev/null || echo "starting")"
    if [[ "$status" == "healthy" ]]; then
      echo "[OK] $name is healthy"
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  echo "[FAIL] $name did not become healthy within 60s. Last 20 log lines:" >&2
  docker logs --tail 20 "$name" >&2 || true
  exit 1
}

# 1. Create networks and volume if missing
docker network inspect frontend-net >/dev/null 2>&1 || docker network create frontend-net
docker network inspect backend-net >/dev/null 2>&1 || docker network create --internal backend-net
docker volume inspect pgdata >/dev/null 2>&1 || docker volume create pgdata

# 2. Start Postgres on backend-net only
docker rm -f postgres >/dev/null 2>&1 || true
docker run -d \
  --name postgres \
  --network backend-net \
  --restart unless-stopped \
  --env-file "$ENV_FILE" \
  -v pgdata:/var/lib/postgresql/data \
  -v "$ROOT_DIR/db/init.sql:/docker-entrypoint-initdb.d/init.sql:ro" \
  --health-cmd='pg_isready -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"' \
  --health-interval=5s \
  --health-timeout=3s \
  --health-retries=5 \
  postgres:17-alpine

wait_healthy postgres

# 3. Start backends on backend-net and connect to frontend-net
for svc in catalog inventory orders; do
  docker rm -f "$svc" >/dev/null 2>&1 || true
  docker run -d \
    --name "$svc" \
    --network backend-net \
    --restart unless-stopped \
    --env-file "$ENV_FILE" \
    "shop-${svc}:${TAG}"
  docker network connect frontend-net "$svc"
done

for svc in catalog inventory orders; do
  wait_healthy "$svc"
done

# 4. Start frontend on frontend-net only (port 80)
SERVER_NAME_VAL="$(grep -E '^SERVER_NAME=' "$ENV_FILE" | cut -d'=' -f2-)"
SERVER_NAME_VAL="${SERVER_NAME_VAL:-shoplite.test}"

docker rm -f frontend >/dev/null 2>&1 || true
docker run -d \
  --name frontend \
  --network frontend-net \
  --restart unless-stopped \
  -p 80:80 \
  -p 443:443 \
  -v "$ROOT_DIR/certs:/etc/nginx/certs:ro" \
  -v "$ROOT_DIR/frontend/nginx.conf:/etc/nginx/templates/default.conf.template:ro" \
  -e "SERVER_NAME=${SERVER_NAME_VAL}" \
  "shop-frontend:${TAG}"

wait_healthy frontend
echo "ShopLite is running at https://${SERVER_NAME_VAL}"
