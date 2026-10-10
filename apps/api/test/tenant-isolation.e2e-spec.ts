import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createApp, createPlatformAdmin, createTenant, login, Tenant } from './helpers.js';

describe('tenant isolation', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let A: Tenant;
  let B: Tenant;

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    A = await createTenant(prisma, 'A', ['OWNER', 'VIEWER']);
    B = await createTenant(prisma, 'B', ['OWNER']);
  });
  afterAll(() => app.close());

  it('dashboard counts only the active tenant', async () => {
    const { agent } = await login(app, A.users.OWNER);
    const r = await agent.get('/api/v1/dashboard/summary').expect(200);
    expect(r.body.kpis.recordings).toBe(1);
    expect(r.body.kpis.works).toBe(1);
  });

  it('search never returns another tenant’s catalog', async () => {
    const { agent } = await login(app, A.users.OWNER);
    const own = await agent.get('/api/v1/search').query({ q: A.songTitle }).expect(200);
    expect(own.body.recordings).toHaveLength(1);
    const other = await agent.get('/api/v1/search').query({ q: B.songTitle }).expect(200);
    expect(other.body.works).toHaveLength(0);
    expect(other.body.recordings).toHaveLength(0);
  });

  it('cannot switch into an organization without membership', async () => {
    const { agent, csrf } = await login(app, A.users.OWNER);
    await agent.post('/api/v1/auth/switch-org').set('x-csrf-token', csrf).send({ organizationId: B.orgId }).expect(403);
  });

  it('team and audit lists are tenant scoped', async () => {
    const { agent } = await login(app, A.users.OWNER);
    const team = await agent.get('/api/v1/memberships').expect(200);
    const emails = team.body.data.map((m: { user: { email: string } }) => m.user.email);
    expect(emails).toContain(A.users.OWNER);
    expect(emails).not.toContain(B.users.OWNER);
    const audit = await agent.get('/api/v1/audit-logs').expect(200);
    for (const row of audit.body.data) expect(row.organizationId).toBe(A.orgId);
  });

  it('Postgres RLS hides other tenants even if a query forgets the org filter', async () => {
    const rows = await prisma.tenant(A.orgId, (tx) => tx.recording.findMany({ where: { id: { in: [A.recordingId, B.recordingId] } } }));
    expect(rows.map((r) => r.id)).toEqual([A.recordingId]);
    const byId = await prisma.tenant(A.orgId, (tx) => tx.recording.findUnique({ where: { id: B.recordingId } }));
    expect(byId).toBeNull();
  });

  it('RLS blocks writing rows into another tenant', async () => {
    await expect(
      prisma.tenant(A.orgId, (tx) => tx.musicalWork.create({ data: { organizationId: B.orgId, title: 'Injected' } })),
    ).rejects.toThrow();
  });

  it('RLS returns nothing when no tenant context is set', async () => {
    const n = await prisma.recording.count({ where: { id: { in: [A.recordingId, B.recordingId] } } });
    expect(n).toBe(0);
  });

  it('audit log is append-only at the database level', async () => {
    await prisma.system((tx) => tx.auditLog.create({ data: { organizationId: A.orgId, action: 'test.event', entityType: 'test' } }));
    await expect(prisma.system((tx) => tx.auditLog.updateMany({ where: { organizationId: A.orgId }, data: { action: 'tampered' } }))).rejects.toThrow();
    await expect(prisma.system((tx) => tx.auditLog.deleteMany({ where: { organizationId: A.orgId } }))).rejects.toThrow();
  });

  it('platform admin needs an audited break-glass grant to enter a tenant', async () => {
    const email = await createPlatformAdmin(prisma);
    const { agent, csrf } = await login(app, email);
    await agent.post('/api/v1/auth/switch-org').set('x-csrf-token', csrf).send({ organizationId: B.orgId }).expect(403);
    await agent
      .post(`/api/v1/platform/organizations/${B.orgId}/break-glass`)
      .set('x-csrf-token', csrf)
      .send({ reason: 'Support ticket #123 data check', minutes: 15 })
      .expect(201);
    await agent.post('/api/v1/auth/switch-org').set('x-csrf-token', csrf).send({ organizationId: B.orgId }).expect(200);
    const me = await agent.get('/api/v1/auth/me').expect(200);
    expect(me.body.breakGlass).toBe(true);
    expect(me.body.permissions).not.toContain('members.manage');
    const s = await agent.get('/api/v1/dashboard/summary').expect(200);
    expect(s.body.kpis.recordings).toBe(1);
    const logs = await prisma.system((tx) => tx.auditLog.findMany({ where: { organizationId: B.orgId, action: 'platform.break_glass' } }));
    expect(logs).toHaveLength(1);
  });

  it('non platform admins cannot use platform endpoints', async () => {
    const { agent } = await login(app, A.users.OWNER);
    await agent.get('/api/v1/platform/organizations').expect(403);
  });
});
