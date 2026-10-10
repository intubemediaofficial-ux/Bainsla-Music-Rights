import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDate, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { ReleaseType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Auth, type OrgContext, RequirePermission } from '../auth/context.js';
import { pageArgs, toPage } from '../common/pagination.js';
import { contains, found, ListQuery, toDate, trimOrNull, uniqueGuard } from './shared.js';
import { isValidUpc, normalizeUpc } from './validation.js';

class ReleaseDto {
  @IsString() @MaxLength(300) title!: string;
  @IsOptional() @IsEnum(ReleaseType) type?: ReleaseType;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(20) upc?: string | null;
  @IsOptional() @toDate() @IsDate() releaseDate?: Date | null;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(200) labelName?: string | null;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(4000) notes?: string | null;
}
class UpdateReleaseDto extends ReleaseDto {
  @IsOptional() @IsString() @MaxLength(300) declare title: string;
}
class TrackDto {
  @IsString() recordingId!: string;
  @IsOptional() @IsInt() @Min(1) @Max(20) discNo?: number;
  @IsInt() @Min(1) @Max(999) trackNo!: number;
}
class TracksDto {
  @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => TrackDto) tracks!: TrackDto[];
}

function clean(dto: Partial<ReleaseDto>) {
  const out = { ...dto };
  if (out.title !== undefined) out.title = out.title.trim();
  if (out.title === '') throw new BadRequestException('Title is required');
  if (out.upc !== undefined) {
    out.upc = normalizeUpc(out.upc);
    if (out.upc && !isValidUpc(out.upc)) throw new BadRequestException('UPC/EAN must be 12–13 digits with a valid check digit');
  }
  return out;
}

@ApiTags('releases')
@Controller('releases')
export class ReleasesController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Get()
  @RequirePermission('catalog.read')
  list(@Auth() auth: OrgContext, @Query() q: ListQuery) {
    const c = contains(q.q);
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const rows = await tx.release.findMany({
        where: { organizationId: auth.orgId, archivedAt: q.archived === 'true' ? { not: null } : null, ...(c ? { OR: [{ title: c }, { upc: c }, { labelName: c }] } : {}) },
        include: { _count: { select: { tracks: true } } },
        orderBy: [{ releaseDate: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }],
        ...pageArgs(q, 50),
      });
      return toPage(rows, q, 50);
    });
  }

  @Get(':id')
  @RequirePermission('catalog.read')
  get(@Auth() auth: OrgContext, @Param('id') id: string) {
    return this.prisma.tenant(auth.orgId, async (tx) =>
      found(
        await tx.release.findFirst({
          where: { id, organizationId: auth.orgId },
          include: { tracks: { include: { recording: { select: { id: true, title: true, version: true, isrc: true, durationSec: true } } }, orderBy: [{ discNo: 'asc' }, { trackNo: 'asc' }] } },
        }),
        'Release',
      ),
    );
  }

  @Post()
  @RequirePermission('catalog.write')
  create(@Auth() auth: OrgContext, @Body() dto: ReleaseDto) {
    const data = clean(dto);
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const r = await tx.release.create({ data: { ...data, title: data.title!, organizationId: auth.orgId, createdById: auth.userId } });
      await this.audit.log(tx, auth, { action: 'release.created', entityType: 'release', entityId: r.id, after: data });
      return r;
    }).catch((e) => uniqueGuard(e, 'UPC already used by another release'));
  }

  @Patch(':id')
  @RequirePermission('catalog.write')
  update(@Auth() auth: OrgContext, @Param('id') id: string, @Body() dto: UpdateReleaseDto) {
    const data = clean(dto);
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const before = found(await tx.release.findFirst({ where: { id, organizationId: auth.orgId } }), 'Release');
      const r = await tx.release.update({ where: { id }, data });
      await this.audit.log(tx, auth, { action: 'release.updated', entityType: 'release', entityId: id, before, after: data });
      return r;
    }).catch((e) => uniqueGuard(e, 'UPC already used by another release'));
  }

  @Put(':id/tracks')
  @RequirePermission('catalog.write')
  setTracks(@Auth() auth: OrgContext, @Param('id') id: string, @Body() dto: TracksDto) {
    const keys = new Set<string>();
    const recs = new Set<string>();
    for (const t of dto.tracks) {
      const k = `${t.discNo ?? 1}-${t.trackNo}`;
      if (keys.has(k)) throw new BadRequestException(`Track number ${t.trackNo} (disc ${t.discNo ?? 1}) is used twice`);
      if (recs.has(t.recordingId)) throw new BadRequestException('The same recording is listed twice');
      keys.add(k);
      recs.add(t.recordingId);
    }
    return this.prisma.tenant(auth.orgId, async (tx) => {
      found(await tx.release.findFirst({ where: { id, organizationId: auth.orgId } }), 'Release');
      const owned = await tx.recording.count({ where: { organizationId: auth.orgId, id: { in: [...recs] } } });
      if (owned !== recs.size) throw new BadRequestException('Unknown recording in tracklist');
      await tx.releaseTrack.deleteMany({ where: { releaseId: id, organizationId: auth.orgId } });
      await tx.releaseTrack.createMany({ data: dto.tracks.map((t) => ({ organizationId: auth.orgId, releaseId: id, recordingId: t.recordingId, discNo: t.discNo ?? 1, trackNo: t.trackNo })) });
      await this.audit.log(tx, auth, { action: 'release.tracks_set', entityType: 'release', entityId: id, after: { count: dto.tracks.length } });
      return { ok: true, count: dto.tracks.length };
    });
  }

  @Delete(':id')
  @RequirePermission('catalog.write')
  archive(@Auth() auth: OrgContext, @Param('id') id: string) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      found(await tx.release.findFirst({ where: { id, organizationId: auth.orgId } }), 'Release');
      await tx.release.update({ where: { id }, data: { archivedAt: new Date() } });
      await this.audit.log(tx, auth, { action: 'release.archived', entityType: 'release', entityId: id });
      return { ok: true };
    });
  }
}
