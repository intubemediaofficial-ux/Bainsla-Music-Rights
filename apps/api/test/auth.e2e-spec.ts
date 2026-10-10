import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { generate } from 'otplib';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createApp, createTenant, login, PASSWORD, Tenant } from './helpers.js';

describe('auth, sessions, CSRF, RBAC, MFA', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let T: Tenant;

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    T = await createTenant(prisma, 'auth', ['OWNER', 'ADMIN', 'VIEWER', 'CATALOG_EDITOR']);
  });
  afterAll(() => app.close());

  it('health is public', async () => {
    const r = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(r.body.db).toBe('ok');
  });

  it('rejects anonymous and wrong-password access', async () => {
    await request(app.getHttpServer()).get('/api/v1/dashboard/summary').expect(401);
    await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: T.users.OWNER, password: 'wrong-password-1' }).expect(401);
  });

  it('sets an HttpOnly session cookie', async () => {
    const r = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: T.users.VIEWER, password: PASSWORD });
    const cookies = ([] as string[]).concat(r.headers['set-cookie'] ?? []);
    const session = cookies.find((c) => c.startsWith('mrc_session='));
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/SameSite=Lax/i);
  });

  it('requires a CSRF token on mutations', async () => {
    const { agent, csrf } = await login(app, T.users.OWNER);
    await agent.patch('/api/v1/organizations/current').send({ phone: '1' }).expect(403);
    await agent.patch('/api/v1/organizations/current').set('x-csrf-token', 'nope').send({ phone: '1' }).expect(403);
    await agent.patch('/api/v1/organizations/current').set('x-csrf-token', csrf).send({ phone: '+91 0000000000' }).expect(200);
  });

  it('rejects unknown fields (strict validation)', async () => {
    const { agent, csrf } = await login(app, T.users.OWNER);
    await agent.patch('/api/v1/organizations/current').set('x-csrf-token', csrf).send({ planId: 'x' }).expect(400);
  });

  it('enforces RBAC per role', async () => {
    const viewer = await login(app, T.users.VIEWER);
    await viewer.agent.patch('/api/v1/organizations/current').set('x-csrf-token', viewer.csrf).send({ phone: '2' }).expect(403);
    await viewer.agent.post('/api/v1/memberships').set('x-csrf-token', viewer.csrf).send({ email: 'x@test.local', role: 'VIEWER' }).expect(403);
    await viewer.agent.get('/api/v1/audit-logs').expect(403);
    await viewer.agent.get('/api/v1/dashboard/summary').expect(200);

    const editor = await login(app, T.users.CATALOG_EDITOR);
    await editor.agent.post('/api/v1/memberships').set('x-csrf-token', editor.csrf).send({ email: 'y@test.local', role: 'VIEWER' }).expect(403);
    await editor.agent.get('/api/v1/audit-logs').expect(403);

    const admin = await login(app, T.users.ADMIN);
    await admin.agent.post('/api/v1/memberships').set('x-csrf-token', admin.csrf).send({ email: `o-${Date.now()}@test.local`, role: 'OWNER' }).expect(403);
  });

  it('invites a member who can accept and sign in', async () => {
    const owner = await login(app, T.users.OWNER);
    const email = `invitee-${Date.now()}@test.local`;
    const r = await owner.agent.post('/api/v1/memberships').set('x-csrf-token', owner.csrf).send({ email, role: 'LEGAL_REVIEWER' }).expect(201);
    const token = new URL(r.body.inviteUrl).searchParams.get('token')!;
    const info = await request(app.getHttpServer()).get('/api/v1/auth/invite').query({ token }).expect(200);
    expect(info.body.role).toBe('LEGAL_REVIEWER');
    await request(app.getHttpServer()).post('/api/v1/auth/accept-invite').send({ token, name: 'Invitee', password: PASSWORD }).expect(201);
    const me = await (await login(app, email)).agent.get('/api/v1/auth/me').expect(200);
    expect(me.body.role).toBe('LEGAL_REVIEWER');
    await request(app.getHttpServer()).post('/api/v1/auth/accept-invite').send({ token, password: PASSWORD }).expect((res) => expect(res.status).toBeGreaterThanOrEqual(400));
  });

  it('the last owner cannot be demoted or removed', async () => {
    const owner = await login(app, T.users.OWNER);
    const team = await owner.agent.get('/api/v1/memberships').expect(200);
    const mine = team.body.data.find((m: { user: { email: string } }) => m.user.email === T.users.OWNER);
    const admin = await login(app, T.users.ADMIN);
    await admin.agent.patch(`/api/v1/memberships/${mine.id}`).set('x-csrf-token', admin.csrf).send({ role: 'VIEWER' }).expect(403);
    await admin.agent.delete(`/api/v1/memberships/${mine.id}`).set('x-csrf-token', admin.csrf).expect(403);
  });

  it('logout revokes the session server-side', async () => {
    const { agent, csrf } = await login(app, T.users.VIEWER);
    await agent.post('/api/v1/auth/logout').set('x-csrf-token', csrf).expect(200);
    await agent.get('/api/v1/auth/me').expect(401);
  });

  it('expired sessions are rejected', async () => {
    const { agent } = await login(app, T.users.VIEWER);
    const user = await prisma.system((tx) => tx.user.findUniqueOrThrow({ where: { email: T.users.VIEWER } }));
    await prisma.system((tx) => tx.session.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } }));
    await agent.get('/api/v1/auth/me').expect(401);
  });

  it('locks the account after repeated failures', async () => {
    const t = await createTenant(prisma, 'lock', ['VIEWER']);
    for (let i = 0; i < 8; i++) {
      await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: t.users.VIEWER, password: 'bad-password-9' });
    }
    const r = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: t.users.VIEWER, password: PASSWORD });
    expect([401, 403, 429]).toContain(r.status);
    expect(r.body.mfaRequired).toBeUndefined();
  });

  it('TOTP MFA: setup, enable, then required at login', async () => {
    const t = await createTenant(prisma, 'mfa', ['OWNER']);
    const s1 = await login(app, t.users.OWNER);
    const setup = await s1.agent.post('/api/v1/auth/mfa/setup').set('x-csrf-token', s1.csrf).expect(200);
    await s1.agent.post('/api/v1/auth/mfa/enable').set('x-csrf-token', s1.csrf).send({ code: '000000' }).expect(400);
    const en = await s1.agent
      .post('/api/v1/auth/mfa/enable')
      .set('x-csrf-token', s1.csrf)
      .send({ code: await generate({ secret: setup.body.secret }) })
      .expect(200);
    expect(en.body.recoveryCodes.length).toBeGreaterThanOrEqual(8);

    const s2 = await login(app, t.users.OWNER);
    expect(s2.body.mfaRequired).toBe(true);
    await s2.agent.get('/api/v1/dashboard/summary').expect(401);
    const me = await s2.agent.get('/api/v1/auth/me').expect(200);
    expect(me.body.mfaPending).toBe(true);
    await s2.agent.post('/api/v1/auth/mfa/verify').set('x-csrf-token', s2.csrf).send({ code: en.body.recoveryCodes[0] }).expect(200);
    await s2.agent.get('/api/v1/dashboard/summary').expect(200);

    const s3 = await login(app, t.users.OWNER);
    await s3.agent.post('/api/v1/auth/mfa/verify').set('x-csrf-token', s3.csrf).send({ code: en.body.recoveryCodes[0] }).expect(401);
  });

  it('secrets never appear in the audit log', async () => {
    const rows = await prisma.system((tx) => tx.auditLog.findMany({ where: { organizationId: T.orgId } }));
    const blob = JSON.stringify(rows);
    expect(blob).not.toContain(PASSWORD);
    expect(blob).not.toMatch(/argon2id/);
  });
});
