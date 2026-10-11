# Admin manual (Phase 1)

## Roles
| Role | Can do |
|---|---|
| Owner | Everything, incl. billing, ownership approval, assigning owners |
| Admin | Manage team (not owners), settings, catalog, rights, documents |
| Rights Manager | Catalog + rights; approve ownership only if "can approve" is granted |
| Legal Reviewer | Review documents/agreements, disputes, registrations |
| Catalog Editor | Create/edit works, recordings, releases, parties, imports |
| Viewer / Artist | Read-only (optionally restricted to assigned records) |

## Team
Team → Invite member → choose role → copy the one-time link (valid 7 days). Disable access to revoke all of a member's sessions immediately. The last owner cannot be removed or demoted.

## Security
Account menu → Security & MFA: scan the QR with an authenticator app, enter the code, store the recovery codes. Set `ENFORCE_ADMIN_MFA=true` to force MFA for owners, admins and platform admins.

## Audit log
Every sign-in, change, invitation and break-glass entry is recorded and cannot be edited or deleted. Filter by action, actor or entity.

## Platform admin
Platform admin → Tenants: provision a tenant (creates org + owner invite), change plan or suspend. To look at a customer's data use **Break-glass** with a written reason; access is read-only, time-limited and logged in both the platform and tenant audit logs.

## Billing, plans & quotas (Phase 5)

- **Billing & plan** (owners/admins, `billing.manage`): current plan, subscription status, usage meters (recordings, users, storage, PDFs and exports this month), plan comparison, invoices (PDF) and **Export your data** (ZIP of JSON + recordings CSV; PAN/bank and file blobs excluded).
- Limits are enforced on create: new recordings (also bulk import commit), team invites and document uploads. Downgrades are refused while usage exceeds the target plan.
- Enterprise (no price) shows **Contact us**; the platform admin assigns it from **Platform → Organizations**.
- Platform admins edit prices/limits with `PATCH /api/v1/platform/plans/:code` (`priceInrPaise`, `maxRecordings`, `maxUsers`, `maxStorageGb`, `isActive`, `isPublic`). Prices are configurable defaults, not validated market prices.

## Payment gateway (Razorpay)

1. In the Razorpay dashboard add webhook URL `https://<host>/api/v1/billing/webhooks/razorpay`, events `subscription.*` and `payment.failed`, and a secret.
2. Put the secret in the API env as `RAZORPAY_WEBHOOK_SECRET` and restart. Without it the endpoint answers 503 and the UI says payment is not connected.
3. When creating the Razorpay subscription set `notes.organizationId` (and optional `notes.planCode`).
- Signatures are HMAC-SHA256 of the raw body. Each event is stored once per `x-razorpay-event-id`; re-deliveries are ignored. Failed events keep their error and return 500 so Razorpay retries; platform admins can see them in `GET /platform/operations` and retry with `POST /platform/webhooks/:id/retry`.
- `subscription.charged` creates a PAID invoice (amount/tax in paise as reported by the gateway).

## Notifications

An hourly scan (`NOTIFY_SCAN_MINUTES`, disable with `NOTIFY_SCAN_DISABLED=true`) creates bell notifications, de-duplicated per item: licences expiring within 30 days, disputed rights claims, agreements unsigned for 7+ days, documents under review, dispute and registration deadlines within 7 days (and overdue), quota above 90%, trial ending within 3 days. `POST /notifications/scan` runs it immediately for the current organization. No emails are sent for these.

## Monitoring

- `GET /api/v1/health` — liveness (DB ping, latency).
- `GET /api/v1/health/ready` — readiness: DB, private storage writable, PDF renderer, malware scanner and gateway configuration. Returns 503 when DB or storage fails; point uptime monitors here.
- `GET /api/v1/platform/operations` — newest backup, unprocessed webhooks, notifications in the last 24h, subscriptions by status.

## Legal pages & consent

`/legal/terms`, `/legal/privacy`, `/legal/dpa` are drafts pending legal review. Sign-up requires the consent checkbox; acceptance is recorded in the organization settings and the organization-creation audit event.

See `backup-restore.md` for backups, restore drills, RPO/RTO and migration rollback, and `pilot-79-songs.md` for the pilot workflow.
