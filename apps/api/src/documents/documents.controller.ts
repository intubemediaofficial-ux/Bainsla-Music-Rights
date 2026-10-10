/// <reference types="multer" />
import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import type { DocumentCategory, DocumentStatus, OwnerType, Prisma } from '@prisma/client';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Auth, type OrgContext, RequirePermission } from '../auth/context.js';
import { pageArgs, toPage } from '../common/pagination.js';
import { found, ListQuery, toDate, trimOrNull } from '../catalog/shared.js';
import { DocumentsService, MAX_UPLOAD_BYTES, publicVersion } from './documents.service.js';

const OWNER_TYPES = ['ORGANIZATION', 'PARTY', 'WORK', 'RECORDING', 'RELEASE', 'RIGHTS_CLAIM', 'LICENSE', 'AGREEMENT', 'REGISTRATION', 'DISPUTE'] as const;
const CATEGORIES = ['AGREEMENT', 'NOC', 'ANNEXURE', 'DECLARATION', 'CERTIFICATE', 'REGISTRATION', 'EVIDENCE', 'CORRESPONDENCE', 'INVOICE', 'OTHER'] as const;
const STATUSES = ['DRAFT', 'UNDER_REVIEW', 'SENT_FOR_SIGNATURE', 'EXECUTED', 'REJECTED', 'SUPERSEDED', 'EXPIRED'] as const;

/** Allowed document status moves. EXECUTED is terminal except for being superseded/expired. */
export const DOC_TRANSITIONS: Record<string, DocumentStatus[]> = {
  DRAFT: ['UNDER_REVIEW', 'SENT_FOR_SIGNATURE', 'EXECUTED', 'REJECTED'],
  UNDER_REVIEW: ['DRAFT', 'SENT_FOR_SIGNATURE', 'EXECUTED', 'REJECTED'],
  SENT_FOR_SIGNATURE: ['DRAFT', 'EXECUTED', 'REJECTED'],
  EXECUTED: ['SUPERSEDED', 'EXPIRED'],
  REJECTED: ['DRAFT'],
  SUPERSEDED: [],
  EXPIRED: [],
  APPROVED_TEMPLATE: [],
};

class UploadDto {
  @IsIn(OWNER_TYPES) ownerType!: OwnerType;
  @IsString() ownerId!: string;
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsIn(CATEGORIES) category?: DocumentCategory;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(200) signatoryName?: string | null;
  @IsOptional() @toDate() @IsDate() signedDate?: Date | null;
  @IsOptional() @toDate() @IsDate() expiresAt?: Date | null;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(2000) notes?: string | null;
}
class UpdateDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsIn(CATEGORIES) category?: DocumentCategory;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(200) signatoryName?: string | null;
  @IsOptional() @toDate() @IsDate() signedDate?: Date | null;
  @IsOptional() @toDate() @IsDate() expiresAt?: Date | null;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(2000) notes?: string | null;
}
class StatusDto {
  @IsIn(STATUSES) status!: DocumentStatus;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(500) note?: string | null;
}
class DocQuery extends ListQuery {
  @IsOptional() @IsIn(OWNER_TYPES) ownerType?: OwnerType;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsIn(CATEGORIES) category?: DocumentCategory;
  @IsOptional() @IsIn(STATUSES) status?: DocumentStatus;
}
class FileQuery {
  @Type(() => Number) @IsInt() exp!: number;
  @IsString() sig!: string;
}

const upload = FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
const contentDisposition = (name: string) =>
  `attachment; filename="${name.replace(/[^\x20-\x7e]|"/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`;

