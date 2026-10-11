import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsEmail, IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PartyType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Auth, type OrgContext, RequirePermission } from '../auth/context.js';
import { decrypt, encrypt } from '../common/crypto.js';
import { pageArgs, toPage } from '../common/pagination.js';
import { contains, found, ListQuery, trimOrNull } from './shared.js';

class PartyDto {
  @IsString() @MaxLength(200) legalName!: string;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(200) stageName?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(11) @IsEnum(PartyType, { each: true }) types?: PartyType[];
  @IsOptional() @trimOrNull() @IsEmail() email?: string | null;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(40) phone?: string | null;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(500) address?: string | null;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(2000) notes?: string | null;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(40) ipi?: string | null;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(40) iprsId?: string | null;
  @IsOptional() @trimOrNull() @Matches(/^[A-Z]{5}\d{4}[A-Z]$/i, { message: 'PAN must look like ABCDE1234F' }) pan?: string | null;
  @IsOptional() @trimOrNull() @Matches(/^\d{6,20}$/, { message: 'Bank account must be 6–20 digits' }) bankAccount?: string | null;
  @IsOptional() @trimOrNull() @Matches(/^[A-Z]{4}0[A-Z0-9]{6}$/i, { message: 'Invalid IFSC' }) ifsc?: string | null;
}
class UpdatePartyDto extends PartyDto {
  @IsOptional() @IsString() @MaxLength(200) declare legalName: string;
}
class PartyQuery extends ListQuery {
  @IsOptional() @IsEnum(PartyType) type?: PartyType;
}

type Ids = { ipi?: string | null; iprsId?: string | null; panEnc?: string | null; bankEnc?: string | null; ifsc?: string | null };
const mask = (enc?: string | null) => {
  if (!enc) return null;
  try {
    const v = decrypt(enc);
    return `${'•'.repeat(Math.max(0, v.length - 4))}${v.slice(-4)}`;
  } catch {
    return '••••';
  }
};

/** Sensitive identifiers (PAN, bank) are AES-GCM encrypted at rest and only ever returned masked. */
export function publicParty<T extends { identifiers: Prisma.JsonValue }>(p: T) {
  const ids = (p.identifiers ?? {}) as Ids;
  return { ...p, identifiers: { ipi: ids.ipi ?? null, iprsId: ids.iprsId ?? null, ifsc: ids.ifsc ?? null, panMasked: mask(ids.panEnc), bankMasked: mask(ids.bankEnc) } };
}

function mergeIds(prev: Ids, dto: Partial<PartyDto>): Ids {
  const next: Ids = { ...prev };
  if (dto.ipi !== undefined) next.ipi = dto.ipi;
  if (dto.iprsId !== undefined) next.iprsId = dto.iprsId;
  if (dto.ifsc !== undefined) next.ifsc = dto.ifsc?.toUpperCase() ?? null;
  if (dto.pan !== undefined) next.panEnc = dto.pan ? encrypt(dto.pan.toUpperCase()) : null;
  if (dto.bankAccount !== undefined) next.bankEnc = dto.bankAccount ? encrypt(dto.bankAccount) : null;
  return next;
}

function fields(dto: Partial<PartyDto>) {
  const { ipi: _1, iprsId: _2, pan: _3, bankAccount: _4, ifsc: _5, ...rest } = dto;
  if (rest.legalName !== undefined) rest.legalName = rest.legalName.trim();
  return rest;
}

@ApiTags('parties')
@Controller('parties')
export class PartiesController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Get()
  @RequirePermission('catalog.read')
  list(@Auth() auth: OrgContext, @Query() q: PartyQuery) {
    const c = contains(q.q);
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const rows = await tx.party.findMany({
        where: {
          organizationId: auth.orgId,
          archivedAt: q.archived === 'true' ? { not: null } : null,
          ...(q.type ? { types: { has: q.type } } : {}),
          ...(c ? { OR: [{ legalName: c }, { stageName: c }, { email: c }] } : {}),
        },
        include: { _count: { select: { contributions: true, rightsClaims: true } } },
        orderBy: [{ legalName: 'asc' }, { id: 'asc' }],
        ...pageArgs(q, 50),
      });
      const page = toPage(rows, q, 50);
      return { ...page, data: page.data.map(publicParty) };
    });
  }

  @Get(':id')
  @RequirePermission('catalog.read')
  get(@Auth() auth: OrgContext, @Param('id') id: string) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const p = found(
        await tx.party.findFirst({
          where: { id, organizationId: auth.orgId },
          include: {
            contributions: { include: { work: { select: { id: true, title: true } }, recording: { select: { id: true, title: true, isrc: true } } }, orderBy: { createdAt: 'desc' } },
            rightsClaims: { include: { work: { select: { id: true, title: true } }, recording: { select: { id: true, title: true } } }, orderBy: { createdAt: 'desc' } },
            licenses: { select: { id: true, licenseeName: true, endDate: true } },
          },
        }),
        'Party',
      );
      return publicParty(p);
    });
  }

  @Post()
  @RequirePermission('catalog.write')
  create(@Auth() auth: OrgContext, @Body() dto: PartyDto) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const p = await tx.party.create({
        data: { ...fields(dto), legalName: dto.legalName.trim(), types: dto.types ?? [], identifiers: mergeIds({}, dto) as Prisma.InputJsonValue, organizationId: auth.orgId, createdById: auth.userId },
      });
      await this.audit.log(tx, auth, { action: 'party.created', entityType: 'party', entityId: p.id, after: { legalName: p.legalName, types: p.types } });
      return publicParty(p);
    });
  }

  @Patch(':id')
  @RequirePermission('catalog.write')
  update(@Auth() auth: OrgContext, @Param('id') id: string, @Body() dto: UpdatePartyDto) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const before = found(await tx.party.findFirst({ where: { id, organizationId: auth.orgId } }), 'Party');
      const p = await tx.party.update({
        where: { id },
        data: { ...fields(dto), identifiers: mergeIds((before.identifiers ?? {}) as Ids, dto) as Prisma.InputJsonValue },
      });
      await this.audit.log(tx, auth, { action: 'party.updated', entityType: 'party', entityId: id, before: fields(before as never), after: fields(dto) });
      return publicParty(p);
    });
  }

  @Delete(':id')
  @RequirePermission('catalog.write')
  archive(@Auth() auth: OrgContext, @Param('id') id: string) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      found(await tx.party.findFirst({ where: { id, organizationId: auth.orgId } }), 'Party');
      await tx.party.update({ where: { id }, data: { archivedAt: new Date() } });
      await this.audit.log(tx, auth, { action: 'party.archived', entityType: 'party', entityId: id });
      return { ok: true };
    });
  }

  @Post(':id/restore')
  @RequirePermission('catalog.write')
  restore(@Auth() auth: OrgContext, @Param('id') id: string) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      found(await tx.party.findFirst({ where: { id, organizationId: auth.orgId } }), 'Party');
      await tx.party.update({ where: { id }, data: { archivedAt: null } });
      await this.audit.log(tx, auth, { action: 'party.restored', entityType: 'party', entityId: id });
      return { ok: true };
    });
  }
}
