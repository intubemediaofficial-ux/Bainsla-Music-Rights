# Backup, restore & recovery

Scripts live in `infra/backup/`. They are **additive only**: nothing deletes old backups automatically.

## What is backed up

| Item | How | File |
|---|---|---|
| PostgreSQL (all tenants, audit log, RLS policies) | `pg_dump -Fc` | `/var/backups/mrc/<db>-<UTC>-daily.dump` |
| Private encrypted storage (`/var/lib/mrc/storage`) | `tar czf` (files stay AES-256-GCM encrypted) | `/var/backups/mrc/storage-<UTC>-daily.tgz` |
| Checksums of both | `sha256sum` | `/var/backups/mrc/<UTC>-daily.sha256` |

`APP_ENCRYPTION_KEY` is **not** in the backup. Store it separately (password manager / sealed envelope). Without it, restored files cannot be decrypted.

## Schedule (staging/production)

```cron
# /etc/cron.d/mrc-backup — daily 02:30 IST (21:00 UTC)
0 21 * * * root DB_NAME=mrc_staging /var/www/music-rights-cloud/infra/backup/backup.sh >> /var/log/mrc-backup.log 2>&1
# weekly restore drill, Sunday 03:30 IST
0 22 * * 0 root /var/www/music-rights-cloud/infra/backup/restore-drill.sh >> /var/log/mrc-restore-drill.log 2>&1
```

The newest backup is visible to platform admins at **Platform → Operations** (`GET /api/v1/platform/operations`).

## Targets

- **RPO** (max data loss): 24 hours (daily dump). Lower it by adding WAL archiving / managed PITR.
- **RTO** (time to restore): 2 hours for the current data size. The weekly drill logs the actual restore time.

## Restore drill (safe — never touches live data)

```bash
infra/backup/restore-drill.sh                      # newest dump
infra/backup/restore-drill.sh /var/backups/mrc/X.dump
```

It creates a new scratch database `mrc_drill_<timestamp>`, restores into it and prints row counts for organizations, recordings, documents and migrations. Compare with the live counts. The scratch database is kept for inspection; drop it manually when done.

## Real restore

1. Stop writes: `pm2 stop mrc-api`.
2. Take a fresh backup of the current state (`backup.sh`) — even if it is broken, keep it.
3. Restore into a **new** database: `createdb mrc_restored && infra/backup/restore.sh <dump> <storage.tgz> mrc_restored`.
4. Extract storage into a new directory, point `STORAGE_DIR` at it.
5. Point `DATABASE_URL`/`MIGRATE_DATABASE_URL` at `mrc_restored`, `pm2 restart mrc-api --update-env`.
6. Check `GET /api/v1/health/ready` and log in.

## Migration rollback plan

Prisma migrations are forward-only. Before every deploy a `pre-<phase>` dump + storage archive is taken (see `deployment.md`). If a migration breaks production:

1. `pm2 stop mrc-api mrc-web`.
2. Restore the `pre-<phase>` dump into a new database (steps above).
3. Re-deploy the previous git tag/commit of `apps/api` and `apps/web`.
4. Additive migrations (new columns/tables) are safe to leave in place; the previous code ignores them.

## Retention — owner decision required

No automatic deletion is configured. Proposed policy for approval: keep daily backups 30 days, monthly backups 12 months, and pre-deploy backups indefinitely. The backup script prints a warning when the backup disk reaches 85%.

Also to be decided by the owner (spec §15): backup region (current: same server, `162.35.107.192`), off-site copy provider, and how customer deletion requests are honoured in old backups.