@ApiTags('documents')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly docs: DocumentsService) {}

  @Get()
  @RequirePermission('documents.read')
  list(@Auth() auth: OrgContext, @Query() q: DocQuery) {
    const where: Prisma.DocumentWhereInput = {
      organizationId: auth.orgId,
      ...(q.ownerType ? { ownerType: q.ownerType } : {}),
      ...(q.ownerId ? { ownerId: q.ownerId } : {}),
      ...(q.category ? { category: q.category } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.q ? { OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { signatoryName: { contains: q.q, mode: 'insensitive' } }, { versions: { some: { filename: { contains: q.q, mode: 'insensitive' } } } }] } : {}),
    };
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const rows = await tx.document.findMany({
        where, ...pageArgs(q), orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        include: { versions: { orderBy: { versionNo: 'desc' }, take: 1 }, _count: { select: { versions: true } } },
      });
      const [counts, owners] = await Promise.all([
        tx.document.groupBy({ by: ['status'], where: { organizationId: auth.orgId }, _count: true }),
        this.ownerLabels(tx, auth.orgId, rows),
      ]);
      const page = toPage(rows.map((d) => ({ ...d, owner: owners.get(`${d.ownerType}:${d.ownerId}`) ?? null, versions: d.versions.map(publicVersion) })), q);
      return { ...page, counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) };
    });
  }

  private async ownerLabels(tx: Prisma.TransactionClient, orgId: string, rows: { ownerType: OwnerType; ownerId: string }[]) {
    const ids = (t: OwnerType) => rows.filter((r) => r.ownerType === t).map((r) => r.ownerId);
    const out = new Map<string, string>();
    const [w, r, rel, p, a] = await Promise.all([
      tx.musicalWork.findMany({ where: { organizationId: orgId, id: { in: ids('WORK') } }, select: { id: true, title: true } }),
      tx.recording.findMany({ where: { organizationId: orgId, id: { in: ids('RECORDING') } }, select: { id: true, title: true } }),
      tx.release.findMany({ where: { organizationId: orgId, id: { in: ids('RELEASE') } }, select: { id: true, title: true } }),
      tx.party.findMany({ where: { organizationId: orgId, id: { in: ids('PARTY') } }, select: { id: true, legalName: true } }),
      tx.agreement.findMany({ where: { organizationId: orgId, id: { in: ids('AGREEMENT') } }, select: { id: true, title: true } }),
    ]);
    w.forEach((x) => out.set(`WORK:${x.id}`, x.title));
    r.forEach((x) => out.set(`RECORDING:${x.id}`, x.title));
    rel.forEach((x) => out.set(`RELEASE:${x.id}`, x.title));
    p.forEach((x) => out.set(`PARTY:${x.id}`, x.legalName));
    a.forEach((x) => out.set(`AGREEMENT:${x.id}`, x.title));
    return out;
  }

  @Get(':id')
  @RequirePermission('documents.read')
  get(@Auth() auth: OrgContext, @Param('id') id: string) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const d = found(await tx.document.findFirst({ where: { id, organizationId: auth.orgId }, include: { versions: { orderBy: { versionNo: 'desc' } } } }), 'Document');
      const owner = (await this.ownerLabels(tx, auth.orgId, [d])).get(`${d.ownerType}:${d.ownerId}`) ?? null;
      const history = await tx.auditLog.findMany({ where: { organizationId: auth.orgId, entityType: 'document', entityId: id }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, action: true, actorEmail: true, createdAt: true, summary: true } });
      return { ...d, owner, locked: d.status === 'EXECUTED' || d.status === 'SUPERSEDED', versions: d.versions.map(publicVersion), history };
    });
  }

  @Post()
  @RequirePermission('documents.write')
  @UseInterceptors(upload)
  async create(@Auth() auth: OrgContext, @Body() dto: UploadDto, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Attach a file');
    await this.prisma.tenant(auth.orgId, async (tx) => {
      await this.docs.assertOwner(tx, auth.orgId, dto.ownerType, dto.ownerId);
      await this.docs.assertQuota(tx, auth.orgId, file.size);
    });
    const name = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const stored = await this.docs.ingest(auth.orgId, file.buffer, name);
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const doc = await this.docs.createDocument(tx, auth.orgId, {
        ownerType: dto.ownerType, ownerId: dto.ownerId, title: dto.title?.trim() || stored.filename, category: dto.category ?? 'EVIDENCE',
        notes: dto.notes, signatoryName: dto.signatoryName, signedDate: dto.signedDate, expiresAt: dto.expiresAt, userId: auth.userId,
      }, stored);
      await this.audit.log(tx, auth, { action: 'document.upload', entityType: 'document', entityId: doc.id, after: { title: doc.title, ownerType: doc.ownerType, ownerId: doc.ownerId, sha256: stored.sha256, scan: stored.scanStatus } });
      return { ...doc, sha256: stored.sha256, scanStatus: stored.scanStatus };
    });
  }

  @Post(':id/versions')
  @RequirePermission('documents.write')
  @UseInterceptors(upload)
  async addVersion(@Auth() auth: OrgContext, @Param('id') id: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Attach a file');
    await this.prisma.tenant(auth.orgId, async (tx) => {
      const d = found(await tx.document.findFirst({ where: { id, organizationId: auth.orgId } }), 'Document');
      if (['EXECUTED', 'SUPERSEDED', 'EXPIRED'].includes(d.status)) throw new BadRequestException('This document is locked. Upload the new copy as a separate document instead.');
      await this.docs.assertQuota(tx, auth.orgId, file.size);
    });
    const stored = await this.docs.ingest(auth.orgId, file.buffer, Buffer.from(file.originalname, 'latin1').toString('utf8'));
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const v = await this.docs.addVersion(tx, auth.orgId, id, stored, { userId: auth.userId });
      await this.audit.log(tx, auth, { action: 'document.version', entityType: 'document', entityId: id, after: { versionNo: v.versionNo, sha256: v.sha256 } });
      return publicVersion(v);
    });
  }

  @Patch(':id')
  @RequirePermission('documents.write')
  update(@Auth() auth: OrgContext, @Param('id') id: string, @Body() dto: UpdateDto) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const d = found(await tx.document.findFirst({ where: { id, organizationId: auth.orgId } }), 'Document');
      const locked = ['EXECUTED', 'SUPERSEDED', 'EXPIRED'].includes(d.status);
      if (locked && Object.keys(dto).some((k) => k !== 'notes' && k !== 'expiresAt')) throw new BadRequestException('Executed documents are locked; only notes and expiry can change.');
      const after = await tx.document.update({ where: { id }, data: dto });
      await this.audit.log(tx, auth, { action: 'document.update', entityType: 'document', entityId: id, before: d, after });
      return after;
    });
  }

  @Post(':id/status')
  @RequirePermission('documents.write')
  setStatus(@Auth() auth: OrgContext, @Param('id') id: string, @Body() dto: StatusDto) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const d = found(await tx.document.findFirst({ where: { id, organizationId: auth.orgId }, include: { versions: { orderBy: { versionNo: 'desc' }, take: 1 } } }), 'Document');
      if (!DOC_TRANSITIONS[d.status]?.includes(dto.status)) throw new BadRequestException(`Cannot move a ${d.status} document to ${dto.status}`);
      if (['EXECUTED', 'REJECTED'].includes(dto.status) && !auth.permissions.has('documents.review')) throw new ForbiddenException('Only legal reviewers or admins can mark documents executed or rejected');
      if (dto.status === 'EXECUTED') {
        const v = d.versions[0];
        if (!v) throw new BadRequestException('Upload the signed copy first');
        if (v.isGenerated) throw new BadRequestException('An unsigned generated PDF is not evidence. Upload the signed/executed copy as a new version first.');
        if (v.scanStatus === 'INFECTED' || v.scanStatus === 'FAILED') throw new BadRequestException('The file failed the malware scan');
      }
      const after = await tx.document.update({ where: { id }, data: { status: dto.status, ...(dto.status === 'EXECUTED' && !d.signedDate ? { signedDate: new Date() } : {}) } });
      await this.audit.log(tx, auth, { action: `document.${dto.status.toLowerCase()}`, entityType: 'document', entityId: id, before: { status: d.status }, after: { status: dto.status, note: dto.note } });
      return after;
    });
  }

  @Delete(':id')
  @RequirePermission('documents.write')
  remove(@Auth() auth: OrgContext, @Param('id') id: string) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const d = found(await tx.document.findFirst({ where: { id, organizationId: auth.orgId } }), 'Document');
      if (!['DRAFT', 'REJECTED'].includes(d.status)) throw new BadRequestException('Only draft or rejected documents can be deleted; executed evidence is preserved.');
      await tx.document.delete({ where: { id } });
      await this.audit.log(tx, auth, { action: 'document.delete', entityType: 'document', entityId: id, before: { title: d.title, status: d.status } });
      return { ok: true };
    });
  }

  /** Short-lived signed URL; the download itself still requires the session and tenant. */
  @Get(':id/versions/:versionId/link')
  @RequirePermission('documents.read')
  link(@Auth() auth: OrgContext, @Param('id') id: string, @Param('versionId') versionId: string) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      found(await tx.documentVersion.findFirst({ where: { id: versionId, documentId: id, organizationId: auth.orgId }, select: { id: true } }), 'Version');
      const { exp, sig } = this.docs.storage.sign('doc', versionId, 300);
      return { url: `/api/v1/documents/files/${versionId}?exp=${exp}&sig=${sig}`, expiresAt: new Date(exp * 1000) };
    });
  }

  @Get('files/:versionId')
  @RequirePermission('documents.read')
  async download(@Auth() auth: OrgContext, @Param('versionId') versionId: string, @Query() q: FileQuery, @Res({ passthrough: true }) res: Response) {
    if (!this.docs.storage.checkSignature('doc', versionId, q.exp, q.sig)) throw new ForbiddenException('This download link is invalid or has expired');
    const v = await this.prisma.tenant(auth.orgId, async (tx) => {
      const row = found(await tx.documentVersion.findFirst({ where: { id: versionId, organizationId: auth.orgId } }), 'File');
      await this.audit.log(tx, auth, { action: 'document.download', entityType: 'document', entityId: row.documentId, after: { versionNo: row.versionNo } });
      return row;
    });
    const buf = await this.docs.storage.get(auth.orgId, v.storageKey);
    const sha = (await import('node:crypto')).createHash('sha256').update(buf).digest('hex');
    if (sha !== v.sha256) throw new BadRequestException('Checksum mismatch: the stored file is corrupted');
    res.set({ 'Content-Type': v.mime, 'Content-Disposition': contentDisposition(v.filename), 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store', 'X-Checksum-Sha256': v.sha256 });
    return new StreamableFile(buf);
  }
}
