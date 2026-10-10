import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDate, IsEnum, IsIn, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { AssetType, ClaimStatus, Prisma, RightType } from '@prisma/client';
import { PrismaService, Tx } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Auth, type OrgContext, RequirePermission } from '../auth/context.js';
import { pageArgs, toPage } from '../common/pagination.js';
import { dec, found, ListQuery, toDate, trimOrNull } from './shared.js';
import { validateClaims } from './validation.js';
import { assetRights, assetWhere, loadClaimLikes } from './rights.service.js';

const ASSETS = ['WORK', 'RECORDING'] as const;

class ClaimDto {
  @IsIn(ASSETS) assetType!: 'WORK' | 'RECORDING';
  @IsString() assetId!: string;
  @IsString() partyId!: string;
  @IsEnum(RightType) rightType!: RightType;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) @Max(100) sharePercent!: number;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(250) @Matches(/^(WW|[A-Z]{2})$/, { each: true, message: 'Territories must be ISO country codes or WW' }) territories?: string[];
  @IsOptional() @toDate() @IsDate() startDate?: Date | null;
  @IsOptional() @toDate() @IsDate() endDate?: Date | null;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(1000) basis?: string | null;
  /** Save anyway as DISPUTED when the shares would exceed 100%. */
  @IsOptional() @IsBoolean() markDisputed?: boolean;
}
class UpdateClaimDto {
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) @Max(100) sharePercent?: number;
  @IsOptional() @IsArray() @ArrayMinSize(1) @Matches(/^(WW|[A-Z]{2})$/, { each: true }) territories?: string[];
  @IsOptional() @toDate() @IsDate() startDate?: Date | null;
  @IsOptional() @toDate() @IsDate() endDate?: Date | null;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(1000) basis?: string | null;
  @IsOptional() @IsBoolean() markDisputed?: boolean;
}
class StatusDto {
  @IsEnum(ClaimStatus) status!: ClaimStatus;
  @IsOptional() @trimOrNull() @IsString() agreementId?: string | null;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(1000) note?: string | null;
}
class ClaimQuery extends ListQuery {
  @IsOptional() @IsEnum(AssetType) assetType?: AssetType;
  @IsOptional() @IsEnum(ClaimStatus) status?: ClaimStatus;
  @IsOptional() @IsEnum(RightType) rightType?: RightType;
  @IsOptional() @IsString() partyId?: string;
}
class TransferDto {
  @IsIn(ASSETS) assetType!: 'WORK' | 'RECORDING';
  @IsString() assetId!: string;
  @IsString() fromPartyId!: string;
  @IsString() toPartyId!: string;
  @IsEnum(RightType) rightType!: RightType;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) @Max(100) sharePercent!: number;
  @IsOptional() @IsArray() @Matches(/^(WW|[A-Z]{2})$/, { each: true }) territories?: string[];
  @IsOptional() @trimOrNull() @IsString() @MaxLength(500) scope?: string | null;
  @IsOptional() @toDate() @IsDate() effectiveDate?: Date | null;
  @IsOptional() @trimOrNull() @IsString() agreementId?: string | null;
}

const REVIEW_STATES: ClaimStatus[] = ['REVIEWED', 'DOCUMENTED', 'REJECTED'];
const PARTY = { select: { id: true, legalName: true, stageName: true } } as const;

async function assertAsset(tx: Tx, orgId: string, assetType: 'WORK' | 'RECORDING', id: string) {
  const a = assetType === 'WORK'
    ? await tx.musicalWork.findFirst({ where: { id, organizationId: orgId }, select: { id: true, title: true } })
    : await tx.recording.findFirst({ where: { id, organizationId: orgId }, select: { id: true, title: true } });
  return found(a, assetType === 'WORK' ? 'Work' : 'Recording');
}

/** Executed evidence = an EXECUTED agreement covering the asset, or an EXECUTED document attached to it. */
async function hasExecutedEvidence(tx: Tx, orgId: string, assetType: 'WORK' | 'RECORDING', assetId: string, agreementId?: string | null) {
  if (agreementId) {
    const a = await tx.agreement.findFirst({ where: { id: agreementId, organizationId: orgId, status: 'EXECUTED' }, select: { id: true } });
    return !!a;
  }
  const [asset, doc] = await Promise.all([
    tx.agreementAsset.findFirst({ where: { organizationId: orgId, ...assetWhere(assetType, assetId), agreement: { status: 'EXECUTED' } }, select: { id: true } }),
    tx.document.findFirst({ where: { organizationId: orgId, ownerType: assetType, ownerId: assetId, status: 'EXECUTED' }, select: { id: true } }),
  ]);
  return !!(asset || doc);
}

