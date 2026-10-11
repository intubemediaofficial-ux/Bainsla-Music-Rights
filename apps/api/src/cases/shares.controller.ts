import { BadRequestException, Body, Controller, ForbiddenException, Get, GoneException, HttpException, HttpStatus, Param, Post, Query, Req, Res, StreamableFile, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Auth, type OrgContext, Public, RequirePermission } from '../auth/context.js';
import { pageArgs, toPage } from '../common/pagination.js';
import { found, ListQuery, trimOrNull } from '../catalog/shared.js';
import { randomToken, sha256 } from '../common/crypto.js';
import { hashPassword, verifyPassword } from '../common/password.js';
import { config } from '../config.js';
import { StorageService } from '../documents/storage.service.js';
import { assetInclude } from './shared.js';
import { PackagesService, summaryHtml, type Warning } from './packages.service.js';
import { contentDisposition, fileName } from './files.js';

class CreateShareDto {
  @IsString() packageId!: string;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(120) label?: string | null;
  @IsString() @MinLength(8) @MaxLength(128) password!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(90) expiresInDays?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) maxViews?: number | null;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(120) watermark?: string | null;
}
class ShareQuery extends ListQuery {
  @IsOptional() @IsIn(['active', 'expired', 'revoked']) state?: string;
}
class UnlockDto {
  @IsString() @MaxLength(128) password!: string;
}
class PublicDownloadQuery {
  @IsIn(['zip', 'pdf']) kind!: 'zip' | 'pdf';
  @Type(() => Number) @IsInt() exp!: number;
  @IsString() @MaxLength(128) sig!: string;
}

const MAX_FAILED_PER_HOUR = 10;
type LinkState = { revokedAt: Date | null; expiresAt: Date; maxViews: number | null; viewCount: number };
export function shareState(l: LinkState, now = new Date()) {
  if (l.revokedAt) return 'revoked' as const;
  if (l.expiresAt < now) return 'expired' as const;
  if (l.maxViews != null && l.viewCount >= l.maxViews) return 'exhausted' as const;
  return 'active' as const;
}

@ApiTags('shares')
@Controller('shares')
export class SharesController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Get()
  @RequirePermission('shares.manage')
  list(@Auth() auth: OrgContext, @Query() q: ShareQuery) {
    const now = new Date();
    const st = q.state === 'revoked' ? { revokedAt: { not: null } } : q.state === 'expired' ? { revokedAt: null, expiresAt: { lt: now } } : q.state === 'active' ? { revokedAt: null, expiresAt: { gte: now } } : {};
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const rows = await tx.shareLink.findMany({
        where: { organizationId: auth.orgId, ...st },
        select: { id: true, label: true, expiresAt: true, revokedAt: true, viewCount: true, maxViews: true, watermark: true, createdAt: true, package: { select: { id: true, status: true, ...assetInclude } }, _count: { select: { accesses: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...pageArgs(q, 50),
      });
      return toPage(rows.map((r) => ({ ...r, state: shareState(r, now) })), q, 50);
    });
  }

  @Get(':id')
  @RequirePermission('shares.manage')
  get(@Auth() auth: OrgContext, @Param('id') id: string) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const l = found(await tx.shareLink.findFirst({
        where: { id, organizationId: auth.orgId },
        select: { id: true, label: true, expiresAt: true, revokedAt: true, viewCount: true, maxViews: true, watermark: true, createdAt: true, package: { select: { id: true, status: true, ...assetInclude } }, accesses: { orderBy: { accessedAt: 'desc' }, take: 200 } },
      }), 'Share link');
      return { ...l, state: shareState(l) };
    });
  }

  @Post()
  @RequirePermission('shares.manage')
  async create(@Auth() auth: OrgContext, @Body() dto: CreateShareDto) {
    const token = randomToken(24);
    const passwordHash = await hashPassword(dto.password);
    const expiresAt = new Date(Date.now() + (dto.expiresInDays ?? 7) * 86400_000);
    return this.prisma.tenant(auth.orgId, async (tx) => {
      found(await tx.verificationPackage.findFirst({ where: { id: dto.packageId, organizationId: auth.orgId }, select: { id: true } }), 'Package');
      const l = await tx.shareLink.create({ data: { organizationId: auth.orgId, packageId: dto.packageId, tokenHash: sha256(token), passwordHash, label: dto.label ?? null, expiresAt, maxViews: dto.maxViews ?? null, watermark: dto.watermark ?? null, createdById: auth.userId } });
      await this.audit.log(tx, auth, { action: 'share.create', entityType: 'share_link', entityId: l.id, after: { packageId: l.packageId, label: l.label, expiresAt, maxViews: l.maxViews } });
      return { id: l.id, expiresAt, url: `${config.appUrl.replace(/\/$/, '')}/s/${token}` };
    });
  }

  @Post(':id/revoke')
  @RequirePermission('shares.manage')
  revoke(@Auth() auth: OrgContext, @Param('id') id: string) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const l = found(await tx.shareLink.findFirst({ where: { id, organizationId: auth.orgId } }), 'Share link');
      if (l.revokedAt) throw new BadRequestException('Already revoked');
      const r = await tx.shareLink.update({ where: { id }, data: { revokedAt: new Date() }, select: { id: true, revokedAt: true } });
      await this.audit.log(tx, auth, { action: 'share.revoke', entityType: 'share_link', entityId: id });
      return r;
    });
  }
}

