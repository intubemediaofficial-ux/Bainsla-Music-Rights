import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';
import { PrismaService, Tx } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Auth, type OrgContext, RequirePermission } from '../auth/context.js';
import { pageArgs, toPage } from '../common/pagination.js';
import { contains, found, ListQuery, trimOrNull, uniqueGuard } from './shared.js';
import { isValidIswc, normalizeIswc, normalizeTitle } from './validation.js';
import { assetRights } from './rights.service.js';

class WorkDto {
  @IsString() @MaxLength(300) title!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(300, { each: true }) aliases?: string[];
  @IsOptional() @trimOrNull() @IsString() @MaxLength(60) language?: string | null;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(60) genre?: string | null;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(20) iswc?: string | null;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(2000) lyricsExcerpt?: string | null;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(4000) notes?: string | null;
}
class UpdateWorkDto extends WorkDto {
  @IsOptional() @IsString() @MaxLength(300) declare title: string;
}
class WorkQuery extends ListQuery {
  @IsOptional() @IsString() @MaxLength(60) language?: string;
}

function clean(dto: Partial<WorkDto>) {
  const out = { ...dto };
  if (out.title !== undefined) out.title = out.title.trim();
  if (out.title === '') throw new BadRequestException('Title is required');
  if (out.aliases) out.aliases = [...new Set(out.aliases.map((a) => a.trim()).filter(Boolean))];
  if (out.iswc !== undefined) {
    out.iswc = normalizeIswc(out.iswc);
    if (out.iswc && !isValidIswc(out.iswc)) throw new BadRequestException('ISWC must look like T-123.456.789-0');
  }
  return out;
}

export async function findDuplicateWorks(tx: Tx, orgId: string, title: string, exceptId?: string) {
  const norm = normalizeTitle(title);
  if (!norm) return [];
  const first = norm.split(' ')[0];
  const candidates = await tx.musicalWork.findMany({
    where: { organizationId: orgId, archivedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}), title: { contains: first, mode: 'insensitive' } },
    select: { id: true, title: true, aliases: true, language: true },
    take: 200,
  });
  return candidates.filter((w) => [w.title, ...w.aliases].some((t) => normalizeTitle(t) === norm));
}