@ApiTags('rights')
@Controller('rights')
export class RightsController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Get('claims')
  @RequirePermission('rights.read')
  list(@Auth() auth: OrgContext, @Query() q: ClaimQuery) {
    const t = q.q?.trim();
    const c = t ? { contains: t, mode: 'insensitive' as const } : undefined;
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const rows = await tx.rightsClaim.findMany({
        where: {
          organizationId: auth.orgId,
          ...(q.assetType ? { assetType: q.assetType } : {}),
          ...(q.status ? { status: q.status } : {}),
          ...(q.rightType ? { rightType: q.rightType } : {}),
          ...(q.partyId ? { partyId: q.partyId } : {}),
          ...(c ? { OR: [{ work: { title: c } }, { recording: { title: c } }, { party: { legalName: c } }] } : {}),
        },
        include: { party: PARTY, work: { select: { id: true, title: true } }, recording: { select: { id: true, title: true, isrc: true } } },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        ...pageArgs(q, 50),
      });
      const counts = await tx.rightsClaim.groupBy({ by: ['status'], where: { organizationId: auth.orgId }, _count: true });
      return { ...toPage(rows, q, 50), counts: Object.fromEntries(counts.map((x) => [x.status, x._count])) };
    });
  }

  @Get('validate')
  @RequirePermission('rights.read')
  validate(@Auth() auth: OrgContext, @Query('assetType') assetType: 'WORK' | 'RECORDING', @Query('assetId') assetId: string) {
    if (!ASSETS.includes(assetType) || !assetId) throw new BadRequestException('assetType and assetId are required');
    return this.prisma.tenant(auth.orgId, async (tx) => {
      await assertAsset(tx, auth.orgId, assetType, assetId);
      return assetRights(tx, auth.orgId, assetType, assetId);
    });
  }

  /** Every asset whose shares overlap above 100% or that has a disputed claim. */
  @Get('conflicts')
  @RequirePermission('rights.read')
  conflicts(@Auth() auth: OrgContext) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const claims = await tx.rightsClaim.findMany({
        where: { organizationId: auth.orgId },
        include: { work: { select: { id: true, title: true } }, recording: { select: { id: true, title: true } } },
      });
      const byAsset = new Map<string, typeof claims>();
      for (const c of claims) {
        const k = `${c.assetType}:${c.workId ?? c.recordingId}`;
        byAsset.set(k, [...(byAsset.get(k) ?? []), c]);
      }
      const out = [];
      for (const [key, list] of byAsset) {
        const v = validateClaims(list.map((c) => ({ ...c, sharePercent: dec(c.sharePercent) })));
        const issues = v.flatMap((x) => x.issues);
        const disputed = list.filter((c) => c.status === 'DISPUTED').length;
        if (issues.length || disputed) {
          const [assetType, assetId] = key.split(':');
          out.push({ assetType, assetId, title: list[0].work?.title ?? list[0].recording?.title ?? '', issues, disputed });
        }
      }
      return { data: out };
    });
  }

  @Post('claims')
  @RequirePermission('rights.write')
  create(@Auth() auth: OrgContext, @Body() dto: ClaimDto) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      await assertAsset(tx, auth.orgId, dto.assetType, dto.assetId);
      found(await tx.party.findFirst({ where: { id: dto.partyId, organizationId: auth.orgId } }), 'Party');
      if (dto.startDate && dto.endDate && dto.startDate > dto.endDate) throw new BadRequestException('Start date must be before end date');
      const draft = { id: 'new', partyId: dto.partyId, rightType: dto.rightType, sharePercent: dto.sharePercent, territories: dto.territories ?? ['WW'], startDate: dto.startDate ?? null, endDate: dto.endDate ?? null, status: 'ASSERTED' };
      const result = validateClaims([...(await loadClaimLikes(tx, auth.orgId, dto.assetType, dto.assetId)), draft]);
      const issues = result.flatMap((r) => r.issues).filter((i) => i.kind === 'OVER_100' && i.claimIds.includes('new'));
      if (issues.length && !dto.markDisputed) throw new ConflictException({ message: 'This claim would conflict with existing claims', issues });
      const claim = await tx.rightsClaim.create({
        data: {
          organizationId: auth.orgId, assetType: dto.assetType, ...assetWhere(dto.assetType, dto.assetId), partyId: dto.partyId,
          rightType: dto.rightType, sharePercent: new Prisma.Decimal(dto.sharePercent), territories: draft.territories,
          startDate: draft.startDate, endDate: draft.endDate, basis: dto.basis ?? null,
          status: issues.length ? 'DISPUTED' : 'ASSERTED', createdById: auth.userId,
        },
        include: { party: PARTY },
      });
      await this.audit.log(tx, auth, { action: 'rights.claim_created', entityType: 'rights_claim', entityId: claim.id, after: { ...draft, id: claim.id, status: claim.status } });
      return { claim, issues };
    });
  }

  @Patch('claims/:id')
  @RequirePermission('rights.write')
  update(@Auth() auth: OrgContext, @Param('id') id: string, @Body() dto: UpdateClaimDto) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const before = found(await tx.rightsClaim.findFirst({ where: { id, organizationId: auth.orgId } }), 'Claim');
      if (before.status === 'DOCUMENTED') throw new ForbiddenException('Documented claims are locked. Reject it and create a new one.');
      const assetType = before.assetType as 'WORK' | 'RECORDING';
      const assetId = (before.workId ?? before.recordingId)!;
      const next = {
        id, partyId: before.partyId, rightType: before.rightType, status: 'ASSERTED',
        sharePercent: dto.sharePercent ?? dec(before.sharePercent),
        territories: dto.territories ?? before.territories,
        startDate: dto.startDate !== undefined ? dto.startDate : before.startDate,
        endDate: dto.endDate !== undefined ? dto.endDate : before.endDate,
      };
      if (next.startDate && next.endDate && next.startDate > next.endDate) throw new BadRequestException('Start date must be before end date');
      const issues = validateClaims([...(await loadClaimLikes(tx, auth.orgId, assetType, assetId, id)), next]).flatMap((r) => r.issues).filter((i) => i.kind === 'OVER_100' && i.claimIds.includes(id));
      if (issues.length && !dto.markDisputed) throw new ConflictException({ message: 'This change would conflict with existing claims', issues });
      const claim = await tx.rightsClaim.update({
        where: { id },
        data: {
          sharePercent: new Prisma.Decimal(next.sharePercent), territories: next.territories, startDate: next.startDate, endDate: next.endDate,
          ...(dto.basis !== undefined ? { basis: dto.basis } : {}),
          // Any material edit sends a reviewed claim back to "asserted".
          status: issues.length ? 'DISPUTED' : before.status === 'REVIEWED' ? 'ASSERTED' : before.status,
          ...(before.status === 'REVIEWED' ? { reviewedById: null, reviewedAt: null } : {}),
        },
        include: { party: PARTY },
      });
      await this.audit.log(tx, auth, { action: 'rights.claim_updated', entityType: 'rights_claim', entityId: id, before, after: next });
      return { claim, issues };
    });
  }

  @Post('claims/:id/status')
  @RequirePermission('rights.write')
  setStatus(@Auth() auth: OrgContext, @Param('id') id: string, @Body() dto: StatusDto) {
    if (REVIEW_STATES.includes(dto.status) && !auth.permissions.has('rights.approve')) {
      throw new ForbiddenException('Only an owner or an approving rights manager can review claims');
    }
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const before = found(await tx.rightsClaim.findFirst({ where: { id, organizationId: auth.orgId } }), 'Claim');
      const assetType = before.assetType as 'WORK' | 'RECORDING';
      const assetId = (before.workId ?? before.recordingId)!;
      if (dto.status === 'DOCUMENTED' && !(await hasExecutedEvidence(tx, auth.orgId, assetType, assetId, dto.agreementId))) {
        throw new BadRequestException('Documented needs an executed (signed) agreement or document for this asset. Unsigned drafts are not evidence.');
      }
      if (['REVIEWED', 'DOCUMENTED'].includes(dto.status)) {
        const issues = validateClaims(await loadClaimLikes(tx, auth.orgId, assetType, assetId)).flatMap((r) => r.issues).filter((i) => i.kind === 'OVER_100' && i.claimIds.includes(id));
        if (issues.length) throw new ConflictException({ message: 'Resolve the share conflict before approving', issues });
      }
      const claim = await tx.rightsClaim.update({
        where: { id },
        data: {
          status: dto.status,
          ...(dto.agreementId !== undefined ? { agreementId: dto.agreementId } : {}),
          ...(REVIEW_STATES.includes(dto.status) ? { reviewedById: auth.userId, reviewedAt: new Date() } : {}),
        },
        include: { party: PARTY },
      });
      await this.audit.log(tx, auth, { action: 'rights.claim_status', entityType: 'rights_claim', entityId: id, before: { status: before.status }, after: { status: dto.status }, meta: { note: dto.note } });
      return claim;
    });
  }

  @Delete('claims/:id')
  @RequirePermission('rights.write')
  remove(@Auth() auth: OrgContext, @Param('id') id: string) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const c = found(await tx.rightsClaim.findFirst({ where: { id, organizationId: auth.orgId } }), 'Claim');
      if (['REVIEWED', 'DOCUMENTED'].includes(c.status)) throw new ForbiddenException('Reviewed claims cannot be deleted — mark them rejected instead');
      await tx.rightsClaim.delete({ where: { id } });
      await this.audit.log(tx, auth, { action: 'rights.claim_deleted', entityType: 'rights_claim', entityId: id, before: c });
      return { ok: true };
    });
  }

  @Get('transfers')
  @RequirePermission('rights.read')
  transfers(@Auth() auth: OrgContext, @Query() q: ListQuery) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const rows = await tx.rightsTransfer.findMany({
        where: { organizationId: auth.orgId },
        include: { fromParty: PARTY, toParty: PARTY, work: { select: { id: true, title: true } }, recording: { select: { id: true, title: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...pageArgs(q, 50),
      });
      return toPage(rows, q, 50);
    });
  }

  /**
   * Moves `sharePercent` of a right from one party to another: the seller's active claim is reduced
   * (or rejected when fully transferred) and the buyer gets a new asserted claim; the transfer row is the history.
   */
  @Post('transfers')
  @RequirePermission('rights.write')
  transfer(@Auth() auth: OrgContext, @Body() dto: TransferDto) {
    if (dto.fromPartyId === dto.toPartyId) throw new BadRequestException('Choose two different parties');
    return this.prisma.tenant(auth.orgId, async (tx) => {
      await assertAsset(tx, auth.orgId, dto.assetType, dto.assetId);
      found(await tx.party.findFirst({ where: { id: dto.toPartyId, organizationId: auth.orgId } }), 'Receiving party');
      const territories = dto.territories?.length ? dto.territories : ['WW'];
      const source = await tx.rightsClaim.findFirst({
        where: { organizationId: auth.orgId, assetType: dto.assetType, ...assetWhere(dto.assetType, dto.assetId), partyId: dto.fromPartyId, rightType: dto.rightType, status: { notIn: ['REJECTED', 'DISPUTED'] } },
        orderBy: { sharePercent: 'desc' },
      });
      if (!source) throw new BadRequestException('The transferring party has no active claim for this right');
      const have = dec(source.sharePercent);
      if (dto.sharePercent > have + 1e-9) throw new BadRequestException(`The transferring party only holds ${have}%`);
      const remaining = Math.round((have - dto.sharePercent) * 10000) / 10000;
      if (remaining > 0) await tx.rightsClaim.update({ where: { id: source.id }, data: { sharePercent: new Prisma.Decimal(remaining) } });
      else await tx.rightsClaim.update({ where: { id: source.id }, data: { status: 'REJECTED', basis: `${source.basis ?? ''} [fully transferred]`.trim() } });
      const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
      const existing = (await tx.rightsClaim.findMany({
        where: { organizationId: auth.orgId, assetType: dto.assetType, ...assetWhere(dto.assetType, dto.assetId), partyId: dto.toPartyId, rightType: dto.rightType, status: { in: ['ASSERTED', 'REVIEWED'] }, endDate: null },
      })).find((c) => same(c.territories, territories));
      const claim = existing
        ? await tx.rightsClaim.update({
            where: { id: existing.id },
            // Increasing a share is a material change: a reviewed claim goes back to asserted.
            data: { sharePercent: new Prisma.Decimal(Math.round((dec(existing.sharePercent) + dto.sharePercent) * 10000) / 10000), status: 'ASSERTED', reviewedById: null, reviewedAt: null },
          })
        : await tx.rightsClaim.create({
        data: {
          organizationId: auth.orgId, assetType: dto.assetType, ...assetWhere(dto.assetType, dto.assetId), partyId: dto.toPartyId, rightType: dto.rightType,
          sharePercent: new Prisma.Decimal(dto.sharePercent), territories, startDate: dto.effectiveDate ?? null, status: 'ASSERTED',
          basis: `Transfer from party ${dto.fromPartyId}${dto.scope ? ` — ${dto.scope}` : ''}`, agreementId: dto.agreementId ?? null, createdById: auth.userId,
        },
      });
      const t = await tx.rightsTransfer.create({
        data: {
          organizationId: auth.orgId, assetType: dto.assetType, ...assetWhere(dto.assetType, dto.assetId), fromPartyId: dto.fromPartyId, toPartyId: dto.toPartyId,
          rightType: dto.rightType, sharePercent: new Prisma.Decimal(dto.sharePercent), scope: dto.scope ?? null, territories,
          effectiveDate: dto.effectiveDate ?? null, agreementId: dto.agreementId ?? null, createdById: auth.userId,
        },
      });
      await this.audit.log(tx, auth, { action: 'rights.transferred', entityType: 'rights_transfer', entityId: t.id, after: { ...dto, remaining, newClaimId: claim.id } });
      return { transfer: t, newClaim: claim, remaining };
    });
  }
}
