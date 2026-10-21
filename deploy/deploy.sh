#!/usr/bin/env bash
# Runs ON the visit-counter VM (invoked by Jenkins over ssh, or by an operator):
#   APP_TAG=123 ./deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

export APP_TAG="${APP_TAG:-latest}"
mkdir -p data data/backups
chmod +x backup.sh 2>/dev/null || true

echo "[deploy] akon47/visit-counter:${APP_TAG}"
docker compose pull --quiet
docker compose up -d --remove-orphans --wait --wait-timeout 90
docker image prune -f >/dev/null 2>&1 || true
docker compose ps
