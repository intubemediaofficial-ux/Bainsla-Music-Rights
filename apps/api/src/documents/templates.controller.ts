import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { TemplateKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Auth, type OrgContext, RequirePermission } from '../auth/context.js';
import { found } from '../catalog/shared.js';
import { templateVariables } from './render.service.js';

const KINDS = ['AGREEMENT', 'NOC', 'ANNEXURE', 'DECLARATION'] as const;

class TemplateDto {
  @IsIn(KINDS) kind!: TemplateKind;
  @IsString() @MinLength(2) @MaxLength(200) name!: string;
  @IsIn(['en', 'hi']) language!: string;
  @IsString() @MinLength(10) @MaxLength(200_000) body!: string;
}
class UpdateTemplateDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MinLength(10) @MaxLength(200_000) body?: string;
}
class TemplateQuery {
  @IsOptional() @IsIn(KINDS) kind?: TemplateKind;
  @IsOptional() @IsIn(['en', 'hi']) language?: string;
}

/** Strip anything executable; templates are rendered with JavaScript disabled but stay defensive. */
const sanitize = (html: string) =>
  html.replace(/<\s*(script|iframe|object|embed|link|meta)[\s\S]*?(<\/\s*\1\s*>|\/?>)/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '').replace(/javascript:/gi, '');

