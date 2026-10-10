import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import * as archiverMod from 'archiver';
import type { Archiver } from 'archiver';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../documents/storage.service.js';
import { esc, page, RenderService } from '../documents/render.service.js';
import { found } from '../catalog/shared.js';
import type { AssetRef } from './shared.js';
import { CLOSED } from './disputes.controller.js';

export type Warning = { level: 'error' | 'warn' | 'info'; code: string; message: string };
type FileEntry = { path: string; sha256: string; bytes: number; source?: { documentId: string; versionId: string; title: string; status: string; category: string; owner: string } };
export type PackageData = Awaited<ReturnType<PackagesService['gather']>>['data'];
export const DISCLAIMER =
  'Internal verification summary compiled from records kept in Music Rights Cloud. It is not legal certification or a government registration. ISRC/ISWC/UPC identifiers do not by themselves prove ownership. Have qualified counsel review before relying on it.';

const n = (v: unknown) => (v == null ? 0 : Number(v));
const day = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : '—');
const safeName = (s: string) => s.replace(/[^\w.\- ]+/g, '_').slice(0, 80);

// archiver@7 is CommonJS (a callable module); the bundled @types describe the v8 class API.
const archiver = ((archiverMod as unknown as { default?: unknown }).default ?? archiverMod) as unknown as (format: 'zip', opts: object) => Archiver;

