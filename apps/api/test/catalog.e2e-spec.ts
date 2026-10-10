import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createApp, createTenant, login, Tenant } from './helpers.js';

describe('Phase 2 catalog & rights', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let A: Tenant;
  let B: Tenant;

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    A = await createTenant(prisma, 'catA', ['OWNER', 'VIEWER', 'CATALOG_EDITOR']);
    B = await createTenant(prisma, 'catB', ['OWNER']);
  });
  afterAll(() => app.close());

  it('CRUD, validation, rights conflicts and transfers', async () => {
    const { agent, csrf } = await login(app, A.users.OWNER);
    const post = (u: string, b: object) => agent.post(`/api/v1${u}`).set('x-csrf-token', csrf).send(b);
    const p1 = (await post('/parties', { legalName: 'Asha Label', types: ['LABEL'], pan: 'ABCDE1234F' }).expect(201)).body;
    expect(p1.identifiers.panMasked).toMatch(/234F$/);
    expect(JSON.stringify(p1)).not.toContain('ABCDE1234F');
    const p2 = (await post('/parties', { legalName: 'Ravi Composer', types: ['COMPOSER'] }).expect(201)).body;
    const w = (await post('/works', { title: 'Test Geet' }).expect(201)).body;
    await post('/works', { title: 'Bad', iswc: '123' }).expect(400);
    await post('/recordings', { title: 'Test Geet', isrc: 'bad' }).expect(400);
    const r = (await post('/recordings', { title: 'Test Geet', workId: w.id, isrc: 'IN-Z9Z-24-00077' }).expect(201)).body;
    expect(r.isrc).toBe('INZ9Z2400077');
    await post('/recordings', { title: 'Copy', isrc: 'INZ9Z2400077' }).expect(400);
    await post('/contributions', { assetType: 'WORK', assetId: w.id, partyId: p2.id, role: 'COMPOSER' }).expect(201);

    await post('/rights/claims', { assetType: 'RECORDING', assetId: r.id, partyId: p1.id, rightType: 'MASTER', sharePercent: 70 }).expect(201);
    const over = await post('/rights/claims', { assetType: 'RECORDING', assetId: r.id, partyId: p2.id, rightType: 'MASTER', sharePercent: 40 }).expect(409);
    expect(over.body.issues[0].total).toBe(110);
    await post('/rights/claims', { assetType: 'RECORDING', assetId: r.id, partyId: p2.id, rightType: 'MASTER', sharePercent: 40, territories: ['US'], startDate: '2020-01-01' }).expect(409);
    const ok = (await post('/rights/claims', { assetType: 'RECORDING', assetId: r.id, partyId: p2.id, rightType: 'MASTER', sharePercent: 30 }).expect(201)).body.claim;
    await post(`/rights/claims/${ok.id}/status`, { status: 'DOCUMENTED' }).expect(400);
    await post(`/rights/claims/${ok.id}/status`, { status: 'REVIEWED' }).expect(201);

    const t = (await post('/rights/transfers', { assetType: 'RECORDING', assetId: r.id, fromPartyId: p1.id, toPartyId: p2.id, rightType: 'MASTER', sharePercent: 20 }).expect(201)).body;
    expect(t.remaining).toBe(50);
    const detail = (await agent.get(`/api/v1/recordings/${r.id}`).expect(200)).body;
    expect(detail.hasConflicts).toBe(false);
    expect(detail.validation[0].maxTotal).toBe(100);
    expect(detail.transfers).toHaveLength(1);

    await post('/releases', { title: 'EP', upc: '036000291453' }).expect(400);
    const rel = (await post('/releases', { title: 'EP', upc: '036000291452', type: 'EP' }).expect(201)).body;
    await agent.put(`/api/v1/releases/${rel.id}/tracks`).set('x-csrf-token', csrf).send({ tracks: [{ recordingId: r.id, trackNo: 1 }] }).expect(200);
    await agent.put(`/api/v1/releases/${rel.id}/tracks`).set('x-csrf-token', csrf).send({ tracks: [{ recordingId: B.recordingId, trackNo: 1 }] }).expect(400);

    await post('/licenses', { assetType: 'RECORDING', assetId: r.id, licenseeName: 'Film Co', exclusive: true, territories: ['IN'] }).expect(201);
    await post('/licenses', { assetType: 'RECORDING', assetId: r.id, licenseeName: 'Ad Co', territories: ['WW'] }).expect(400);
  });

  it('role permissions', async () => {
    const v = await login(app, A.users.VIEWER);
    await v.agent.get('/api/v1/works').expect(200);
    await v.agent.post('/api/v1/works').set('x-csrf-token', v.csrf).send({ title: 'X' }).expect(403);
    const e = await login(app, A.users.CATALOG_EDITOR);
    await e.agent.post('/api/v1/works').set('x-csrf-token', e.csrf).send({ title: 'Editor work' }).expect(201);
    await e.agent.post('/api/v1/rights/claims').set('x-csrf-token', e.csrf).send({}).expect(403);
  });

  it('cannot read, edit or link another tenant’s records', async () => {
    const { agent, csrf } = await login(app, A.users.OWNER);
    await agent.get(`/api/v1/recordings/${B.recordingId}`).expect(404);
    await agent.get(`/api/v1/works/${B.workId}`).expect(404);
    await agent.patch(`/api/v1/recordings/${B.recordingId}`).set('x-csrf-token', csrf).send({ title: 'hijack' }).expect(404);
    await agent.post('/api/v1/recordings').set('x-csrf-token', csrf).send({ title: 'x', workId: B.workId }).expect(404);
    const list = (await agent.get('/api/v1/recordings').query({ q: B.songTitle }).expect(200)).body;
    expect(list.data).toHaveLength(0);
  });

  it('CSV import: preview, commit, idempotent, rollback', async () => {
    const { agent, csrf } = await login(app, A.users.OWNER);
    const csv = 'Title,ISRC,Singer,Lyricist,Composer,Duration,Release,UPC\n' +
      'Gaana Ek,INQ1Q2400001,Singer A,Writer A,Comp A,3:30,Album X,4006381333931\n' +
      'Gaana Do,INQ1Q2400002,Singer A & Singer B,Writer A,Comp A,210,Album X,4006381333931\n' +
      ',BADISRC,,,,,,\n';
    const pv = (await agent.post('/api/v1/imports/preview').set('x-csrf-token', csrf).attach('file', Buffer.from(csv), 'cat.csv').expect(201)).body;
    expect(pv.summary).toMatchObject({ total: 3, valid: 2, invalid: 1 });
    const c = (await agent.post(`/api/v1/imports/${pv.id}/commit`).set('x-csrf-token', csrf).expect(201)).body;
    expect(c.summary.imported).toBe(2);
    expect(c.summary.created.releases).toBe(1);
    await agent.post(`/api/v1/imports/${pv.id}/commit`).set('x-csrf-token', csrf).expect(400);
    const recs = (await agent.get('/api/v1/recordings').query({ q: 'Gaana' }).expect(200)).body.data;
    expect(recs).toHaveLength(2);
    await agent.post(`/api/v1/imports/${pv.id}/rollback`).set('x-csrf-token', csrf).expect(201);
    expect((await agent.get('/api/v1/recordings').query({ q: 'Gaana' }).expect(200)).body.data).toHaveLength(0);
  });
});
