# Database Backup & Restore

Filesystem-level snapshots of the Postgres Docker volume (`repairshop_dbdata`) using a temporary Alpine container. No credentials required — pure tar.gz archive of the volume data.

## How It Works

Instead of `pg_dump`, these scripts spin up a disposable Alpine container that mounts the Postgres volume and tars its raw filesystem. This means:

- No database connection or credentials needed
- Backup works even if the Postgres container is running (volume is mounted read-only)
- Restore requires the app to be stopped so Postgres is not writing during the operation

---

## Directory Layout

```
backup_scripts/
├── backup.sh       # Creates a timestamped snapshot, prunes old ones
├── restore.sh      # Stops the app, restores a snapshot, restarts
├── backup.log      # Written by cron (created automatically)
└── backups/        # Backup files are stored here (created automatically)
    ├── db-20260302-020001.tar.gz
    ├── db-20260303-020001.tar.gz
    └── ...
```

---

## First-Time Setup

**1. Verify the Docker volume name:**

```bash
docker volume ls | grep dbdata
```

Expected output: `local   repairshop_dbdata`

If the name is different, update `VOLUME_NAME` at the top of both scripts.

**2. Confirm scripts are executable:**

```bash
chmod +x /home/kobuz/stack/crm/repairshop/backup_scripts/backup.sh
chmod +x /home/kobuz/stack/crm/repairshop/backup_scripts/restore.sh
```

---

## Running a Backup

### Manual backup

```bash
/home/kobuz/stack/crm/repairshop/backup_scripts/backup.sh
```

Output:
```
[Mon Mar  2 02:00:01 UTC 2026] Starting backup → .../backups/db-20260302-020001.tar.gz
[Mon Mar  2 02:00:04 UTC 2026] Backup complete: .../backups/db-20260302-020001.tar.gz
[Mon Mar  2 02:00:04 UTC 2026] Cleaned up backups older than 14 days
```

### Verify a backup is valid

```bash
tar tzf /home/kobuz/stack/crm/repairshop/backup_scripts/backups/db-20260302-020001.tar.gz | head
```

Expected output (Postgres data directory structure):
```
./
./PG_VERSION
./pg_hba.conf
./pg_ident.conf
./postgresql.conf
./global/
./base/
...
```

### List all available backups

```bash
ls -lh /home/kobuz/stack/crm/repairshop/backup_scripts/backups/
```

---

## Scheduling with Cron

### Add the cron job

Open the crontab editor:

```bash
crontab -e
```

Add one of the lines below depending on your preferred schedule.

### Schedule examples

| When | Cron expression |
|---|---|
| Every day at 2:00 AM | `0 2 * * *` |
| Every day at midnight | `0 0 * * *` |
| Twice a day (2 AM and 2 PM) | `0 2,14 * * *` |
| Every Sunday at 3:00 AM | `0 3 * * 0` |
| Every 6 hours | `0 */6 * * *` |

**Recommended entry (daily at 2 AM):**

```
0 2 * * * /home/kobuz/stack/crm/repairshop/backup_scripts/backup.sh >> /home/kobuz/stack/crm/repairshop/backup_scripts/backup.log 2>&1
```

### Verify the cron job is registered

```bash
crontab -l
```

### Check the backup log

```bash
tail -f /home/kobuz/stack/crm/repairshop/backup_scripts/backup.log
```

---

## Restoring Data

> **Warning:** Restore stops all running services (web, celery, nginx, etc.) for the duration of the operation. Plan for a few minutes of downtime.

### Step 1 — List available backups

Run restore.sh without arguments to see what's available:

```bash
/home/kobuz/stack/crm/repairshop/backup_scripts/restore.sh
```

Output:
```
Usage: restore.sh <backup-filename>
Available backups:
db-20260228-020001.tar.gz
db-20260301-020001.tar.gz
db-20260302-020001.tar.gz
```

### Step 2 — Restore a specific backup

Pass the filename (not the full path) as the argument:

```bash
/home/kobuz/stack/crm/repairshop/backup_scripts/restore.sh db-20260302-020001.tar.gz
```

Output:
```
[Mon Mar  2 10:15:00 UTC 2026] Restoring from: .../backups/db-20260302-020001.tar.gz
[Mon Mar  2 10:15:00 UTC 2026] Stopping services...
[Mon Mar  2 10:15:06 UTC 2026] Restoring volume data...
[Mon Mar  2 10:15:10 UTC 2026] Restarting services...
[Mon Mar  2 10:15:15 UTC 2026] Restore complete.
```

### Step 3 — Verify the app is healthy

```bash
docker compose -f /home/kobuz/stack/crm/repairshop/docker-compose.yml ps
```

All services should show as `running` or `healthy` within ~30 seconds.

---

## Retention Policy

Backups older than **14 days** are automatically deleted at the end of each `backup.sh` run.

To change the retention period, edit `RETENTION_DAYS` at the top of [backup.sh](backup.sh):

```bash
RETENTION_DAYS=14   # change to desired number of days
```

---

## Configuration Reference

Both scripts share the same variables at the top of the file:

| Variable | Value | Description |
|---|---|---|
| `COMPOSE_FILE` | `.../docker-compose.yml` | Path to the compose file used for down/up |
| `VOLUME_NAME` | `repairshop_dbdata` | Docker volume containing Postgres data |
| `BACKUP_DIR` | `.../backup_scripts/backups` | Where `.tar.gz` files are stored |
| `RETENTION_DAYS` | `14` | How many days to keep backups (backup.sh only) |
