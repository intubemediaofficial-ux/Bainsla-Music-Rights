import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsDate, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { RegistrationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Auth, type OrgContext, RequirePermission } from '../auth/context.js';
import { pageArgs, toPage } from '../common/pagination.js';
import { contains, found, ListQuery, toDate, trimOrNull } from '../catalog/shared.js';
import { AssetRef, assetInclude, history, ownerDocs, resolveAsset } from './shared.js';

const STATUSES = Object.values(RegistrationStatus);
/** Allowed manual moves. We only track filings made by the user; nothing is filed with any government system. */
const FLOW: Record<RegistrationStatus, RegistrationStatus[]> = {
  PLANNED: ['FILED', 'WITHDRAWN'],
  FILED: ['UNDER_EXAMINATION', 'OBJECTION', 'REGISTERED', 'REJECTED', 'WITHDRAWN'],
  UNDER_EXAMINATION: ['OBJECTION', 'HEARING', 'REGISTERED', 'REJECTED', 'WITHDRAWN'],
  OBJECTION: ['UNDER_EXAMINATION', 'HEARING', 'REGISTERED', 'REJECTED', 'WITHDRAWN'],
  HEARING: ['UNDER_EXAMINATION', 'REGISTERED', 'REJECTED', 'WITHDRAWN'],
  REGISTERED: [],
  REJECTED: ['PLANNED'],
  WITHDRAWN: ['PLANNED'],
};

class Fields {
  @IsOptional() @IsString() @MaxLength(10) jurisdiction?: string;
  @IsOptional() @IsString() @MaxLength(120) registry?: string;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(120) category?: string | null;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(80) applicationNo?: string | null;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(80) diaryNo?: string | null;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(80) registrationNo?: string | null;
  @IsOptional() @toDate() @IsDate() filedAt?: Date | null;
  @IsOptional() @toDate() @IsDate() registeredAt?: Date | null;
  @IsOptional() @toDate() @IsDate() nextDeadline?: Date | null;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(2000) objectionNote?: string | null;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(4000) notes?: string | null;
}
class CreateDto extends Fields {
  @IsIn(['WORK', 'RECORDING']) assetType!: 'WORK' | 'RECORDING';
  @IsString() assetId!: string;
}
class StatusDto {
  @IsIn(STATUSES) status!: RegistrationStatus;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(80) registrationNo?: string | null;
  @IsOptional() @toDate() @IsDate() date?: Date | null;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(2000) note?: string | null;
}
class RegQuery extends ListQuery {
  @IsOptional() @IsIn(STATUSES) status?: RegistrationStatus;
  @IsOptional() @IsString() workId?: string;
  @IsOptional() @IsString() recordingId?: string;
}

@ApiTags('registrations')
@Controller('registrations')
export class RegistrationsController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Get()
  @RequirePermission('registrations.read')
  list(@Auth() auth: OrgContext, @Query() q: RegQuery) {
    const c = contains(q.q);
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const base = {
        organizationId: auth.orgId,
        ...(q.workId ? { workId: q.workId } : {}),
        ...(q.recordingId ? { recordingId: q.recordingId } : {}),
        ...(c ? { OR: [{ work: { title: c } }, { recording: { title: c } }, { applicationNo: c }, { diaryNo: c }, { registrationNo: c }, { registry: c }] } : {}),
      };
      const [rows, groups] = await Promise.all([
        tx.registration.findMany({ where: { ...base, ...(q.status ? { status: q.status } : {}) }, include: assetInclude, orderBy: [{ nextDeadline: { sort: 'asc', nulls: 'last' } }, { updatedAt: 'desc' }, { id: 'asc' }], ...pageArgs(q, 50) }),
        tx.registration.groupBy({ by: ['status'], where: base, _count: true }),
      ]);
      return { ...toPage(rows, q, 50), counts: Object.fromEntries(groups.map((g) => [g.status, g._count])) };
    });
  }

  @Get(':id')
  @RequirePermission('registrations.read')
  get(@Auth() auth: OrgContext, @Param('id') id: string) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const r = found(await tx.registration.findFirst({ where: { id, organizationId: auth.orgId }, include: assetInclude }), 'Registration');
      return { ...r, next: FLOW[r.status], documents: await ownerDocs(tx, auth.orgId, 'REGISTRATION', id), history: await history(tx, auth.orgId, 'registration', id) };
    });
  }

  @Post()
  @RequirePermission('registrations.write')
  create(@Auth() auth: OrgContext, @Body() dto: CreateDto) {
    const { assetType, assetId, ...fields } = dto;
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const asset = await resolveAsset(tx, auth.orgId, { assetType, assetId } as AssetRef);
      const r = await tx.registration.create({ data: { organizationId: auth.orgId, ...asset, ...fields, status: fields.filedAt ? 'FILED' : 'PLANNED', createdById: auth.userId } });
      await this.audit.log(tx, auth, { action: 'registration.create', entityType: 'registration', entityId: r.id, after: r });
      return r;
    });
  }

  @Patch(':id')
  @RequirePermission('registrations.write')
  update(@Auth() auth: OrgContext, @Param('id') id: string, @Body() dto: Fields) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const before = found(await tx.registration.findFirst({ where: { id, organizationId: auth.orgId } }), 'Registration');
      if (before.status === 'REGISTERED' && (dto.registrationNo !== undefined || dto.registeredAt !== undefined)) throw new BadRequestException('Registration number and date are locked once registered');
      const r = await tx.registration.update({ where: { id }, data: dto });
      await this.audit.log(tx, auth, { action: 'registration.update', entityType: 'registration', entityId: id, before, after: r });
      return r;
    });
  }

  @Post(':id/status')
  @RequirePermission('registrations.write')
  status(@Auth() auth: OrgContext, @Param('id') id: string, @Body() dto: StatusDto) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const before = found(await tx.registration.findFirst({ where: { id, organizationId: auth.orgId } }), 'Registration');
      if (!FLOW[before.status].includes(dto.status)) throw new BadRequestException(`Cannot move a ${before.status} registration to ${dto.status}`);
      const when = dto.date ?? new Date();
      const data: Record<string, unknown> = { status: dto.status };
      if (dto.status === 'FILED') data.filedAt = before.filedAt ?? when;
      if (dto.status === 'OBJECTION') data.objectionNote = dto.note ?? before.objectionNote;
      if (dto.status === 'REGISTERED') {
        const no = dto.registrationNo ?? before.registrationNo;
        if (!no) throw new BadRequestException('Enter the registration number issued by the registry');
        Object.assign(data, { registrationNo: no, registeredAt: when, nextDeadline: null });
      }
      if (dto.note && dto.status !== 'OBJECTION') data.notes = [before.notes, `${when.toISOString().slice(0, 10)} ${dto.status}: ${dto.note}`].filter(Boolean).join('\n');
      const r = await tx.registration.update({ where: { id }, data });
      await this.audit.log(tx, auth, { action: 'registration.status', entityType: 'registration', entityId: id, before: { status: before.status }, after: { status: r.status }, meta: { note: dto.note } });
      return r;
    });
  }

  @Delete(':id')
  @RequirePermission('registrations.write')
  remove(@Auth() auth: OrgContext, @Param('id') id: string) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const r = found(await tx.registration.findFirst({ where: { id, organizationId: auth.orgId } }), 'Registration');
      if (r.status !== 'PLANNED') throw new BadRequestException('Only planned registrations can be deleted — withdraw it instead');
      await tx.registration.delete({ where: { id } });
      await this.audit.log(tx, auth, { action: 'registration.delete', entityType: 'registration', entityId: id, before: r });
      return { ok: true };
    });
  }
}