@ApiTags('works')
@Controller('works')
export class WorksController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Get()
  @RequirePermission('catalog.read')
  list(@Auth() auth: OrgContext, @Query() q: WorkQuery) {
    const c = contains(q.q);
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const rows = await tx.musicalWork.findMany({
        where: {
          organizationId: auth.orgId,
          archivedAt: q.archived === 'true' ? { not: null } : null,
          ...(q.language ? { language: { equals: q.language, mode: 'insensitive' } } : {}),
          ...(c ? { OR: [{ title: c }, { iswc: c }, { aliases: { has: q.q!.trim() } }] } : {}),
        },
        include: {
          _count: { select: { recordings: true, contributions: true, rightsClaims: true } },
          contributions: { take: 4, orderBy: { creditOrder: 'asc' }, select: { role: true, party: { select: { id: true, legalName: true, stageName: true } } } },
        },
        orderBy: [{ title: 'asc' }, { id: 'asc' }],
        ...pageArgs(q, 50),
      });
      return toPage(rows, q, 50);
    });
  }

  @Get('duplicates')
  @RequirePermission('catalog.read')
  duplicates(@Auth() auth: OrgContext) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const all = await tx.musicalWork.findMany({ where: { organizationId: auth.orgId, archivedAt: null }, select: { id: true, title: true, language: true, iswc: true, createdAt: true, _count: { select: { recordings: true } } } });
      const groups = new Map<string, typeof all>();
      for (const w of all) {
        const k = normalizeTitle(w.title);
        groups.set(k, [...(groups.get(k) ?? []), w]);
      }
      return { groups: [...groups.values()].filter((g) => g.length > 1) };
    });
  }

  @Get(':id')
  @RequirePermission('catalog.read')
  get(@Auth() auth: OrgContext, @Param('id') id: string) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const w = found(
        await tx.musicalWork.findFirst({
          where: { id, organizationId: auth.orgId },
          include: {
            recordings: { select: { id: true, title: true, version: true, isrc: true, durationSec: true, archivedAt: true }, orderBy: { createdAt: 'asc' } },
            contributions: { include: { party: { select: { id: true, legalName: true, stageName: true } } }, orderBy: [{ role: 'asc' }, { creditOrder: 'asc' }] },
            licenses: { orderBy: { createdAt: 'desc' } },
          },
        }),
        'Work',
      );
      return { ...w, ...(await assetRights(tx, auth.orgId, 'WORK', id)) };
    });
  }

  @Post()
  @RequirePermission('catalog.write')
  create(@Auth() auth: OrgContext, @Body() dto: WorkDto) {
    const data = clean(dto);
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const duplicates = await findDuplicateWorks(tx, auth.orgId, data.title!);
      const w = await tx.musicalWork.create({ data: { ...data, title: data.title!, organizationId: auth.orgId, createdById: auth.userId } });
      await this.audit.log(tx, auth, { action: 'work.created', entityType: 'work', entityId: w.id, after: data });
      return { ...w, possibleDuplicates: duplicates };
    }).catch((e) => uniqueGuard(e, 'Duplicate work'));
  }

  @Patch(':id')
  @RequirePermission('catalog.write')
  update(@Auth() auth: OrgContext, @Param('id') id: string, @Body() dto: UpdateWorkDto) {
    const data = clean(dto);
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const before = found(await tx.musicalWork.findFirst({ where: { id, organizationId: auth.orgId } }), 'Work');
      const w = await tx.musicalWork.update({ where: { id }, data });
      await this.audit.log(tx, auth, { action: 'work.updated', entityType: 'work', entityId: id, before, after: data });
      return w;
    });
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

  @Post(':id/merge-into/:targetId')
  @RequirePermission('catalog.write')
  merge(@Auth() auth: OrgContext, @Param('id') id: string, @Param('targetId') targetId: string) {
    if (id === targetId) throw new BadRequestException('Pick a different work');
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const src = found(await tx.musicalWork.findFirst({ where: { id, organizationId: auth.orgId } }), 'Work');
      const dst = found(await tx.musicalWork.findFirst({ where: { id: targetId, organizationId: auth.orgId } }), 'Target work');
      const where = { workId: id, organizationId: auth.orgId };
      const moved = {
        recordings: (await tx.recording.updateMany({ where, data: { workId: targetId } })).count,
        contributions: (await tx.contribution.updateMany({ where, data: { workId: targetId } })).count,
        claims: (await tx.rightsClaim.updateMany({ where, data: { workId: targetId } })).count,
        licenses: (await tx.license.updateMany({ where, data: { workId: targetId } })).count,
        transfers: (await tx.rightsTransfer.updateMany({ where, data: { workId: targetId } })).count,
      };
      await tx.musicalWork.update({ where: { id: targetId }, data: { aliases: [...new Set([...dst.aliases, src.title, ...src.aliases])].filter((a) => a !== dst.title) } });
      await tx.musicalWork.update({ where: { id }, data: { archivedAt: new Date(), notes: `${src.notes ?? ''}\nMerged into ${dst.title} (${dst.id})`.trim() } });
      await this.audit.log(tx, auth, { action: 'work.merged', entityType: 'work', entityId: id, meta: { into: targetId, moved } });
      return { ok: true, moved };
    });
  }

  private setArchived(auth: OrgContext, id: string, archivedAt: Date | null) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      found(await tx.musicalWork.findFirst({ where: { id, organizationId: auth.orgId } }), 'Work');
      await tx.musicalWork.update({ where: { id }, data: { archivedAt } });
      await this.audit.log(tx, auth, { action: archivedAt ? 'work.archived' : 'work.restored', entityType: 'work', entityId: id });
      return { ok: true };
    });
  }
}
