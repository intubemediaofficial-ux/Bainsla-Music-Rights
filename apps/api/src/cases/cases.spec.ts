import { createHash } from 'node:crypto';
import { PackagesService, summaryHtml, zip, type PackageData } from './packages.service.js';
import { shareState } from './shares.controller.js';

const data = (over: Partial<PackageData> = {}): PackageData => ({
  organization: 'Org',
  asset: { kind: 'Sound recording', id: 'r1', title: 'Geet', code: 'INXXX2600001', details: { Title: 'Geet' } },
  credits: [],
  claims: [{ id: 'c1', party: 'Label', rightType: 'MASTER', share: 100, territories: ['WW'], startDate: null, endDate: null, status: 'DOCUMENTED' }],
  agreements: [{ id: 'a1', title: 'Assignment', type: 'ASSIGNMENT', status: 'EXECUTED', executionDate: new Date() }],
  licenses: [], registrations: [], disputes: [],
  ...over,
} as PackageData);
const clean = { generated: 0, skipped: 0, mismatched: [], executed: 1 };

describe('verification packages', () => {
  it('is internally reviewed when shares, evidence and disputes are clean', () => {
    const w = PackagesService.warnings(data(), clean);
    expect(w.every((x) => x.level === 'info')).toBe(true);
    expect(PackagesService.status(w)).toBe('INTERNALLY_REVIEWED');
  });
  it('flags missing documents and unallocated shares as incomplete', () => {
    const d = data({ agreements: [], claims: [{ ...data().claims[0], share: 60, status: 'ASSERTED' }] });
    const w = PackagesService.warnings(d, { ...clean, executed: 0 });
    expect(w.map((x) => x.code)).toEqual(expect.arrayContaining(['SHARE_UNDER', 'CLAIM_UNDOCUMENTED', 'NO_EXECUTED_AGREEMENT', 'NO_EXECUTED_DOCUMENT']));
    expect(PackagesService.status(w)).toBe('INCOMPLETE');
  });
  it('marks over-100% shares, open disputes and checksum failures as disputed', () => {
    const d = data({ claims: [data().claims[0], { ...data().claims[0], id: 'c2', share: 20 }], disputes: [{ counterparty: 'X', platform: 'YouTube', status: 'OPEN', openedAt: new Date(), resolvedAt: null }] });
    const w = PackagesService.warnings(d, { ...clean, mismatched: ['Doc v1'] });
    expect(w.map((x) => x.code)).toEqual(expect.arrayContaining(['SHARE_OVER', 'OPEN_DISPUTE', 'CHECKSUM_MISMATCH']));
    expect(PackagesService.status(w)).toBe('DISPUTED');
  });
  it('builds a deterministic zip and an escaped, disclaimed summary', async () => {
    const files = [{ name: 'a.txt', data: Buffer.from('hello') }];
    const [z1, z2] = await Promise.all([zip(files), zip(files)]);
    expect(z1.subarray(0, 2).toString()).toBe('PK');
    expect(createHash('sha256').update(z1).digest('hex')).toBe(createHash('sha256').update(z2).digest('hex'));
    const html = summaryHtml({ status: 'INCOMPLETE', generatedAt: new Date().toISOString(), warnings: [], files: [], data: data({ organization: '<script>x</script>' }) });
    expect(html).not.toContain('<script>x');
    expect(html).toContain('not legal certification');
  });
});

describe('share links', () => {
  const base = { revokedAt: null, expiresAt: new Date(Date.now() + 60_000), maxViews: null, viewCount: 0 };
  it('enforces revocation, expiry and view limits', () => {
    expect(shareState(base)).toBe('active');
    expect(shareState({ ...base, revokedAt: new Date() })).toBe('revoked');
    expect(shareState({ ...base, expiresAt: new Date(Date.now() - 1) })).toBe('expired');
    expect(shareState({ ...base, maxViews: 2, viewCount: 2 })).toBe('exhausted');
  });
});
