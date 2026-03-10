#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${SCRIPT_DIR}/backups"
COMPOSE_FILE="docker-compose.yml"
VOLUME_NAME="fixed-service_dbdata"
RETENTION_DAYS=14
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup → ${BACKUP_DIR}/db-${TIMESTAMP}.tar.gz"

docker run --rm \
  -v "${VOLUME_NAME}:/data:ro" \
  -v "${BACKUP_DIR}:/backup" \
  alpine \
  tar czf "/backup/db-${TIMESTAMP}.tar.gz" -C /data .

echo "[$(date)] Backup complete: ${BACKUP_DIR}/db-${TIMESTAMP}.tar.gz"

# Verify backup integrity and log contents
BACKUP_FILE="${BACKUP_DIR}/db-${TIMESTAMP}.tar.gz"
LOG_FILE="${BACKUP_DIR}/db-${TIMESTAMP}.manifest.log"

echo "[$(date)] Verifying backup contents..." | tee "$LOG_FILE"
if tar tzf "$BACKUP_FILE" >> "$LOG_FILE" 2>&1; then
  FILE_COUNT=$(wc -l < "$LOG_FILE")
  echo "[$(date)] Verification OK — ${FILE_COUNT} entries logged to ${LOG_FILE}" | tee -a "$LOG_FILE"
else
  echo "[$(date)] ERROR: Backup verification FAILED for ${BACKUP_FILE}" | tee -a "$LOG_FILE" >&2
  exit 1
fi

# Delete backups older than RETENTION_DAYS
find "$BACKUP_DIR" -name "db-*.tar.gz" -mtime +${RETENTION_DAYS} -delete
find "$BACKUP_DIR" -name "db-*.manifest.log" -mtime +${RETENTION_DAYS} -delete
echo "[$(date)] Cleaned up backups older than ${RETENTION_DAYS} days"
