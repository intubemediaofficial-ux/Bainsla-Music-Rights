import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createApp, createTenant, login, Tenant } from './helpers.js';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const hasChrome = !!process.env.CHROME_PATH;

describe('Phase 3 documents, templates & agreements', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let A: Tenant;
  let B: Tenant;

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    A = await createTenant(prisma, 'docA', ['OWNER', 'LEGAL_REVIEWER', 'VIEWER']);
    B = await createTenant(prisma, 'docB', ['OWNER']);
  });
  afterAll(() => app.close());

  it('uploads, rejects bad files, versions, locks and signs downloads', async () => {
    const { agent, csrf } = await login(app, A.users.OWNER);
    const up = (fields: Record<string, string>, buf: Buffer, name: string) => {
      const r = agent.post('/api/v1/documents').set('x-csrf-token', csrf);
      Object.entries(fields).forEach(([k, v]) => r.field(k, v));
      return r.attach('file', buf, name);
    };
    await up({ ownerType: 'RECORDING', ownerId: A.recordingId }, Buffer.from('MZ\x90\x00binary'), 'evil.exe').expect(422);
    await up({ ownerType: 'RECORDING', ownerId: B.recordingId }, PDF, 'x.pdf').expect(404);
    const doc = (await up({ ownerType: 'RECORDING', ownerId: A.recordingId, title: 'गीत अनुबंध', category: 'AGREEMENT' }, PDF, 'अनुबंध.pdf').expect(201)).body;
    expect(doc.sha256).toHaveLength(64);
    expect(doc.scanStatus).toBe('SKIPPED');

    const d = (await agent.get(`/api/v1/documents/${doc.id}`).expect(200)).body;
    expect(d.versions[0].storageKey).toBeUndefined();
    const link = (await agent.get(`/api/v1/documents/${doc.id}/versions/${d.versions[0].id}/link`).expect(200)).body;
    const file = await agent.get(link.url).buffer(true).expect(200);
    expect(Buffer.compare(file.body, PDF)).toBe(0);
    expect(file.headers['content-disposition']).toContain("filename*=UTF-8''");
    await agent.get(link.url.replace(/sig=\w+/, 'sig=00')).expect(403);

    const other = await login(app, B.users.OWNER);
    await other.agent.get(`/api/v1/documents/${doc.id}`).expect(404);
    await other.agent.get(link.url).expect(404);

    const viewer = await login(app, A.users.VIEWER);
    await viewer.agent.post(`/api/v1/documents/${doc.id}/status`).set('x-csrf-token', viewer.csrf).send({ status: 'EXECUTED' }).expect(403);
    await agent.post(`/api/v1/documents/${doc.id}/status`).set('x-csrf-token', csrf).send({ status: 'EXECUTED' }).expect(201);
    await agent.post(`/api/v1/documents/${doc.id}/versions`).set('x-csrf-token', csrf).attach('file', PDF, 'v2.pdf').expect(400);
    await agent.delete(`/api/v1/documents/${doc.id}`).set('x-csrf-token', csrf).expect(400);
    await agent.patch(`/api/v1/documents/${doc.id}`).set('x-csrf-token', csrf).send({ title: 'changed' }).expect(400);
  });

  it('template review workflow', async () => {
    const o = await login(app, A.users.OWNER);
    const l = await login(app, A.users.LEGAL_REVIEWER);
    const list = (await o.agent.get('/api/v1/templates').expect(200)).body;
    expect(list.filter((t: { isStarter: boolean }) => t.isStarter).length).toBeGreaterThanOrEqual(4);
    const t = (await o.agent.post('/api/v1/templates').set('x-csrf-token', o.csrf).send({ kind: 'AGREEMENT', name: 'Our deal', language: 'en', body: '<h1>{{agreement.title}}</h1><script>x()</script><p onclick="y">{{{annexure_table}}}</p>' }).expect(201)).body;
    expect(t.body).not.toContain('<script');
    expect(t.body).not.toContain('onclick');
    await o.agent.post(`/api/v1/templates/${t.id}/submit`).set('x-csrf-token', o.csrf).expect(201);
    await l.agent.post(`/api/v1/templates/${t.id}/review`).set('x-csrf-token', l.csrf).send({ decision: 'approve' }).expect(201);
    const v2 = (await o.agent.patch(`/api/v1/templates/${t.id}`).set('x-csrf-token', o.csrf).send({ body: '<h1>{{agreement.title}} v2</h1>{{{annexure_table}}}' }).expect(200)).body;
    expect(v2.version).toBe(2);
    expect(v2.id).not.toBe(t.id);
    const other = await login(app, B.users.OWNER);
    await other.agent.get(`/api/v1/templates/${t.id}`).expect(404);
  });

  it('agreement wizard → render → execute → lock', async () => {
    const { agent, csrf } = await login(app, A.users.OWNER);
    const post = (u: string, b: object) => agent.post(`/api/v1${u}`).set('x-csrf-token', csrf).send(b);
    const p1 = (await post('/parties', { legalName: 'राम सिंह', types: ['LYRICIST'], address: 'जयपुर' }).expect(201)).body;
    const p2 = (await post('/parties', { legalName: 'Doc Label', types: ['LABEL'] }).expect(201)).body;
    await post('/agreements', { type: 'ASSIGNMENT', title: 'X', assets: [{ recordingId: B.recordingId }] }).expect(400);
    await post('/agreements', { type: 'ASSIGNMENT', title: 'X', parties: [{ partyId: 'nope', role: 'ASSIGNOR' }] }).expect(400);
    const a = (await post('/agreements', {
      type: 'ASSIGNMENT', title: 'गीत असाइनमेंट 2026', languages: ['en', 'hi'], territories: ['WW'], effectiveDate: '2026-01-01',
      consideration: { amount: 50000, currency: 'INR' }, clauses: { jurisdiction: 'Jaipur' },
      parties: [{ partyId: p1.id, role: 'ASSIGNOR' }, { partyId: p2.id, role: 'ASSIGNEE' }], assets: [{ recordingId: A.recordingId }],
    }).expect(201)).body;

    if (hasChrome) {
      const hi = (await post(`/agreements/${a.id}/render`, { language: 'hi' }).expect(201)).body;
      expect(hi.sizeBytes).toBeGreaterThan(5000);
      await post(`/agreements/${a.id}/render`, { language: 'en', kind: 'annexure' }).expect(201);
      const nocs = (await post(`/agreements/${a.id}/noc`, { language: 'hi' }).expect(201)).body;
      expect(nocs.documents).toHaveLength(2);
      const again = (await post(`/agreements/${a.id}/render`, { language: 'hi' }).expect(201)).body;
      expect(again.documentId).toBe(hi.documentId);
      expect(again.versionNo).toBe(2);
      await post(`/agreements/${a.id}/status`, { status: 'SENT_FOR_SIGNATURE' }).expect(201);
      await post(`/agreements/${a.id}/status`, { status: 'EXECUTED', executedDocumentId: hi.documentId }).expect(400);
    } else {
      await post(`/agreements/${a.id}/status`, { status: 'SENT_FOR_SIGNATURE' }).expect(201);
    }

    const signed = (await agent.post('/api/v1/documents').set('x-csrf-token', csrf).field('ownerType', 'AGREEMENT').field('ownerId', a.id).field('category', 'AGREEMENT').attach('file', PDF, 'signed.pdf').expect(201)).body;
    await post(`/agreements/${a.id}/status`, { status: 'EXECUTED', executedDocumentId: signed.id }).expect(201);
    const done = (await agent.get(`/api/v1/agreements/${a.id}`).expect(200)).body;
    expect(done.locked).toBe(true);
    expect(done.annexureSnapshot.items).toHaveLength(1);
    expect(done.annexureSnapshot.executedSha256).toBe(signed.sha256);
    await agent.patch(`/api/v1/agreements/${a.id}`).set('x-csrf-token', csrf).send({ title: 'changed' }).expect(400);

    const claim = (await post('/rights/claims', { assetType: 'RECORDING', assetId: A.recordingId, partyId: p2.id, rightType: 'PERFORMANCE', sharePercent: 100 }).expect(201)).body.claim;
    await post(`/rights/claims/${claim.id}/status`, { status: 'REVIEWED' }).expect(201);
    await post(`/rights/claims/${claim.id}/status`, { status: 'DOCUMENTED' }).expect(201);

    const other = await login(app, B.users.OWNER);
    await other.agent.get(`/api/v1/agreements/${a.id}`).expect(404);
    await other.agent.post(`/api/v1/agreements/${a.id}/render`).set('x-csrf-token', other.csrf).send({ language: 'en' }).expect(404);
  });
});