/** Unauthenticated recipient endpoints. The raw token is only ever compared by SHA-256 hash. */
@ApiTags('public')
@Controller('public/shares')
export class PublicSharesController {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService, private readonly packages: PackagesService) {}

  private async lookup(token: string) {
    if (!/^[\w-]{20,100}$/.test(token)) throw new GoneException('This link is invalid or has expired');
    const l = await this.prisma.system((tx) => tx.shareLink.findUnique({ where: { tokenHash: sha256(token) }, include: { package: { include: assetInclude } } }));
    if (!l) throw new GoneException('This link is invalid or has expired');
    const org = await this.prisma.system((tx) => tx.organization.findUnique({ where: { id: l.organizationId }, select: { legalName: true } }));
    return { ...l, package: { ...l.package, organization: { name: org?.legalName ?? '' } } };
  }
  private logAccess(orgId: string, shareLinkId: string, req: Request, action: string) {
    return this.prisma.tenant(orgId, (tx) => tx.shareLinkAccess.create({ data: { organizationId: orgId, shareLinkId, action, ip: req.ip ?? null, userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300) || null } }));
  }

  @Public()
  @Get(':token')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async meta(@Param('token') token: string) {
    const l = await this.lookup(token);
    const state = shareState(l);
    return { state, label: l.label, organization: l.package.organization.name, expiresAt: l.expiresAt, requiresPassword: !!l.passwordHash };
  }

  @Public()
  @Post(':token/unlock')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async unlock(@Param('token') token: string, @Body() dto: UnlockDto, @Req() req: Request) {
    const l = await this.lookup(token);
    const state = shareState(l);
    if (state !== 'active') throw new GoneException(`This link has ${state === 'exhausted' ? 'reached its view limit' : state === 'revoked' ? 'been revoked' : 'expired'}`);
    const failed = await this.prisma.tenant(l.organizationId, (tx) => tx.shareLinkAccess.count({ where: { organizationId: l.organizationId, shareLinkId: l.id, action: 'DENIED', accessedAt: { gte: new Date(Date.now() - 3600_000) } } }));
    if (failed >= MAX_FAILED_PER_HOUR) throw new HttpException('Too many wrong passwords. Try again in an hour.', HttpStatus.TOO_MANY_REQUESTS);
    if (l.passwordHash && !(await verifyPassword(l.passwordHash, dto.password))) {
      await this.logAccess(l.organizationId, l.id, req, 'DENIED');
      throw new UnauthorizedException('Wrong password');
    }
    await this.prisma.tenant(l.organizationId, (tx) => tx.shareLink.update({ where: { id: l.id }, data: { viewCount: { increment: 1 } } }));
    await this.logAccess(l.organizationId, l.id, req, 'VIEW');
    const p = l.package;
    const m = p.manifest as { files?: { path: string; sha256: string; bytes: number; source?: { title: string; status: string; category: string } }[]; data?: unknown };
    const link = (kind: string) => {
      const s = this.storage.sign('share', `${l.id}:${kind}`, 600);
      return `/api/v1/public/shares/${token}/download?kind=${kind}&exp=${s.exp}&sig=${s.sig}`;
    };
    return {
      label: l.label, organization: p.organization.name, expiresAt: l.expiresAt, watermark: l.watermark,
      package: { status: p.status, generatedAt: p.generatedAt, sha256: p.sha256, asset: p.recording ?? p.work, assetType: p.assetType, warnings: p.warnings, files: m.files ?? [], data: m.data },
      downloads: { zip: link('zip'), pdf: link('pdf') },
    };
  }

  @Public()
  @Get(':token/download')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async download(@Param('token') token: string, @Query() q: PublicDownloadQuery, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const l = await this.lookup(token);
    if (shareState({ ...l, maxViews: null }) !== 'active') throw new GoneException('This link is no longer active');
    if (!this.storage.checkSignature('share', `${l.id}:${q.kind}`, q.exp, q.sig)) throw new ForbiddenException('Download link expired — unlock the share again');
    const p = l.package;
    const title = p.recording?.title ?? p.work?.title ?? 'package';
    let buf: Buffer;
    let mime = q.kind === 'zip' ? 'application/zip' : 'application/pdf';
    let ext: string = q.kind;
    if (q.kind === 'zip') {
      buf = await this.storage.get(l.organizationId, p.storageKey!);
      res.set('X-Checksum-Sha256', p.sha256 ?? '');
    } else {
      const m = p.manifest as unknown as Parameters<typeof summaryHtml>[0];
      const mark = [l.watermark, `Shared by ${p.organization.name}${l.label ? ` · ${l.label}` : ''} · ${new Date().toISOString().slice(0, 10)}`].filter(Boolean).join(' — ');
      const html = summaryHtml({ ...m, status: p.status, warnings: p.warnings as Warning[], files: m.files ?? [], data: m.data }, mark);
      const pdf = await this.packages.pdfOrNull(html, `${title} · shared copy`);
      if (pdf) buf = pdf;
      else { buf = Buffer.from(html); mime = 'text/html; charset=utf-8'; ext = 'html'; }
    }
    await this.logAccess(l.organizationId, l.id, req, q.kind === 'zip' ? 'DOWNLOAD_ZIP' : 'DOWNLOAD_PDF');
    res.set({ 'Content-Type': mime, 'Content-Disposition': contentDisposition(fileName(title, ext)), 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' });
    return new StreamableFile(buf);
  }
}
