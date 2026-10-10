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
