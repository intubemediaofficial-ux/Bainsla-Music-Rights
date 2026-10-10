import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsDate, IsIn, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';
import { DisputeEventType, DisputeStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Auth, type OrgContext, RequirePermission } from '../auth/context.js';
import { pageArgs, toPage } from '../common/pagination.js';
import { contains, found, ListQuery, toDate, trimOrNull } from '../catalog/shared.js';
import { AssetRef, assetInclude, history, ownerDocs, resolveAsset } from './shared.js';

const STATUSES = Object.values(DisputeStatus);
export const CLOSED: DisputeStatus[] = ['RESOLVED_WON', 'RESOLVED_LOST', 'WITHDRAWN'];

class Fields {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) counterparty?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) platform?: string;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(120) caseNo?: string | null;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(120) claimType?: string | null;
  @IsOptional() @trimOrNull() @IsUrl({ require_protocol: true, protocols: ['http', 'https'] }) @MaxLength(500) contentUrl?: string | null;
  @IsOptional() @toDate() @IsDate() deadline?: Date | null;
}
class CreateDto extends Fields {
  @IsIn(['WORK', 'RECORDING']) assetType!: 'WORK' | 'RECORDING';
  @IsString() assetId!: string;
  @IsString() @MinLength(2) @MaxLength(200) declare counterparty: string;
  @IsString() @MinLength(2) @MaxLength(80) declare platform: string;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(4000) description?: string | null;
}
class StatusDto {
  @IsIn(STATUSES) status!: DisputeStatus;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(4000) note?: string | null;
}
class EventDto {
  @IsIn(['NOTE', 'CORRESPONDENCE', 'EVIDENCE', 'DEADLINE']) type!: Exclude<DisputeEventType, 'STATUS_CHANGE'>;
  @IsString() @MinLength(1) @MaxLength(4000) body!: string;
  @IsOptional() @toDate() @IsDate() occurredAt?: Date;
  @IsOptional() @toDate() @IsDate() dueAt?: Date | null;
  @IsOptional() @trimOrNull() @IsString() documentId?: string | null;
}
class DisputeQuery extends ListQuery {
  @IsOptional() @IsIn([...STATUSES, 'open', 'closed']) status?: string;
  @IsOptional() @IsString() workId?: string;
  @IsOptional() @IsString() recordingId?: string;
}

