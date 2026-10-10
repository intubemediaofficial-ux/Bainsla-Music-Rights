import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Auth, RequirePermission } from '../auth/context.js';
import type { OrgContext } from '../auth/context.js';
import { sha256 } from '../common/crypto.js';
import { zip } from '../cases/packages.service.js';
import { contentDisposition } from '../cases/files.js';
import { meter } from './usage.js';

const SENSITIVE = new Set(['panEnc', 'bankEnc', 'passwordHash', 'totpSecretEnc', 'storageKey', 'tokenHash']);
const json = (v: unknown) => Buffer.from(JSON.stringify(v, (k, x: unknown) => (SENSITIVE.has(k) ? undefined : typeof x === 'bigint' ? x.toString() : x), 2));
const csvCell = (v: unknown) => {
  const s = v == null ? '' : v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v as string | number | boolean);
  return /^[=+\-@]/.test(s) ? `'${s}` : /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Settings → Data export: tenant's own records as JSON + recordings CSV. Encrypted PAN/bank fields and file blobs are excluded. */
@ApiTags('exports')
@Controller('exports')
export class ExportController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('catalog')
  @RequirePermission('data.export')
  async catalog(@Auth() auth: OrgContext, @Res() res: Response) {
    const org = auth.orgId;
    const w = { where: { organizationId: org } };
    const data = await this.prisma.tenant(org, async (tx) => {
      const [works, recordings, releases, tracks, parties, contributions, claims, transfers, licenses, agreements, agreementParties, agreementAssets, documents, registrations, disputes, disputeEvents] = await Promise.all([
        tx.musicalWork.findMany(w), tx.recording.findMany(w), tx.release.findMany(w), tx.releaseTrack.findMany(w), tx.party.findMany(w), tx.contribution.findMany(w),
        tx.rightsClaim.findMany(w), tx.rightsTransfer.findMany(w), tx.license.findMany(w), tx.agreement.findMany(w), tx.agreementParty.findMany(w), tx.agreementAsset.findMany(w),
        tx.document.findMany({ ...w, include: { versions: { select: { versionNo: true, filename: true, sha256: true, sizeBytes: true, mime: true, scanStatus: true, createdAt: true } } } }),
        tx.registration.findMany(w), tx.dispute.findMany(w), tx.disputeEvent.findMany(w),
      ]);
      await meter(tx, org, 'EXPORTS', 1);
      await this.audit.log(tx, auth, { action: 'data.exported', entityType: 'organization', entityId: org, after: { recordings: recordings.length, works: works.length, documents: documents.length } });
      return { works, recordings, releases, tracks, parties, contributions, claims, transfers, licenses, agreements, agreementParties, agreementAssets, documents, registrations, disputes, disputeEvents };
    }, { timeout: 120_000 });
    const files = Object.entries(data).map(([k, v]) => ({ name: `json/${k}.json`, data: json(v) }));
    const cols = ['id', 'title', 'version', 'isrc', 'workId', 'durationSec', 'language', 'recordingDate', 'createdAt'] as const;
    const csv = [cols.join(','), ...data.recordings.map((r) => cols.map((c) => csvCell((r as Record<string, unknown>)[c])).join(','))].join('\n');
    files.push({ name: 'recordings.csv', data: Buffer.from(`\ufeff${csv}`) });
    files.push({ name: 'README.txt', data: Buffer.from(`Music Rights Cloud data export\nGenerated ${new Date().toISOString()}\nDocument files are not included (download them from Documents). Encrypted PAN/bank fields are omitted.\n`) });
    const buf = await zip(files);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('X-Checksum-Sha256', sha256(buf));
    res.setHeader('Content-Disposition', contentDisposition(`music-rights-export-${new Date().toISOString().slice(0, 10)}.zip`));
    res.send(buf);
  }
}
