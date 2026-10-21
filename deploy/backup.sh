#!/usr/bin/env bash
# Daily consistent snapshot of the SQLite database into ./data/backups (14 kept).
# Installed on the VM as a cron job for the deploy user:  10 4 * * * /srv/visit-counter/backup.sh
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p data/backups
name="visit-counter-$(date +%F).db"
docker compose exec -T app node dist/scripts/backup.js "/data/backups/${name}"
find data/backups -name 'visit-counter-*.db' -mtime +14 -delete
echo "[backup] data/backups/${name}"
