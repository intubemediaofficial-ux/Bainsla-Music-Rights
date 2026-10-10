# Deployment, backup & restore

## Topology (staging/production)
nginx (TLS, 443) → `web` Next.js on `127.0.0.1:3280` → `/api/*` proxied to `api` NestJS on `127.0.0.1:3281`. PostgreSQL 16 and Redis on localhost. App ports are never exposed publicly. Processes run under PM2 (`mrc-api`, `mrc-web`).

## First-time setup
1. Postgres: create owner role `mrc`, database `mrc`, then `CREATE ROLE mrc_app NOLOGIN; CREATE ROLE mrc_app_login LOGIN PASSWORD '…' IN ROLE mrc_app;`
2. `apps/api/.env` from `.env.example`: `DATABASE_URL` uses `mrc_app_login`, `MIGRATE_DATABASE_URL` uses `mrc`, set `APP_ENCRYPTION_KEY` (`openssl rand -base64 32`), `COOKIE_SECURE=true`, `APP_URL=https://<host>`.
3. `npm ci && npm run db:migrate && npm run build`, optional `npm run db:seed` (synthetic data only).
4. `pm2 start "node dist/main.js" --name mrc-api --cwd apps/api` and `pm2 start "node apps/web/server.js" --name mrc-web --cwd apps/web/.next/standalone` (copy `.next/static` into the standalone folder).
5. nginx server block proxying `/` to `127.0.0.1:3280`; certbot for TLS.

## Updating
`git pull && npm ci && npm run db:migrate && npm run build && pm2 restart mrc-api mrc-web`. Migrations are forward-only; take a backup first.

## Backups
- Nightly `pg_dump -Fc` of the database plus the private storage directory, copied off-server with `rclone copy` (additive — never `sync`/`--delete`).
- Retain 30 daily + 12 monthly (owner decision pending).

## Restore drill
`createdb mrc_restore && pg_restore -d mrc_restore dump.pgdump`, point a staging API at it, log in, verify counts. Record the drill date in the ops log.
