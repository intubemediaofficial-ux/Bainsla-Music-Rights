import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from './helpers.js';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const hasChrome = !!process.env.CHROME_PATH;
const HINDI = ['मेरा गाँव', 'चाँदनी रात', 'बंसी की धुन', 'प्रेम गीत', 'होली के रंग', 'सावन आया', 'माँ का आँचल', 'दिल की बात'];

/** Spec §13 E2E: create organization → import 79-song catalog → consolidated agreement + Annexure-A + NOC → executed docs → package. */
describe('79-song singer catalog end-to-end', () => {
  let app: INestApplication;
  beforeAll(async () => {
    ({ app } = await createApp());
  });
  afterAll(() => app.close());

  it('runs the full pilot workflow', async () => {
    const agent = request.agent(app.getHttpServer());
    const tag = Date.now().toString(36);
    const su = await agent.post('/api/v1/auth/signup').send({ name: 'Pilot Owner', email: `pilot-${tag}@test.local`, password: 'Pilot-Password-2026', organizationName: `Pilot Singer ${tag}`, acceptTerms: true }).expect(201);
    const csrf = decodeURIComponent(([] as string[]).concat(su.headers['set-cookie'] ?? []).map((c) => /^mrc_csrf=([^;]+)/.exec(c)?.[1]).find(Boolean) ?? '');
    const post = (u: string, b: object) => agent.post(`/api/v1${u}`).set('x-csrf-token', csrf).send(b);

    const rows = Array.from({ length: 79 }, (_, i) => {
      const n = String(i + 1).padStart(5, '0');
      const title = i % 2 ? `${HINDI[i % HINDI.length]} ${i + 1}` : `Synthetic Song ${i + 1}`;
      return `"${title}",INZ9Q26${n},Synthetic Singer,राम लेखक,Comp Synthetic,${180 + i},Pilot Album ${Math.floor(i / 20) + 1},`;
    });
    const csv = `Title,ISRC,Singer,Lyricist,Composer,Duration,Release,UPC\n${rows.join('\n')}\n`;
    const pv = (await agent.post('/api/v1/imports/preview').set('x-csrf-token', csrf).attach('file', Buffer.from(csv), 'पायलट कैटलॉग 79.csv').expect(201)).body;
    expect(pv.summary).toMatchObject({ total: 79, valid: 79, invalid: 0 });
    const c = (await post(`/imports/${pv.id}/commit`, {}).expect(201)).body;
    expect(c.summary.imported).toBe(79);

    const recs: { id: string }[] = [];
    let cursor: string | null = null;
    do {
      const page: { data: { id: string }[]; nextCursor: string | null } = (await agent.get('/api/v1/recordings').query({ limit: 50, ...(cursor ? { cursor } : {}) }).expect(200)).body;
      recs.push(...page.data);
      cursor = page.nextCursor ?? null;
    } while (cursor);
    expect(recs).toHaveLength(79);

    const parties = (await agent.get('/api/v1/parties').query({ q: 'Synthetic Singer' }).expect(200)).body.data;
    const label = (await post('/parties', { legalName: `पायलट लेबल ${tag}`, types: ['LABEL'] }).expect(201)).body;
    const a = (await post('/agreements', {
      type: 'ASSIGNMENT', title: `Consolidated catalog assignment — 79 songs`, languages: ['en', 'hi'], territories: ['WW'], effectiveDate: '2026-01-01',
      consideration: { amount: 790000, currency: 'INR' }, clauses: { jurisdiction: 'Jaipur' },
      parties: [{ partyId: parties[0].id, role: 'ASSIGNOR' }, { partyId: label.id, role: 'ASSIGNEE' }],
      assets: recs.map((r) => ({ recordingId: r.id })),
    }).expect(201)).body;

    if (hasChrome) {
      const hi = (await post(`/agreements/${a.id}/render`, { language: 'hi' }).expect(201)).body;
      expect(hi.sizeBytes).toBeGreaterThan(5000);
      const annex = (await post(`/agreements/${a.id}/render`, { language: 'hi', kind: 'annexure' }).expect(201)).body;
      expect(annex.sizeBytes).toBeGreaterThan(20000);
      const nocs = (await post(`/agreements/${a.id}/noc`, { language: 'hi', mode: 'consolidated' }).expect(201)).body;
      expect(nocs.documents).toHaveLength(1);
    }
    await post(`/agreements/${a.id}/status`, { status: 'SENT_FOR_SIGNATURE' }).expect(201);
    const signed = (await agent.post('/api/v1/documents').set('x-csrf-token', csrf).field('ownerType', 'AGREEMENT').field('ownerId', a.id).field('category', 'AGREEMENT').attach('file', PDF, 'हस्ताक्षरित अनुबंध signed.pdf').expect(201)).body;
    await post(`/agreements/${a.id}/status`, { status: 'EXECUTED', executedDocumentId: signed.id }).expect(201);
    const done = (await agent.get(`/api/v1/agreements/${a.id}`).expect(200)).body;
    expect(done.status).toBe('EXECUTED');
    expect(done.annexureSnapshot.items).toHaveLength(79);

    const created = (await post('/packages', { assetType: 'RECORDING', assetId: recs[0].id }).expect(201)).body;
    const pkg = (await agent.get(`/api/v1/packages/${created.id}`).expect(200)).body;
    expect(['INCOMPLETE', 'INTERNALLY_REVIEWED']).toContain(pkg.status);
    const files = pkg.manifest.files as { path: string; sha256: string; source?: { documentId: string } }[];
    expect(files.find((f) => f.source?.documentId === signed.id)?.sha256).toBe(signed.sha256);
    expect(pkg.manifest.files.every((f: { sha256: string }) => /^[0-9a-f]{64}$/.test(f.sha256))).toBe(true);
    expect(pkg.warnings.map((w: { code: string }) => w.code)).not.toContain('NO_EXECUTED_AGREEMENT');
  }, 240_000);
});
