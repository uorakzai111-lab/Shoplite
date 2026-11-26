#!/usr/bin/env bash
# Deploys one image tag (commit SHA) of ShopLite from ECR on this VM.
# Usage:   IMAGE_TAG=<commit SHA> ./scripts/deploy.sh
# Rollback: run it again with the previous SHA.
set -euo pipefail

: "${IMAGE_TAG:?IMAGE_TAG is required, e.g. IMAGE_TAG=9aea913 ./scripts/deploy.sh}"

REGION="${AWS_REGION:-ap-southeast-2}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

[[ -f "$ENV_FILE" ]] || { echo "Missing $ENV_FILE" >&2; exit 1; }

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
SERVER_NAME_VAL="$(grep -E '^SERVER_NAME=' "$ENV_FILE" | cut -d'=' -f2-)"

wait_healthy() {
  local name="$1" elapsed=0 status
  while (( elapsed < 60 )); do
    status="$(docker inspect --format '{{.State.Health.Status}}' "$name" 2>/dev/null || echo starting)"
    if [[ "$status" == "healthy" ]]; then
      echo "[OK] $name is healthy"
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  echo "[FAIL] $name not healthy after 60s. Last 20 log lines:" >&2
  docker logs --tail 20 "$name" >&2 || true
  exit 1
}

# 1. Log in to ECR (token lasts 12 hours, so log in on every deploy)
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$REGISTRY"

# 2. Pull all images first, so a wrong tag fails before anything is stopped
for svc in catalog inventory orders frontend; do
  docker pull "$REGISTRY/shoplite/${svc}:${IMAGE_TAG}"
done

# 3. Networks and volume (only if missing)
docker network inspect frontend-net >/dev/null 2>&1 || docker network create frontend-net
docker network inspect backend-net  >/dev/null 2>&1 || docker network create --internal backend-net
docker volume  inspect pgdata       >/dev/null 2>&1 || docker volume create pgdata

# 4. Postgres: leave it running if it already is
if [[ -n "$(docker ps -q -f name='^postgres$' -f status=running)" ]]; then
  echo "[SKIP] postgres is already running"
else
  docker rm -f postgres >/dev/null 2>&1 || true
  docker run -d \
    --name postgres \
    --network backend-net \
    --restart unless-stopped \
    --env-file "$ENV_FILE" \
    -v pgdata:/var/lib/postgresql/data \
    -v "$ROOT_DIR/db/init.sql:/docker-entrypoint-initdb.d/init.sql:ro" \
    --health-cmd='pg_isready -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"' \
    --health-interval=5s --health-timeout=3s --health-retries=5 \
    postgres:17-alpine
fi
wait_healthy postgres

# 5. Replace the backends
for svc in catalog inventory orders; do
  docker rm -f "$svc" >/dev/null 2>&1 || true
  docker run -d \
    --name "$svc" \
    --network backend-net \
    --restart unless-stopped \
    --env-file "$ENV_FILE" \
    "$REGISTRY/shoplite/${svc}:${IMAGE_TAG}"
  docker network connect frontend-net "$svc"
done
for svc in catalog inventory orders; do
  wait_healthy "$svc"
done

# 6. Replace the frontend (only container with published ports)
docker rm -f frontend >/dev/null 2>&1 || true
docker run -d \
  --name frontend \
  --network frontend-net \
  --restart unless-stopped \
  -p 80:80 \
  -p 443:443 \
  -v "$ROOT_DIR/certs:/etc/nginx/certs:ro" \
  -e "SERVER_NAME=${SERVER_NAME_VAL}" \
  "$REGISTRY/shoplite/frontend:${IMAGE_TAG}"
wait_healthy frontend

# 7. Smoke test: /api/catalog/health must answer within 60 seconds
echo "Smoke test: https://${SERVER_NAME_VAL}/api/catalog/health"
elapsed=0
until curl -fsSk --resolve "${SERVER_NAME_VAL}:443:127.0.0.1" \
      "https://${SERVER_NAME_VAL}/api/catalog/health" >/dev/null 2>&1; do
  if (( elapsed >= 60 )); then
    echo "[FAIL] /api/catalog/health did not answer within 60s" >&2
    exit 1
  fi
  sleep 2
  elapsed=$((elapsed + 2))
done
echo "[OK] smoke test passed"

# 8. Remove unused images older than 7 days
docker image prune -af --filter until=168h

echo "Deployed tag ${IMAGE_TAG}"