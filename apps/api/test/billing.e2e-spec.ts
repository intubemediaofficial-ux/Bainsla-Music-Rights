import { createHmac } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { createApp, createPlatformAdmin, createTenant, login, type Tenant } from './helpers.js';

const SECRET = 'whsec_test_secret';
const sign = (raw: string) => createHmac('sha256', SECRET).update(raw).digest('hex');

describe('Phase 5 billing, quotas, webhooks, notifications, export', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let A: Tenant;
  let B: Tenant;
  const tag = Date.now().toString(36);
  const codes = { tiny: `tiny-${tag}`, studio: `studio-${tag}`, ent: `ent-${tag}` };

  beforeAll(async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
    ({ app, prisma } = await createApp());
    A = await createTenant(prisma, 'BillA', ['OWNER', 'VIEWER']);
    B = await createTenant(prisma, 'BillB', ['OWNER']);
    await prisma.system(async (tx) => {
      const tiny = await tx.plan.create({ data: { code: codes.tiny, name: 'Tiny', priceInrPaise: 49900, maxRecordings: 1, maxUsers: 5, maxStorageBytes: 1_000_000_000n } });
      await tx.plan.create({ data: { code: codes.studio, name: 'Studio', priceInrPaise: 149900, maxRecordings: 500, maxUsers: 5, maxStorageBytes: 10_000_000_000n } });
      await tx.plan.create({ data: { code: codes.ent, name: 'Enterprise', priceInrPaise: null } });
      for (const t of [A, B]) {
        await tx.organization.update({ where: { id: t.orgId }, data: { planId: tiny.id } });
        await tx.subscription.create({ data: { organizationId: t.orgId, planId: tiny.id, status: 'TRIALING', trialEndsAt: new Date(Date.now() + 2 * 86400_000) } });
      }
    });
  });
  afterAll(async () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    await app.close();
  });

  it('shows plan + usage to owners only and enforces the recording quota', async () => {
    const { agent, csrf } = await login(app, A.users.OWNER);
    const b = (await agent.get('/api/v1/billing').expect(200)).body;
    expect(b.plan.code).toBe(codes.tiny);
    expect(b.usage).toMatchObject({ recordings: 1, users: 2 });
    expect(b.gatewayConfigured).toBe(true);
    const viewer = await login(app, A.users.VIEWER);
    await viewer.agent.get('/api/v1/billing').expect(403);
    const r = await agent.post('/api/v1/recordings').set('x-csrf-token', csrf).send({ title: 'Over quota' }).expect(400);
    expect(r.body.message).toMatch(/Plan limit/);
    await agent.post('/api/v1/billing/plan').set('x-csrf-token', csrf).send({ planCode: codes.ent }).expect(400);
    const up = (await agent.post('/api/v1/billing/plan').set('x-csrf-token', csrf).send({ planCode: codes.studio }).expect(201)).body;
    expect(up.subscription.status).toBe('TRIALING');
    await agent.post('/api/v1/recordings').set('x-csrf-token', csrf).send({ title: 'Now allowed' }).expect(201);
    const down = await agent.post('/api/v1/billing/plan').set('x-csrf-token', csrf).send({ planCode: codes.tiny }).expect(400);
    expect(down.body.message).toMatch(/does not fit/);
  });

  it('verifies, applies and de-duplicates gateway webhooks; failures are stored for retry', async () => {
    const http = () => request(app.getHttpServer());
    const body = JSON.stringify({ event: 'subscription.charged', payload: { subscription: { entity: { id: 'sub_X1', notes: { organizationId: A.orgId }, current_start: 1790000000, current_end: 1792592000 } }, payment: { entity: { id: `pay_${tag}`, amount: 176882, tax: 26982, currency: 'INR' } } } });
    await http().post('/api/v1/billing/webhooks/razorpay').set('content-type', 'application/json').set('x-razorpay-event-id', `evt_${tag}`).send(body).expect(401);
    await http().post('/api/v1/billing/webhooks/razorpay').set('content-type', 'application/json').set('x-razorpay-signature', 'bad').send(body).expect(401);
    const ok = (await http().post('/api/v1/billing/webhooks/razorpay').set('content-type', 'application/json').set('x-razorpay-event-id', `evt_${tag}`).set('x-razorpay-signature', sign(body)).send(body).expect(200)).body;
    expect(ok.outcome).toBe('ACTIVE');
    const dup = (await http().post('/api/v1/billing/webhooks/razorpay').set('content-type', 'application/json').set('x-razorpay-event-id', `evt_${tag}`).set('x-razorpay-signature', sign(body)).send(body).expect(200)).body;
    expect(dup.duplicate).toBe(true);
    const { agent } = await login(app, A.users.OWNER);
    const b = (await agent.get('/api/v1/billing').expect(200)).body;
    expect(b.subscription.status).toBe('ACTIVE');
    expect(b.invoices).toHaveLength(1);
    expect(b.invoices[0]).toMatchObject({ amountPaise: 176882, taxPaise: 26982, status: 'PAID' });
    const pdf = await agent.get(`/api/v1/billing/invoices/${b.invoices[0].id}/pdf`).expect(200);
    expect(pdf.headers['cache-control']).toContain('no-store');
    const other = await login(app, B.users.OWNER);
    await other.agent.get(`/api/v1/billing/invoices/${b.invoices[0].id}/pdf`).expect(404);
    expect((await other.agent.get('/api/v1/billing').expect(200)).body.invoices).toHaveLength(0);

    const bad = JSON.stringify({ event: 'payment.failed', payload: { payment: { entity: { id: 'pay_none', notes: { organizationId: 'org_missing' } } } } });
    await http().post('/api/v1/billing/webhooks/razorpay').set('content-type', 'application/json').set('x-razorpay-event-id', `evt_bad_${tag}`).set('x-razorpay-signature', sign(bad)).send(bad).expect(500);
    const ev = await prisma.system((tx) => tx.webhookEvent.findUniqueOrThrow({ where: { gateway_eventId: { gateway: 'razorpay', eventId: `evt_bad_${tag}` } } }));
    expect(ev).toMatchObject({ processedAt: null, attempts: 1 });
    expect(ev.error).toMatch(/No subscription/);
    const admin = await login(app, await createPlatformAdmin(prisma));
    await admin.agent.post(`/api/v1/platform/webhooks/${ev.id}/retry`).set('x-csrf-token', admin.csrf).expect(500);
    const ops = (await admin.agent.get('/api/v1/platform/operations').expect(200)).body;
    expect(ops.unprocessedWebhooks).toBeGreaterThanOrEqual(1);
    await other.agent.get('/api/v1/platform/operations').expect(403);
  });

  it('generates deduplicated notifications per tenant', async () => {
    const { agent, csrf } = await login(app, A.users.OWNER);
    await agent.post('/api/v1/disputes').set('x-csrf-token', csrf).send({ assetType: 'RECORDING', assetId: A.recordingId, counterparty: 'Claimant', platform: 'YouTube', deadline: new Date(Date.now() + 86400_000).toISOString() }).expect(201);
    const first = (await agent.post('/api/v1/notifications/scan').set('x-csrf-token', csrf).expect(200)).body;
    expect(first.created).toBeGreaterThanOrEqual(1);
    expect((await agent.post('/api/v1/notifications/scan').set('x-csrf-token', csrf).expect(200)).body.created).toBe(0);
    const list = (await agent.get('/api/v1/notifications').expect(200)).body;
    expect(list.data.map((n: { type: string }) => n.type)).toEqual(expect.arrayContaining(['CLAIM_DEADLINE', 'BILLING']));
    const other = await login(app, B.users.OWNER);
    const bl = (await other.agent.get('/api/v1/notifications').expect(200)).body;
    expect(bl.data.some((n: { type: string }) => n.type === 'CLAIM_DEADLINE')).toBe(false);
  });

  it('exports only the tenant’s own data and meters it', async () => {
    const { agent } = await login(app, A.users.OWNER);
    const res = await agent.get('/api/v1/exports/catalog').buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(res.headers['content-type']).toContain('application/zip');
    expect((res.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    const viewer = await login(app, A.users.VIEWER);
    await viewer.agent.get('/api/v1/exports/catalog').expect(403);
    const b = (await agent.get('/api/v1/billing').expect(200)).body;
    expect(b.usage.exportsThisMonth).toBe(1);
  });

  it('readiness probe reports dependencies', async () => {
    const r = (await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200)).body;
    expect(r.checks).toMatchObject({ db: 'ok', storage: 'ok', billingGateway: 'configured' });
  });
});