export function zip(files: { name: string; data: Buffer }[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const a = archiver('zip', { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    a.on('data', (c: Buffer) => chunks.push(c));
    a.on('end', () => resolve(Buffer.concat(chunks)));
    a.on('error', reject);
    for (const f of files) a.append(f.data, { name: f.name, date: new Date('2000-01-01T00:00:00Z') });
    void a.finalize();
  });
}

const STATUS_LABEL = { INTERNALLY_REVIEWED: 'Internally reviewed', INCOMPLETE: 'Incomplete', DISPUTED: 'Disputed' } as const;

export function summaryHtml(m: { status: keyof typeof STATUS_LABEL; generatedAt: string; warnings: Warning[]; files: FileEntry[]; data: PackageData }, watermark?: string) {
  const d = m.data;
  const table = (head: string[], rows: (string | number)[][]) =>
    rows.length ? `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p class="blank">None recorded.</p>';
  const tone = m.status === 'INTERNALLY_REVIEWED' ? '#166534' : m.status === 'DISPUTED' ? '#991b1b' : '#92400e';
  return page(`Verification package — ${d.asset.title}`, `
<div class="notice">${esc(DISCLAIMER)}</div>
<h1>Verification package</h1>
<p style="text-align:center;margin:0 0 4mm"><b>${esc(d.asset.title)}</b> · ${esc(d.asset.kind)}${d.asset.code ? ` · ${esc(d.asset.code)}` : ''}<br>${esc(d.organization)} · generated ${esc(m.generatedAt.slice(0, 16).replace('T', ' '))} UTC</p>
<p style="text-align:center"><span style="border:1.5px solid ${tone};color:${tone};padding:1mm 4mm;border-radius:3mm;font-weight:700">${STATUS_LABEL[m.status]}</span></p>
<h2>Warnings (${m.warnings.length})</h2>
${m.warnings.length ? `<ul>${m.warnings.map((w) => `<li><b>${w.level.toUpperCase()}</b> — ${esc(w.message)}</li>`).join('')}</ul>` : '<p>No issues found in the recorded data.</p>'}
<h2>Asset</h2>
${table(['Field', 'Value'], Object.entries(d.asset.details).map(([k, v]) => [k, String(v ?? '—')]))}
<h2>Credits</h2>
${table(['Party', 'Role'], d.credits.map((c) => [c.party, c.role]))}
<h2>Rights claims</h2>
${table(['Party', 'Right', 'Share %', 'Territories', 'Period', 'Status'], d.claims.map((c) => [c.party, c.rightType, c.share, c.territories.join(', '), `${day(c.startDate)} → ${c.endDate ? day(c.endDate) : 'open'}`, c.status]))}
<h2>Agreements</h2>
${table(['Title', 'Type', 'Status', 'Executed'], d.agreements.map((a) => [a.title, a.type, a.status, day(a.executionDate)]))}
<h2>Licenses</h2>
${table(['Licensee', 'Exclusive', 'Territories', 'Period'], d.licenses.map((l) => [l.licensee, l.exclusive ? 'Yes' : 'No', l.territories.join(', '), `${day(l.startDate)} → ${l.endDate ? day(l.endDate) : 'open'}`]))}
<h2>Registrations</h2>
${table(['Registry', 'Status', 'Diary / application', 'Registration no.'], d.registrations.map((r) => [r.registry, r.status, r.diaryNo ?? r.applicationNo ?? '—', r.registrationNo ?? '—']))}
<h2>Disputes</h2>
${table(['Counterparty', 'Platform', 'Status', 'Opened'], d.disputes.map((x) => [x.counterparty, x.platform, x.status, day(x.openedAt)]))}
<h2>Evidence files (${m.files.filter((f) => f.source).length})</h2>
${table(['File', 'Document status', 'SHA-256'], m.files.filter((f) => f.source).map((f) => [f.path.replace('evidence/', ''), f.source!.status, f.sha256]))}
<p class="blank" style="font-size:8.5pt">Every file in the ZIP is listed with its SHA-256 in manifest.json. Generated (unsigned) drafts are listed in the data but excluded from evidence.</p>`, { watermark });
}

@Injectable()
export class PackagesService {
  private log = new Logger('PackagesService');
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService, private readonly render: RenderService) {}

  async gather(orgId: string, ref: AssetRef) {
    return this.prisma.tenant(orgId, async (tx) => {
      const fk = ref.assetType === 'WORK' ? { workId: ref.assetId } : { recordingId: ref.assetId };
      const org = await tx.organization.findUnique({ where: { id: orgId }, select: { legalName: true } });
      let asset: PackageAsset;
      if (ref.assetType === 'WORK') {
        const w = found(await tx.musicalWork.findFirst({ where: { id: ref.assetId, organizationId: orgId } }), 'Musical work');
        asset = { kind: 'Musical work', id: w.id, title: w.title, code: w.iswc, details: { Title: w.title, ISWC: w.iswc, Language: w.language } };
      } else {
        const r = found(await tx.recording.findFirst({ where: { id: ref.assetId, organizationId: orgId }, include: { work: { select: { title: true, iswc: true } } } }), 'Recording');
        asset = { kind: 'Sound recording', id: r.id, title: r.title, code: r.isrc, details: { Title: r.title, Version: r.version, ISRC: r.isrc, 'Musical work': r.work?.title, ISWC: r.work?.iswc, Language: r.language, Duration: r.durationSec ? `${Math.floor(r.durationSec / 60)}:${String(r.durationSec % 60).padStart(2, '0')}` : null } };
      }
      const [credits, claims, licenses, links, registrations, disputes] = await Promise.all([
        tx.contribution.findMany({ where: { organizationId: orgId, ...fk }, include: { party: { select: { legalName: true } } }, orderBy: { creditOrder: 'asc' } }),
        tx.rightsClaim.findMany({ where: { organizationId: orgId, ...fk, status: { not: 'REJECTED' } }, include: { party: { select: { legalName: true } } }, orderBy: [{ rightType: 'asc' }, { sharePercent: 'desc' }] }),
        tx.license.findMany({ where: { organizationId: orgId, ...fk }, orderBy: { startDate: 'asc' } }),
        tx.agreementAsset.findMany({ where: { organizationId: orgId, ...fk }, include: { agreement: { select: { id: true, title: true, type: true, status: true, executionDate: true } } } }),
        tx.registration.findMany({ where: { organizationId: orgId, ...fk }, orderBy: { createdAt: 'asc' } }),
        tx.dispute.findMany({ where: { organizationId: orgId, ...fk }, orderBy: { openedAt: 'asc' } }),
      ]);
      const agreements = links.map((l) => l.agreement);
      const owners: { ownerType: 'WORK' | 'RECORDING' | 'RIGHTS_CLAIM' | 'AGREEMENT' | 'LICENSE' | 'REGISTRATION' | 'DISPUTE'; ids: string[] }[] = [
        { ownerType: ref.assetType, ids: [ref.assetId] },
        { ownerType: 'RIGHTS_CLAIM', ids: claims.map((c) => c.id) },
        { ownerType: 'AGREEMENT', ids: agreements.map((a) => a.id) },
        { ownerType: 'LICENSE', ids: licenses.map((l) => l.id) },
        { ownerType: 'REGISTRATION', ids: registrations.map((r) => r.id) },
        { ownerType: 'DISPUTE', ids: disputes.map((x) => x.id) },
      ].filter((o) => o.ids.length) as typeof owners;
      const documents = await tx.document.findMany({
        where: { organizationId: orgId, status: { notIn: ['SUPERSEDED', 'REJECTED'] }, OR: owners.map((o) => ({ ownerType: o.ownerType, ownerId: { in: o.ids } })) },
        include: { versions: { orderBy: { versionNo: 'desc' }, take: 1 } },
        orderBy: { createdAt: 'asc' },
      });
      return {
        documents,
        data: {
          organization: org?.legalName ?? '',
          asset,
          credits: credits.map((c) => ({ party: c.party.legalName, role: c.role })),
          claims: claims.map((c) => ({ id: c.id, party: c.party.legalName, rightType: c.rightType, share: n(c.sharePercent), territories: c.territories, startDate: c.startDate, endDate: c.endDate, status: c.status })),
          agreements,
          licenses: licenses.map((l) => ({ licensee: l.licenseeName, exclusive: l.exclusive, territories: l.territories, startDate: l.startDate, endDate: l.endDate })),
          registrations: registrations.map((r) => ({ registry: r.registry, status: r.status, applicationNo: r.applicationNo, diaryNo: r.diaryNo, registrationNo: r.registrationNo, registeredAt: r.registeredAt })),
          disputes: disputes.map((x) => ({ counterparty: x.counterparty, platform: x.platform, status: x.status, openedAt: x.openedAt, resolvedAt: x.resolvedAt })),
        },
      };
    });
  }

  static warnings(d: PackageData, evidence: { generated: number; skipped: number; mismatched: string[]; executed: number }): Warning[] {
    const w: Warning[] = [];
    if (!d.asset.code) w.push({ level: 'info', code: 'NO_IDENTIFIER', message: `No ${d.asset.kind === 'Musical work' ? 'ISWC' : 'ISRC'} recorded.` });
    if (!d.claims.length) w.push({ level: 'warn', code: 'NO_CLAIMS', message: 'No ownership (rights) claims are recorded.' });
    const byRight = new Map<string, number>();
    for (const c of d.claims) byRight.set(c.rightType, (byRight.get(c.rightType) ?? 0) + c.share);
    for (const [right, total] of byRight) {
      const t = Math.round(total * 100) / 100;
      if (t > 100) w.push({ level: 'error', code: 'SHARE_OVER', message: `${right} shares add up to ${t}% (over 100%).` });
      else if (t < 100) w.push({ level: 'warn', code: 'SHARE_UNDER', message: `${right} shares add up to ${t}% — ${Math.round((100 - t) * 100) / 100}% unallocated.` });
    }
    const disputed = d.claims.filter((c) => c.status === 'DISPUTED').length;
    if (disputed) w.push({ level: 'error', code: 'CLAIM_DISPUTED', message: `${disputed} rights claim(s) are marked disputed.` });
    const undocumented = d.claims.filter((c) => c.status !== 'DOCUMENTED' && c.status !== 'DISPUTED').length;
    if (undocumented) w.push({ level: 'warn', code: 'CLAIM_UNDOCUMENTED', message: `${undocumented} rights claim(s) are not backed by executed evidence yet.` });
    if (!d.agreements.some((a) => a.status === 'EXECUTED')) w.push({ level: 'warn', code: 'NO_EXECUTED_AGREEMENT', message: 'No executed (signed) agreement covers this asset.' });
    if (!evidence.executed) w.push({ level: 'warn', code: 'NO_EXECUTED_DOCUMENT', message: 'No executed (signed) document is on file.' });
    const open = d.disputes.filter((x) => !CLOSED.includes(x.status)).length;
    if (open) w.push({ level: 'error', code: 'OPEN_DISPUTE', message: `${open} dispute(s) are still open.` });
    if (!d.registrations.some((r) => r.status === 'REGISTERED')) w.push({ level: 'info', code: 'NOT_REGISTERED', message: 'No completed copyright/society registration is recorded.' });
    for (const m of evidence.mismatched) w.push({ level: 'error', code: 'CHECKSUM_MISMATCH', message: `Stored file failed its SHA-256 check: ${m}` });
    if (evidence.generated) w.push({ level: 'info', code: 'GENERATED_EXCLUDED', message: `${evidence.generated} generated draft(s) were excluded — unsigned drafts are not evidence.` });
    if (evidence.skipped) w.push({ level: 'info', code: 'SCAN_SKIPPED', message: `${evidence.skipped} file(s) were not malware-scanned (no scanner configured).` });
    return w;
  }

  static status(w: Warning[]) {
    if (w.some((x) => ['OPEN_DISPUTE', 'CLAIM_DISPUTED', 'SHARE_OVER'].includes(x.code))) return 'DISPUTED' as const;
    if (w.some((x) => x.level !== 'info')) return 'INCOMPLETE' as const;
    return 'INTERNALLY_REVIEWED' as const;
  }

  async pdfOrNull(html: string, footer: string) {
    if (!this.render.executable()) return null;
    try {
      return await this.render.pdf(html, footer);
    } catch (e) {
      this.log.warn(`summary PDF failed: ${String(e)}`);
      return null;
    }
  }

  async generate(orgId: string, userId: string | null, ref: AssetRef) {
    const { documents, data } = await this.gather(orgId, ref);
    const files: { name: string; data: Buffer }[] = [];
    const entries: FileEntry[] = [];
    const evidence = { generated: 0, skipped: 0, mismatched: [] as string[], executed: 0 };
    let i = 0;
    for (const doc of documents) {
      const v = doc.versions[0];
      if (!v) continue;
      if (v.isGenerated) { evidence.generated++; continue; }
      if (v.scanStatus === 'INFECTED') continue;
      const buf = await this.storage.get(orgId, v.storageKey).catch(() => null);
      const sha = buf ? (await import('node:crypto')).createHash('sha256').update(buf).digest('hex') : null;
      if (!buf || sha !== v.sha256) { evidence.mismatched.push(`${doc.title} v${v.versionNo}`); continue; }
      if (v.scanStatus === 'SKIPPED') evidence.skipped++;
      if (doc.status === 'EXECUTED') evidence.executed++;
      const path = `evidence/${String(++i).padStart(2, '0')}-${safeName(v.filename)}`;
      files.push({ name: path, data: buf });
      entries.push({ path, sha256: v.sha256, bytes: buf.length, source: { documentId: doc.id, versionId: v.id, title: doc.title, status: doc.status, category: doc.category, owner: doc.ownerType } });
    }
    const warnings = PackagesService.warnings(data, evidence);
    const status = PackagesService.status(warnings);
    const generatedAt = new Date().toISOString();
    const html = summaryHtml({ status, generatedAt, warnings, files: entries, data });
    const pdf = await this.pdfOrNull(html, `${data.asset.title} · verification package`);
    const summary = pdf ? { name: 'summary.pdf', data: pdf } : { name: 'summary.html', data: Buffer.from(html) };
    const dataJson = Buffer.from(JSON.stringify(data, null, 2));
    const { createHash } = await import('node:crypto');
    const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
    const all = [summary, { name: 'data/package.json', data: dataJson }, ...files];
    const id = randomUUID();
    const manifest = {
      packageId: id, generatedAt, status, organization: data.organization,
      asset: { kind: data.asset.kind, id: data.asset.id, title: data.asset.title, code: data.asset.code },
      disclaimer: DISCLAIMER,
      files: [{ path: summary.name, sha256: hash(summary.data), bytes: summary.data.length }, { path: 'data/package.json', sha256: hash(dataJson), bytes: dataJson.length }, ...entries],
    };
    const manifestBuf = Buffer.from(JSON.stringify({ ...manifest, warnings }, null, 2));
    const zipBuf = await zip([{ name: 'manifest.json', data: manifestBuf }, ...all]);
    const z = await this.storage.put(orgId, zipBuf);
    const p = pdf ? await this.storage.put(orgId, pdf) : null;
    return { id, status, warnings, manifest: { ...manifest, data }, storageKey: z.storageKey, pdfStorageKey: p?.storageKey ?? null, sha256: z.sha256, zipBytes: zipBuf.length, userId };
  }
}

type PackageAsset = { kind: 'Musical work' | 'Sound recording'; id: string; title: string; code: string | null; details: Record<string, string | number | null | undefined> };
