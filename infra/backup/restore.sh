#!/usr/bin/env bash
# Production restore (manual, destructive to the TARGET database). Read docs/backup-restore.md first.
# Usage: restore.sh <dump-file> <storage-tgz> <target-db>
set -euo pipefail
DUMP="$1"; TGZ="$2"; TARGET="$3"
read -r -p "Restore $DUMP into database '$TARGET' (it must be empty/new). Type the database name to continue: " CONFIRM
[ "$CONFIRM" = "$TARGET" ] || { echo "aborted"; exit 1; }
sudo -u postgres pg_restore --clean --if-exists --no-owner -d "$TARGET" "$DUMP"
sudo -u postgres psql -d "$TARGET" -f "$(dirname "$0")/../postgres-init.sql" >/dev/null || true
echo "Database restored. Extract storage with: tar xzf $TGZ -C /var/lib/mrc  (then pm2 restart mrc-api)"
