#!/usr/bin/env bash
# Creates a timestamped, gzip-compressed pg_dump backup of the dashboard's
# Postgres database (running in the `n8n-dashboard-db` container) and prunes
# backups older than the retention window.
#
# Run this ON THE PRODUCTION SERVER, from the repo directory (where
# docker-compose.yaml lives), e.g. via cron. Suggested crontab entry
# (daily at 3am, keep 14 days of backups):
#
#   0 3 * * * cd ~/n8n-dashboard && ./backup-postgres.sh >> ~/n8n-dashboard/backups/backup.log 2>&1
#
# Env overrides (optional):
#   BACKUP_DIR=./backups         # where backups are stored
#   BACKUP_RETENTION_DAYS=14     # how many days of backups to keep

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
CONTAINER_NAME="n8n-dashboard-db"

# Load DB_USER/DB_NAME from .env if present (same variables docker-compose.yaml uses).
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-n8n_dashboard}"

mkdir -p "$BACKUP_DIR"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  echo "Error: container '$CONTAINER_NAME' is not running." >&2
  exit 1
fi

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/n8n-dashboard-${TIMESTAMP}.sql.gz"

echo "Backing up database '$DB_NAME' to $BACKUP_FILE..."
docker exec "$CONTAINER_NAME" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_FILE"
echo "Backup complete ($(du -h "$BACKUP_FILE" | cut -f1))."

echo "Pruning backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name 'n8n-dashboard-*.sql.gz' -mtime "+$RETENTION_DAYS" -print -delete

echo "Done."
