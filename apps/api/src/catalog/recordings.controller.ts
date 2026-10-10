import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsDate, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PrismaService, Tx } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Auth, type OrgContext, RequirePermission } from '../auth/context.js';
import { pageArgs, toPage } from '../common/pagination.js';
import { contains, found, ListQuery, toDate, trimOrNull, uniqueGuard } from './shared.js';
import { isValidIsrc, normalizeIsrc } from './validation.js';
import { assetRights } from './rights.service.js';

class RecordingDto {
  @IsString() @MaxLength(300) title!: string;
  @IsOptional() @trimOrNull() @IsString() workId?: string | null;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(120) version?: string | null;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(20) isrc?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(36000) durationSec?: number | null;
  @IsOptional() @toDate() @IsDate() recordingDate?: Date | null;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(60) language?: string | null;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(200) studioName?: string | null;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(4000) notes?: string | null;
}
class UpdateRecordingDto extends RecordingDto {
  @IsOptional() @IsString() @MaxLength(300) declare title: string;
}
class RecordingQuery extends ListQuery {
  @IsOptional() @IsString() workId?: string;
  @IsOptional() @IsString() missing?: 'isrc' | 'work';
}

async function clean(tx: Tx, orgId: string, dto: Partial<RecordingDto>, id?: string) {
  const out = { ...dto };
  if (out.title !== undefined) out.title = out.title.trim();
  if (out.title === '') throw new BadRequestException('Title is required');
  if (out.isrc !== undefined) {
    out.isrc = normalizeIsrc(out.isrc);
    if (out.isrc && !isValidIsrc(out.isrc)) throw new BadRequestException('ISRC must be 12 characters like IN-A1B-24-00001');
    if (out.isrc) {
      const clash = await tx.recording.findFirst({ where: { organizationId: orgId, isrc: out.isrc, ...(id ? { id: { not: id } } : {}) }, select: { title: true } });
      if (clash) throw new BadRequestException(`ISRC ${out.isrc} is already used by "${clash.title}"`);
    }
  }
  if (out.workId) found(await tx.musicalWork.findFirst({ where: { id: out.workId, organizationId: orgId } }), 'Work');
  return out;
}

@ApiTags('recordings')
@Controller('recordings')
export class RecordingsController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Get()
  @RequirePermission('catalog.read')
  list(@Auth() auth: OrgContext, @Query() q: RecordingQuery) {
    const c = contains(q.q);
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const rows = await tx.recording.findMany({
        where: {
          organizationId: auth.orgId,
          archivedAt: q.archived === 'true' ? { not: null } : null,
          ...(q.workId ? { workId: q.workId } : {}),
          ...(q.missing === 'isrc' ? { isrc: null } : q.missing === 'work' ? { workId: null } : {}),
          ...(c ? { OR: [{ title: c }, { isrc: c }, { version: c }] } : {}),
        },
        include: {
          work: { select: { id: true, title: true } },
          _count: { select: { contributions: true, rightsClaims: true, releaseTracks: true } },
          contributions: { take: 3, where: { role: { in: ['SINGER', 'PERFORMER', 'FEATURED_ARTIST'] } }, select: { party: { select: { legalName: true, stageName: true } } } },
        },
        orderBy: [{ title: 'asc' }, { id: 'asc' }],
        ...pageArgs(q, 50),
      });
      return toPage(rows, q, 50);
    });
  }

  @Get(':id')
  @RequirePermission('catalog.read')
  get(@Auth() auth: OrgContext, @Param('id') id: string) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const r = found(
        await tx.recording.findFirst({
          where: { id, organizationId: auth.orgId },
          include: {
            work: { select: { id: true, title: true, iswc: true } },
            contributions: { include: { party: { select: { id: true, legalName: true, stageName: true } } }, orderBy: [{ role: 'asc' }, { creditOrder: 'asc' }] },
            releaseTracks: { include: { release: { select: { id: true, title: true, upc: true, type: true, releaseDate: true } } } },
            licenses: { orderBy: { createdAt: 'desc' } },
          },
        }),
        'Recording',
      );
      return { ...r, ...(await assetRights(tx, auth.orgId, 'RECORDING', id)) };
    });
  }

  @Post()
  @RequirePermission('catalog.write')
  create(@Auth() auth: OrgContext, @Body() dto: RecordingDto) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const org = await tx.organization.findUniqueOrThrow({ where: { id: auth.orgId }, include: { plan: true } });
      if (org.plan?.maxRecordings) {
        const n = await tx.recording.count({ where: { organizationId: auth.orgId, archivedAt: null } });
        if (n >= org.plan.maxRecordings) throw new BadRequestException(`Plan limit reached (${org.plan.maxRecordings} recordings). Upgrade to add more.`);
      }
      const data = await clean(tx, auth.orgId, dto);
      const r = await tx.recording.create({ data: { ...data, title: data.title!, organizationId: auth.orgId, createdById: auth.userId } });
      await this.audit.log(tx, auth, { action: 'recording.created', entityType: 'recording', entityId: r.id, after: data });
      return r;
    }).catch((e) => uniqueGuard(e, 'ISRC already exists'));
  }

  @Patch(':id')
  @RequirePermission('catalog.write')
  update(@Auth() auth: OrgContext, @Param('id') id: string, @Body() dto: UpdateRecordingDto) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const before = found(await tx.recording.findFirst({ where: { id, organizationId: auth.orgId } }), 'Recording');
      const data = await clean(tx, auth.orgId, dto, id);
      const r = await tx.recording.update({ where: { id }, data });
      await this.audit.log(tx, auth, { action: 'recording.updated', entityType: 'recording', entityId: id, before, after: data });
      return r;
    }).catch((e) => uniqueGuard(e, 'ISRC already exists'));
  }

  @Delete(':id')
  @RequirePermission('catalog.write')
  archive(@Auth() auth: OrgContext, @Param('id') id: string) {
    return this.setArchived(auth, id, new Date());
  }

  @Post(':id/restore')
  @RequirePermission('catalog.write')
  restore(@Auth() auth: OrgContext, @Param('id') id: string) {
    return this.setArchived(auth, id, null);
  }

  private setArchived(auth: OrgContext, id: string, archivedAt: Date | null) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      found(await tx.recording.findFirst({ where: { id, organizationId: auth.orgId } }), 'Recording');
      await tx.recording.update({ where: { id }, data: { archivedAt } });
      await this.audit.log(tx, auth, { action: archivedAt ? 'recording.archived' : 'recording.restored', entityType: 'recording', entityId: id });
      return { ok: true };
    });
  }
}
