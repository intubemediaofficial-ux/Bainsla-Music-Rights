import { Body, Controller, Get, NotFoundException, Param, Post, Query, Res, StreamableFile } from '@nestjs/common';
import { meter } from '../billing/usage.js';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { VerificationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Auth, type OrgContext, RequirePermission } from '../auth/context.js';
import { pageArgs, toPage } from '../common/pagination.js';
import { contains, found, ListQuery } from '../catalog/shared.js';
import { StorageService } from '../documents/storage.service.js';
import { assetInclude, resolveAsset } from './shared.js';
import { PackagesService } from './packages.service.js';
import { contentDisposition, fileName } from './files.js';

class GenerateDto {
  @IsIn(['WORK', 'RECORDING']) assetType!: 'WORK' | 'RECORDING';
  @IsString() assetId!: string;
  @IsOptional() @IsString() @Matches(/^[\w-]{8,80}$/) idempotencyKey?: string;
}
class PkgQuery extends ListQuery {
  @IsOptional() @IsIn(Object.values(VerificationStatus)) status?: VerificationStatus;
  @IsOptional() @IsString() workId?: string;
  @IsOptional() @IsString() recordingId?: string;
}
class DownloadQuery {
  @IsOptional() @IsIn(['zip', 'pdf']) @MaxLength(3) kind?: 'zip' | 'pdf';
}

const LIST_SELECT = { id: true, assetType: true, status: true, warnings: true, sha256: true, generatedAt: true, generatedById: true, pdfStorageKey: true, ...assetInclude, _count: { select: { shareLinks: true } } } as const;

@ApiTags('packages')
@Controller('packages')
export class PackagesController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly packages: PackagesService, private readonly storage: StorageService) {}

  @Get()
  @RequirePermission('documents.read')
  list(@Auth() auth: OrgContext, @Query() q: PkgQuery) {
    const c = contains(q.q);
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const base = { organizationId: auth.orgId, ...(q.workId ? { workId: q.workId } : {}), ...(q.recordingId ? { recordingId: q.recordingId } : {}), ...(c ? { OR: [{ work: { title: c } }, { recording: { title: c } }, { recording: { isrc: c } }] } : {}) };
      const [rows, groups] = await Promise.all([
        tx.verificationPackage.findMany({ where: { ...base, ...(q.status ? { status: q.status } : {}) }, select: LIST_SELECT, orderBy: [{ generatedAt: 'desc' }, { id: 'asc' }], ...pageArgs(q, 50) }),
        tx.verificationPackage.groupBy({ by: ['status'], where: base, _count: true }),
      ]);
      return { ...toPage(rows.map(({ pdfStorageKey, ...r }) => ({ ...r, hasPdf: !!pdfStorageKey })), q, 50), counts: Object.fromEntries(groups.map((g) => [g.status, g._count])) };
    });
  }

  @Get(':id')
  @RequirePermission('documents.read')
  get(@Auth() auth: OrgContext, @Param('id') id: string) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const p = found(await tx.verificationPackage.findFirst({
        where: { id, organizationId: auth.orgId },
        select: { ...LIST_SELECT, manifest: true, shareLinks: { orderBy: { createdAt: 'desc' }, select: { id: true, label: true, expiresAt: true, revokedAt: true, viewCount: true, maxViews: true, createdAt: true } } },
      }), 'Package');
      const { pdfStorageKey, ...rest } = p;
      return { ...rest, hasPdf: !!pdfStorageKey };
    });
  }

  @Post()
  @RequirePermission('packages.generate')
  async generate(@Auth() auth: OrgContext, @Body() dto: GenerateDto) {
    const ref = { assetType: dto.assetType, assetId: dto.assetId };
    const existing = await this.prisma.tenant(auth.orgId, async (tx) => {
      await resolveAsset(tx, auth.orgId, ref);
      return dto.idempotencyKey ? tx.verificationPackage.findFirst({ where: { organizationId: auth.orgId, idempotencyKey: dto.idempotencyKey }, select: { id: true, status: true, warnings: true, sha256: true } }) : null;
    });
    if (existing) return { ...existing, reused: true };
    const g = await this.packages.generate(auth.orgId, auth.userId, ref);
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const p = await tx.verificationPackage.create({
        data: {
          id: g.id, organizationId: auth.orgId, assetType: dto.assetType, workId: dto.assetType === 'WORK' ? dto.assetId : null, recordingId: dto.assetType === 'RECORDING' ? dto.assetId : null,
          status: g.status, manifest: g.manifest as object, warnings: g.warnings, storageKey: g.storageKey, pdfStorageKey: g.pdfStorageKey, sha256: g.sha256, idempotencyKey: dto.idempotencyKey ?? null, generatedById: auth.userId,
        },
        select: { id: true, status: true, warnings: true, sha256: true },
      });
      if (g.pdfStorageKey) await meter(tx, auth.orgId, 'PDF_JOBS', 1, p.id);
      await this.audit.log(tx, auth, { action: 'package.generate', entityType: 'verification_package', entityId: p.id, after: { status: p.status, sha256: p.sha256, asset: ref, bytes: g.zipBytes } });
      return { ...p, reused: false };
    });
  }

  @Get(':id/download')
  @RequirePermission('documents.read')
  async download(@Auth() auth: OrgContext, @Param('id') id: string, @Query() q: DownloadQuery, @Res({ passthrough: true }) res: Response) {
    const kind = q.kind ?? 'zip';
    const p = await this.prisma.tenant(auth.orgId, async (tx) => {
      const row = found(await tx.verificationPackage.findFirst({ where: { id, organizationId: auth.orgId }, select: { storageKey: true, pdfStorageKey: true, sha256: true, ...assetInclude } }), 'Package');
      await this.audit.log(tx, auth, { action: 'package.download', entityType: 'verification_package', entityId: id, meta: { kind } });
      return row;
    });
    const key = kind === 'pdf' ? p.pdfStorageKey : p.storageKey;
    if (!key) throw new NotFoundException(kind === 'pdf' ? 'No PDF summary for this package (PDF renderer was unavailable) — download the ZIP' : 'Package file missing');
    const buf = await this.storage.get(auth.orgId, key);
    const title = p.recording?.title ?? p.work?.title ?? 'package';
    res.set({ 'Content-Type': kind === 'pdf' ? 'application/pdf' : 'application/zip', 'Content-Disposition': contentDisposition(fileName(title, kind)), 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store', ...(kind === 'zip' && p.sha256 ? { 'X-Checksum-Sha256': p.sha256 } : {}) });
    return new StreamableFile(buf);
  }
}
