import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createApp, createTenant, login, Tenant } from './helpers.js';

describe('Phase 4 registrations, disputes, packages & shares', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let A: Tenant;
  let B: Tenant;
  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    A = await createTenant(prisma, 'caseA', ['OWNER', 'VIEWER']);
    B = await createTenant(prisma, 'caseB', ['OWNER']);
  });
  afterAll(() => app.close());

  it('runs the full registration → dispute → package → share flow with tenant isolation', async () => {
    const { agent, csrf } = await login(app, A.users.OWNER);
    const other = await login(app, B.users.OWNER);
    const viewer = await login(app, A.users.VIEWER);
    const post = (p: string, b: object) => agent.post(`/api/v1${p}`).set('x-csrf-token', csrf).send(b);
    const work = (await post('/works', { title: 'Phase4 Song' }).expect(201)).body;

    const reg = (await post('/registrations', { assetType: 'WORK', assetId: work.id, diaryNo: 'D-1' }).expect(201)).body;
    expect(reg.status).toBe('PLANNED');
    await post(`/registrations/${reg.id}/status`, { status: 'REGISTERED' }).expect(400);
    await post(`/registrations/${reg.id}/status`, { status: 'FILED' }).expect(201);
    await post(`/registrations/${reg.id}/status`, { status: 'REGISTERED' }).expect(400);
    expect((await post(`/registrations/${reg.id}/status`, { status: 'REGISTERED', registrationNo: 'L-123/2026' }).expect(201)).body.registrationNo).toBe('L-123/2026');
    await other.agent.get(`/api/v1/registrations/${reg.id}`).expect(404);
    await viewer.agent.post('/api/v1/registrations').set('x-csrf-token', viewer.csrf).send({ assetType: 'WORK', assetId: work.id }).expect(403);
    await other.agent.post('/api/v1/registrations').set('x-csrf-token', other.csrf).send({ assetType: 'WORK', assetId: work.id }).expect(404);

    const d = (await post('/disputes', { assetType: 'WORK', assetId: work.id, counterparty: 'Some Label', platform: 'YouTube' }).expect(201)).body;
    await post(`/disputes/${d.id}/events`, { type: 'EVIDENCE', body: 'Sent agreement' }).expect(201);
    const dd = (await agent.get(`/api/v1/disputes/${d.id}`).expect(200)).body;
    expect(dd.status).toBe('EVIDENCE_SUBMITTED');
    expect(dd.events.length).toBe(2);
    await other.agent.get(`/api/v1/disputes/${d.id}`).expect(404);

    const p1 = (await post('/packages', { assetType: 'WORK', assetId: work.id, idempotencyKey: 'pkg-key-0001' }).expect(201)).body;
    expect(p1.status).toBe('DISPUTED');
    expect(p1.warnings.map((w: { code: string }) => w.code)).toEqual(expect.arrayContaining(['OPEN_DISPUTE', 'NO_CLAIMS', 'NO_EXECUTED_AGREEMENT']));
    const again = (await post('/packages', { assetType: 'WORK', assetId: work.id, idempotencyKey: 'pkg-key-0001' }).expect(201)).body;
    expect(again).toMatchObject({ id: p1.id, reused: true });
    const zip = await agent.get(`/api/v1/packages/${p1.id}/download?kind=zip`).buffer(true).expect(200);
    expect(zip.headers['content-type']).toContain('application/zip');
    expect(zip.headers['x-checksum-sha256']).toBe(p1.sha256);
    await other.agent.get(`/api/v1/packages/${p1.id}`).expect(404);
    await other.agent.get(`/api/v1/packages/${p1.id}/download`).expect(404);

    await post(`/disputes/${d.id}/status`, { status: 'RESOLVED_WON' }).expect(400);
    await post(`/disputes/${d.id}/status`, { status: 'RESOLVED_WON', note: 'Claim released' }).expect(201);
    const p2 = (await post('/packages', { assetType: 'WORK', assetId: work.id }).expect(201)).body;
    expect(p2.status).toBe('INCOMPLETE');

    await post('/shares', { packageId: p1.id, password: 'short' }).expect(400);
    await other.agent.post('/api/v1/shares').set('x-csrf-token', other.csrf).send({ packageId: p1.id, password: 'long-enough-pw' }).expect(404);
    const share = (await post('/shares', { packageId: p1.id, password: 'long-enough-pw', label: 'For YouTube', maxViews: 2 }).expect(201)).body;
    const token = share.url.split('/s/')[1];
    const anon = request(app.getHttpServer());
    expect((await anon.get(`/api/v1/public/shares/${token}`).expect(200)).body).toMatchObject({ state: 'active', requiresPassword: true });
    await anon.post(`/api/v1/public/shares/${token}/unlock`).send({ password: 'wrong-password' }).expect(401);
    const un = (await anon.post(`/api/v1/public/shares/${token}/unlock`).send({ password: 'long-enough-pw' }).expect(201)).body;
    expect(un.package.status).toBe('DISPUTED');
    const dl = await anon.get(un.downloads.zip).buffer(true).expect(200);
    expect(dl.headers['x-checksum-sha256']).toBe(p1.sha256);
    await anon.get(un.downloads.zip.replace(/sig=[0-9a-f]{4}/, 'sig=0000')).expect(403);
    await anon.get('/api/v1/public/shares/not-a-real-token-1234567890').expect(410);
    const log = (await agent.get(`/api/v1/shares/${share.id}`).expect(200)).body;
    expect(log.accesses.map((a: { action: string }) => a.action).sort()).toEqual(['DENIED', 'DOWNLOAD_ZIP', 'VIEW']);
    await post(`/shares/${share.id}/revoke`, {}).expect(201);
    await anon.post(`/api/v1/public/shares/${token}/unlock`).send({ password: 'long-enough-pw' }).expect(410);
    await anon.get(un.downloads.zip).expect(410);
  });
});
