#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${SCRIPT_DIR}/backups"
COMPOSE_FILE="docker-compose.yml"
VOLUME_NAME="fixed-service_dbdata"

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <backup-filename>"
  echo "Available backups:"
  ls -1 "$BACKUP_DIR"/db-*.tar.gz 2>/dev/null || echo "  (none found)"
  exit 1
fi

BACKUP_FILE="${BACKUP_DIR}/${1}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "[$(date)] Restoring from: $BACKUP_FILE"
echo "[$(date)] Stopping services..."
docker compose -f "$COMPOSE_FILE" down

echo "[$(date)] Restoring volume data..."
docker run --rm \
  -v "${VOLUME_NAME}:/data" \
  -v "${BACKUP_DIR}:/backup" \
  alpine \
  sh -c "rm -rf /data/* /data/..?* /data/.[!.]* 2>/dev/null; tar xzf /backup/${1} -C /data"

echo "[$(date)] Restarting services..."
docker compose -f "$COMPOSE_FILE" up -d

echo "[$(date)] Restore complete."
