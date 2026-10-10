# ADR-001: Modular monolith, shared database with Postgres RLS

Status: accepted (Phase 1)

## Context
Labels, studios and artists share one deployment. A leak of one tenant's catalog, agreements or evidence to another is the worst possible failure. The team is small, so operational simplicity matters.

## Decision
- **NestJS modular monolith** (`apps/api`) exposing REST `/api/v1`, one module per domain area. Workers (BullMQ) run the same codebase.
- **Single PostgreSQL database, shared schema**, every tenant-owned table has `organizationId`.
- **Defense in depth for isolation**
  1. Every controller resolves the org from the server-side session (never from the request body) and filters by it.
  2. All tenant queries run inside `PrismaService.tenant(orgId, fn)`, which sets `app.org_id` for the transaction.
  3. Postgres **FORCE ROW LEVEL SECURITY** policies on every tenant table compare `organizationId` with `app.org_id`. The API connects as a non-owner role (`mrc_app`), so a forgotten `where` returns zero rows instead of another tenant's data. Only `PrismaService.system()` (auth, platform admin, jobs) may set `app.bypass_rls`.
- **Platform admins are not tenant members.** Reading a customer's data needs a time-boxed, reasoned, audited break-glass grant, and only gives read permissions.
- **Sessions over JWT**: opaque random token, SHA-256 hashed in DB, HttpOnly + SameSite=Lax cookie, idle and absolute expiry, server-side revocation. CSRF via double-submit token hashed in the session.
- **Audit log is append-only** (no UPDATE/DELETE grant + trigger), secrets redacted before write.
- **Musical work ≠ recording ≠ release.** ISRC lives on recordings, UPC on releases, ISWC on works; none is treated as proof of ownership.

## Consequences
- Simple deploy (one API process, one web process, Postgres, Redis).
- Every new tenant table must be added to the RLS migration — enforced by the cross-tenant e2e suite.
- Very large tenants can later be moved to a dedicated database without API changes.
