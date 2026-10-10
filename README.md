# Music Rights Cloud

Multi-tenant SaaS for music copyright & ownership records: musical works, recordings, releases, parties, rights claims, agreements, evidence documents, registrations, disputes and verification packages. Bainsla Music is the first (synthetic-data) pilot tenant.

> Internal records management. Nothing in this product is a government registration, platform certification or legal opinion.

## Stack

| Layer | Choice |
|---|---|
| Web | Next.js 16 (App Router), TypeScript, Tailwind v4, shadcn/ui (`apps/web`) |
| API | NestJS 11 modular monolith, REST under `/api/v1`, OpenAPI at `/api/docs` (`apps/api`) |
| DB | PostgreSQL 16 + Prisma, row-level security per tenant |
| Jobs | Redis + BullMQ (Phase 3+) |
| Auth | Server sessions (HttpOnly cookie) + CSRF double-submit, Argon2id, TOTP MFA, RBAC |

## Local development

```bash
docker compose up -d postgres redis
cp apps/api/.env.example apps/api/.env   # local: postgres users mrc (owner) / mrc_app_login (runtime)
npm install
npm run db:migrate
npm run db:seed                          # synthetic demo data
npm run dev:api                          # http://127.0.0.1:3281/api/docs
npm run dev:web                          # http://localhost:3280
```

Seeded demo accounts (password = `SEED_DEMO_PASSWORD`, default `Demo-Rights-2026`): `owner@bainsla.demo`, `rights@bainsla.demo`, `legal@bainsla.demo`, `editor@bainsla.demo`, `viewer@bainsla.demo`, `owner@studio.demo` (second tenant). Platform admin = `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.

## Tests

```bash
npm --workspace apps/api run test                                   # unit
AUTH_RATE_LIMIT_MULTIPLIER=100 npm --workspace apps/api run test:e2e # API + cross-tenant + RLS
```

## Docs

- [Architecture decision record](docs/adr-001-architecture.md)
- [Entity diagram](docs/erd.md)
- [Deployment & backup runbook](docs/deployment.md)
- [Admin manual](docs/admin-manual.md)
- [Phase status](docs/phases.md)
