#!/usr/bin/env bash
# Restore drill: restores the newest dump into a NEW scratch database and verifies row counts.
# Never touches the live database. Usage: restore-drill.sh [dump-file]
set -euo pipefail
OUT="${BACKUP_DIR:-/var/backups/mrc}"
DUMP="${1:-$(ls -t "$OUT"/*.dump | head -1)}"
TARGET="mrc_drill_$(date -u +%Y%m%d%H%M%S)"
echo "restoring $DUMP -> $TARGET"
START=$(date +%s)
sudo -u postgres createdb "$TARGET"
sudo -u postgres pg_restore --no-owner --no-privileges -d "$TARGET" "$DUMP"
sudo -u postgres psql -d "$TARGET" -Atc "SELECT 'organizations', count(*) FROM organizations UNION ALL SELECT 'recordings', count(*) FROM recordings UNION ALL SELECT 'documents', count(*) FROM documents UNION ALL SELECT 'migrations', count(*) FROM _prisma_migrations"
echo "restore drill ok in $(( $(date +%s) - START ))s (scratch database $TARGET kept for inspection)"