@ApiTags('templates')
@Controller('templates')
export class TemplatesController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Get()
  @RequirePermission('documents.read')
  list(@Auth() auth: OrgContext, @Query() q: TemplateQuery) {
    return this.prisma.tenant(auth.orgId, (tx) =>
      tx.documentTemplate.findMany({
        where: { OR: [{ organizationId: auth.orgId }, { organizationId: null, isStarter: true }], status: { not: 'SUPERSEDED' }, ...(q.kind ? { kind: q.kind } : {}), ...(q.language ? { language: q.language } : {}) },
        orderBy: [{ isStarter: 'asc' }, { kind: 'asc' }, { name: 'asc' }],
        select: { id: true, organizationId: true, kind: true, name: true, language: true, version: true, status: true, isStarter: true, approvedAt: true, updatedAt: true, variables: true },
      }),
    );
  }

  @Get(':id')
  @RequirePermission('documents.read')
  async get(@Auth() auth: OrgContext, @Param('id') id: string) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const t = found(await tx.documentTemplate.findFirst({ where: { id, OR: [{ organizationId: auth.orgId }, { organizationId: null }] } }), 'Template');
      const history = t.organizationId
        ? await tx.documentTemplate.findMany({ where: { organizationId: auth.orgId, kind: t.kind, name: t.name }, orderBy: { version: 'desc' }, select: { id: true, version: true, status: true, updatedAt: true } })
        : [];
      return { ...t, editable: t.organizationId === auth.orgId && t.status !== 'SUPERSEDED', history };
    });
  }

  @Post()
  @RequirePermission('documents.write')
  create(@Auth() auth: OrgContext, @Body() dto: TemplateDto) {
    const body = sanitize(dto.body);
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const t = await tx.documentTemplate.create({
        data: { organizationId: auth.orgId, kind: dto.kind, name: dto.name.trim(), language: dto.language, body, variables: templateVariables(body), createdById: auth.userId },
      });
      await this.audit.log(tx, auth, { action: 'template.create', entityType: 'template', entityId: t.id, after: { name: t.name, kind: t.kind } });
      return t;
    });
  }

  /** Copy a starter (or any visible) template into the organization as an editable draft. */
  @Post(':id/copy')
  @RequirePermission('documents.write')
  copy(@Auth() auth: OrgContext, @Param('id') id: string) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const src = found(await tx.documentTemplate.findFirst({ where: { id, OR: [{ organizationId: auth.orgId }, { organizationId: null }] } }), 'Template');
      const t = await tx.documentTemplate.create({
        data: { organizationId: auth.orgId, kind: src.kind, name: `${src.name} (copy)`, language: src.language, body: src.body, variables: src.variables ?? [], createdById: auth.userId },
      });
      await this.audit.log(tx, auth, { action: 'template.copy', entityType: 'template', entityId: t.id, after: { from: src.id } });
      return t;
    });
  }

  /** Editing an approved template creates the next version; the approved one is superseded only when the new one is approved. */
  @Patch(':id')
  @RequirePermission('documents.write')
  update(@Auth() auth: OrgContext, @Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const t = found(await tx.documentTemplate.findFirst({ where: { id, organizationId: auth.orgId } }), 'Template');
      if (t.status === 'SUPERSEDED') throw new BadRequestException('This version is superseded; edit the latest version');
      const body = dto.body !== undefined ? sanitize(dto.body) : t.body;
      if (t.status === 'APPROVED_TEMPLATE') {
        const next = await tx.documentTemplate.create({
          data: { organizationId: auth.orgId, kind: t.kind, name: dto.name?.trim() ?? t.name, language: t.language, body, variables: templateVariables(body), version: t.version + 1, createdById: auth.userId },
        });
        await this.audit.log(tx, auth, { action: 'template.new_version', entityType: 'template', entityId: next.id, after: { from: t.id, version: next.version } });
        return next;
      }
      const after = await tx.documentTemplate.update({ where: { id }, data: { name: dto.name?.trim() ?? t.name, body, variables: templateVariables(body), status: 'DRAFT', reviewedById: null, approvedAt: null } });
      await this.audit.log(tx, auth, { action: 'template.update', entityType: 'template', entityId: id });
      return after;
    });
  }

  @Post(':id/submit')
  @RequirePermission('documents.write')
  submit(@Auth() auth: OrgContext, @Param('id') id: string) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const t = found(await tx.documentTemplate.findFirst({ where: { id, organizationId: auth.orgId } }), 'Template');
      if (t.status !== 'DRAFT' && t.status !== 'REJECTED') throw new BadRequestException(`A ${t.status} template cannot be submitted`);
      const after = await tx.documentTemplate.update({ where: { id }, data: { status: 'UNDER_REVIEW' } });
      await this.audit.log(tx, auth, { action: 'template.submit', entityType: 'template', entityId: id });
      return after;
    });
  }

  @Post(':id/review')
  @RequirePermission('documents.review')
  review(@Auth() auth: OrgContext, @Param('id') id: string, @Body() dto: { decision?: string }) {
    if (dto.decision !== 'approve' && dto.decision !== 'reject') throw new BadRequestException('decision must be approve or reject');
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const t = found(await tx.documentTemplate.findFirst({ where: { id, organizationId: auth.orgId } }), 'Template');
      if (t.status !== 'UNDER_REVIEW') throw new BadRequestException('Only templates under review can be approved or rejected');
      if (dto.decision === 'approve' && t.createdById === auth.userId && !auth.permissions.has('billing.manage')) throw new ForbiddenException('A different reviewer must approve this template');
      if (dto.decision === 'approve') {
        await tx.documentTemplate.updateMany({ where: { organizationId: auth.orgId, kind: t.kind, name: t.name, status: 'APPROVED_TEMPLATE', id: { not: id } }, data: { status: 'SUPERSEDED' } });
      }
      const after = await tx.documentTemplate.update({
        where: { id },
        data: dto.decision === 'approve' ? { status: 'APPROVED_TEMPLATE', reviewedById: auth.userId, approvedAt: new Date() } : { status: 'REJECTED', reviewedById: auth.userId },
      });
      await this.audit.log(tx, auth, { action: `template.${dto.decision}`, entityType: 'template', entityId: id });
      return after;
    });
  }

  @Delete(':id')
  @RequirePermission('documents.write')
  remove(@Auth() auth: OrgContext, @Param('id') id: string) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const t = found(await tx.documentTemplate.findFirst({ where: { id, organizationId: auth.orgId }, include: { _count: { select: { agreements: true } } } }), 'Template');
      if (t.status === 'APPROVED_TEMPLATE' || t._count.agreements > 0) throw new BadRequestException('Approved or in-use templates cannot be deleted');
      await tx.documentTemplate.delete({ where: { id } });
      await this.audit.log(tx, auth, { action: 'template.delete', entityType: 'template', entityId: id, before: { name: t.name } });
      return { ok: true };
    });
  }
}
