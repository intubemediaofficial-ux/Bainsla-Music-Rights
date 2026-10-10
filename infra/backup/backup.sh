#!/usr/bin/env bash
# Daily backup: Postgres custom-format dump + encrypted private storage archive.
# Additive only — never deletes old backups (retention is an owner decision; see docs/backup-restore.md).
set -euo pipefail
DB="${DB_NAME:-mrc_staging}"
STORAGE="${STORAGE_DIR:-/var/lib/mrc/storage}"
OUT="${BACKUP_DIR:-/var/backups/mrc}"
TS="$(date -u +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"
sudo -u postgres pg_dump "$DB" -Fc -f "$OUT/$DB-$TS-daily.dump"
tar czf "$OUT/storage-$TS-daily.tgz" -C "$(dirname "$STORAGE")" "$(basename "$STORAGE")"
sha256sum "$OUT/$DB-$TS-daily.dump" "$OUT/storage-$TS-daily.tgz" > "$OUT/$TS-daily.sha256"
FREE_PCT=$(df --output=pcent "$OUT" | tail -1 | tr -dc 0-9)
[ "$FREE_PCT" -ge 85 ] && echo "WARNING: backup disk ${FREE_PCT}% full — review retention" >&2
echo "backup ok: $OUT/$DB-$TS-daily.dump"
