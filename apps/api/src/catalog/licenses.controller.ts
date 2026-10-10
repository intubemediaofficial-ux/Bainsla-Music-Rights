import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsDate, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PrismaService, Tx } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Auth, type OrgContext, RequirePermission } from '../auth/context.js';
import { pageArgs, toPage } from '../common/pagination.js';
import { contains, found, ListQuery, toDate, trimOrNull } from './shared.js';
import { datesOverlap, territoriesOverlap } from './validation.js';

class LicenseDto {
  @IsIn(['WORK', 'RECORDING']) assetType!: 'WORK' | 'RECORDING';
  @IsString() assetId!: string;
  @IsOptional() @trimOrNull() @IsString() licenseePartyId?: string | null;
  @IsString() @MaxLength(200) licenseeName!: string;
  @IsOptional() @IsArray() @Matches(/^(WW|[A-Z]{2})$/, { each: true }) territories?: string[];
  @IsOptional() @IsBoolean() exclusive?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(60, { each: true }) permittedUses?: string[];
  @IsOptional() @toDate() @IsDate() startDate?: Date | null;
  @IsOptional() @toDate() @IsDate() endDate?: Date | null;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(500) feeNote?: string | null;
}
class UpdateLicenseDto {
  @IsOptional() @IsString() @MaxLength(200) licenseeName?: string;
  @IsOptional() @IsArray() @Matches(/^(WW|[A-Z]{2})$/, { each: true }) territories?: string[];
  @IsOptional() @IsBoolean() exclusive?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) permittedUses?: string[];
  @IsOptional() @toDate() @IsDate() startDate?: Date | null;
  @IsOptional() @toDate() @IsDate() endDate?: Date | null;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(500) feeNote?: string | null;
}
class LicenseQuery extends ListQuery {
  @IsOptional() @IsIn(['active', 'expiring', 'expired']) state?: string;
}

/** An exclusive license may not overlap any other license on the same asset in territory and time. */
async function exclusivityClash(tx: Tx, orgId: string, l: { id?: string; assetType: string; workId?: string | null; recordingId?: string | null; exclusive: boolean; territories: string[]; startDate: Date | null; endDate: Date | null }) {
  const others = await tx.license.findMany({
    where: { organizationId: orgId, ...(l.workId ? { workId: l.workId } : { recordingId: l.recordingId }), ...(l.id ? { id: { not: l.id } } : {}) },
  });
  return others.find((o) => (o.exclusive || l.exclusive) && territoriesOverlap(o.territories, l.territories) && datesOverlap(o, l));
}

@ApiTags('licenses')
@Controller('licenses')
export class LicensesController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Get()
  @RequirePermission('rights.read')
  list(@Auth() auth: OrgContext, @Query() q: LicenseQuery) {
    const now = new Date();
    const soon = new Date(Date.now() + 60 * 86400_000);
    const c = contains(q.q);
    const state =
      q.state === 'expired' ? { endDate: { lt: now } }
      : q.state === 'expiring' ? { endDate: { gte: now, lte: soon } }
      : q.state === 'active' ? { OR: [{ endDate: null }, { endDate: { gte: now } }] }
      : {};
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const rows = await tx.license.findMany({
        where: { organizationId: auth.orgId, ...state, ...(c ? { AND: [{ OR: [{ licenseeName: c }, { work: { title: c } }, { recording: { title: c } }] }] } : {}) },
        include: { work: { select: { id: true, title: true } }, recording: { select: { id: true, title: true, isrc: true } }, licensee: { select: { id: true, legalName: true } } },
        orderBy: [{ endDate: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
        ...pageArgs(q, 50),
      });
      return toPage(rows, q, 50);
    });
  }

  @Post()
  @RequirePermission('rights.write')
  create(@Auth() auth: OrgContext, @Body() dto: LicenseDto) {
    if (dto.startDate && dto.endDate && dto.startDate > dto.endDate) throw new BadRequestException('Start date must be before end date');
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const asset = dto.assetType === 'WORK'
        ? await tx.musicalWork.findFirst({ where: { id: dto.assetId, organizationId: auth.orgId } })
        : await tx.recording.findFirst({ where: { id: dto.assetId, organizationId: auth.orgId } });
      found(asset, 'Asset');
      if (dto.licenseePartyId) found(await tx.party.findFirst({ where: { id: dto.licenseePartyId, organizationId: auth.orgId } }), 'Licensee');
      const data = {
        organizationId: auth.orgId, assetType: dto.assetType, ...(dto.assetType === 'WORK' ? { workId: dto.assetId } : { recordingId: dto.assetId }),
        licenseePartyId: dto.licenseePartyId ?? null, licenseeName: dto.licenseeName.trim(), territories: dto.territories?.length ? dto.territories : ['WW'],
        exclusive: !!dto.exclusive, permittedUses: dto.permittedUses ?? [], startDate: dto.startDate ?? null, endDate: dto.endDate ?? null, feeNote: dto.feeNote ?? null, createdById: auth.userId,
      };
      const clash = await exclusivityClash(tx, auth.orgId, data);
      if (clash) throw new BadRequestException(`Overlaps ${clash.exclusive ? 'an exclusive' : 'an existing'} license to ${clash.licenseeName} in the same territory and period`);
      const l = await tx.license.create({ data });
      await this.audit.log(tx, auth, { action: 'license.created', entityType: 'license', entityId: l.id, after: data });
      return l;
    });
  }

  @Patch(':id')
  @RequirePermission('rights.write')
  update(@Auth() auth: OrgContext, @Param('id') id: string, @Body() dto: UpdateLicenseDto) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const before = found(await tx.license.findFirst({ where: { id, organizationId: auth.orgId } }), 'License');
      const next = { ...before, ...dto, territories: dto.territories?.length ? dto.territories : before.territories };
      if (next.startDate && next.endDate && next.startDate > next.endDate) throw new BadRequestException('Start date must be before end date');
      const clash = await exclusivityClash(tx, auth.orgId, next);
      if (clash) throw new BadRequestException(`Overlaps a license to ${clash.licenseeName} in the same territory and period`);
      const l = await tx.license.update({ where: { id }, data: { ...dto, territories: next.territories } });
      await this.audit.log(tx, auth, { action: 'license.updated', entityType: 'license', entityId: id, before, after: dto });
      return l;
    });
  }

  @Delete(':id')
  @RequirePermission('rights.write')
  remove(@Auth() auth: OrgContext, @Param('id') id: string) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const l = found(await tx.license.findFirst({ where: { id, organizationId: auth.orgId } }), 'License');
      await tx.license.delete({ where: { id } });
      await this.audit.log(tx, auth, { action: 'license.deleted', entityType: 'license', entityId: id, before: l });
      return { ok: true };
    });
  }
}
