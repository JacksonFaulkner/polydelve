#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/backend/docker-compose.yml"

# Load .env so DATABASE_URL etc. are available to the backend
if [[ -f "$REPO_ROOT/backend/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$REPO_ROOT/backend/.env"
  set +a
fi

# Default to Docker Postgres over TCP (127.0.0.1 forces TCP, avoids macOS Unix-socket fallback)
export DATABASE_URL="${DATABASE_URL:-postgresql://polydelve:polydelve@127.0.0.1:5432/polydelve_dev}"

cleanup() {
  echo ""
  echo "Stopping Postgres..."
  docker compose -f "$COMPOSE_FILE" down
  # kill remaining background jobs (backend + frontend)
  kill 0
}
trap cleanup SIGINT SIGTERM

echo "Starting Postgres..."
docker compose -f "$COMPOSE_FILE" up -d

echo "Waiting for Postgres to accept connections..."
until docker compose -f "$COMPOSE_FILE" exec -T db \
    pg_isready -U polydelve -h 127.0.0.1 -q 2>/dev/null; do
  sleep 1
done
echo "Postgres ready."

cd "$REPO_ROOT/backend" && uv run uvicorn main:app --reload --port 8000 &
cd "$REPO_ROOT/frontend" && npm run dev &

wait