@ApiTags('disputes')
@Controller('disputes')
export class DisputesController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Get()
  @RequirePermission('disputes.read')
  list(@Auth() auth: OrgContext, @Query() q: DisputeQuery) {
    const c = contains(q.q);
    const st = q.status === 'open' ? { status: { notIn: CLOSED } } : q.status === 'closed' ? { status: { in: CLOSED } } : q.status ? { status: q.status as DisputeStatus } : {};
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const base = {
        organizationId: auth.orgId,
        ...(q.workId ? { workId: q.workId } : {}),
        ...(q.recordingId ? { recordingId: q.recordingId } : {}),
        ...(c ? { OR: [{ counterparty: c }, { platform: c }, { caseNo: c }, { work: { title: c } }, { recording: { title: c } }] } : {}),
      };
      const [rows, groups] = await Promise.all([
        tx.dispute.findMany({ where: { ...base, ...st }, include: { ...assetInclude, _count: { select: { events: true } } }, orderBy: [{ deadline: { sort: 'asc', nulls: 'last' } }, { openedAt: 'desc' }, { id: 'asc' }], ...pageArgs(q, 50) }),
        tx.dispute.groupBy({ by: ['status'], where: base, _count: true }),
      ]);
      return { ...toPage(rows, q, 50), counts: Object.fromEntries(groups.map((g) => [g.status, g._count])) };
    });
  }

  @Get(':id')
  @RequirePermission('disputes.read')
  get(@Auth() auth: OrgContext, @Param('id') id: string) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const d = found(await tx.dispute.findFirst({ where: { id, organizationId: auth.orgId }, include: { ...assetInclude, events: { orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }] } } }), 'Dispute');
      const claims = await tx.rightsClaim.findMany({
        where: { organizationId: auth.orgId, ...(d.workId ? { workId: d.workId } : { recordingId: d.recordingId }), status: { not: 'REJECTED' } },
        include: { party: { select: { id: true, legalName: true } } },
        orderBy: [{ rightType: 'asc' }, { sharePercent: 'desc' }],
      });
      return { ...d, closed: CLOSED.includes(d.status), claims, documents: await ownerDocs(tx, auth.orgId, 'DISPUTE', id), history: await history(tx, auth.orgId, 'dispute', id) };
    });
  }

  @Post()
  @RequirePermission('disputes.write')
  create(@Auth() auth: OrgContext, @Body() dto: CreateDto) {
    const { assetType, assetId, description, ...fields } = dto;
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const asset = await resolveAsset(tx, auth.orgId, { assetType, assetId } as AssetRef);
      const d = await tx.dispute.create({ data: { organizationId: auth.orgId, ...asset, ...fields, createdById: auth.userId } });
      await tx.disputeEvent.create({ data: { organizationId: auth.orgId, disputeId: d.id, type: 'NOTE', body: description || `Dispute opened with ${d.counterparty} on ${d.platform}.`, actorId: auth.userId, dueAt: d.deadline } });
      await this.audit.log(tx, auth, { action: 'dispute.create', entityType: 'dispute', entityId: d.id, after: d });
      return d;
    });
  }

  @Patch(':id')
  @RequirePermission('disputes.write')
  update(@Auth() auth: OrgContext, @Param('id') id: string, @Body() dto: Fields) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const before = found(await tx.dispute.findFirst({ where: { id, organizationId: auth.orgId } }), 'Dispute');
      if (CLOSED.includes(before.status)) throw new BadRequestException('Closed disputes cannot be edited — reopen it first');
      const d = await tx.dispute.update({ where: { id }, data: dto });
      await this.audit.log(tx, auth, { action: 'dispute.update', entityType: 'dispute', entityId: id, before, after: d });
      return d;
    });
  }

  @Post(':id/status')
  @RequirePermission('disputes.write')
  status(@Auth() auth: OrgContext, @Param('id') id: string, @Body() dto: StatusDto) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const before = found(await tx.dispute.findFirst({ where: { id, organizationId: auth.orgId } }), 'Dispute');
      if (before.status === dto.status) throw new BadRequestException(`Dispute is already ${dto.status}`);
      const closing = CLOSED.includes(dto.status);
      if (closing && !dto.note) throw new BadRequestException('Describe the outcome when closing a dispute');
      const d = await tx.dispute.update({
        where: { id },
        data: { status: dto.status, resolvedAt: closing ? new Date() : null, ...(closing ? { resolution: dto.note } : {}) },
      });
      await tx.disputeEvent.create({ data: { organizationId: auth.orgId, disputeId: id, type: 'STATUS_CHANGE', body: `${before.status} → ${dto.status}${dto.note ? `: ${dto.note}` : ''}`, actorId: auth.userId } });
      await this.audit.log(tx, auth, { action: 'dispute.status', entityType: 'dispute', entityId: id, before: { status: before.status }, after: { status: d.status }, meta: { note: dto.note } });
      return d;
    });
  }

  @Post(':id/events')
  @RequirePermission('disputes.write')
  addEvent(@Auth() auth: OrgContext, @Param('id') id: string, @Body() dto: EventDto) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const d = found(await tx.dispute.findFirst({ where: { id, organizationId: auth.orgId } }), 'Dispute');
      if (dto.documentId) found(await tx.document.findFirst({ where: { id: dto.documentId, organizationId: auth.orgId } }), 'Document');
      const e = await tx.disputeEvent.create({ data: { organizationId: auth.orgId, disputeId: id, type: dto.type, body: dto.body, occurredAt: dto.occurredAt ?? new Date(), dueAt: dto.dueAt ?? null, documentId: dto.documentId ?? null, actorId: auth.userId } });
      if (dto.type === 'DEADLINE' && dto.dueAt && !CLOSED.includes(d.status)) await tx.dispute.update({ where: { id }, data: { deadline: dto.dueAt } });
      if (dto.type === 'EVIDENCE' && d.status === 'OPEN') await tx.dispute.update({ where: { id }, data: { status: 'EVIDENCE_SUBMITTED' } });
      await this.audit.log(tx, auth, { action: 'dispute.event', entityType: 'dispute', entityId: id, after: { type: e.type } });
      return e;
    });
  }
}
