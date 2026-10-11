import { BadRequestException, Body, Controller, Delete, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ContributorRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Auth, type OrgContext, RequirePermission } from '../auth/context.js';
import { found } from './shared.js';

class ContributionDto {
  @IsIn(['WORK', 'RECORDING']) assetType!: 'WORK' | 'RECORDING';
  @IsString() assetId!: string;
  @IsString() partyId!: string;
  @IsEnum(ContributorRole) role!: ContributorRole;
  @IsOptional() @IsInt() @Min(1) @Max(99) creditOrder?: number;
}

/** Credits (who wrote/sang/produced) — kept separate from ownership claims. */
@ApiTags('contributions')
@Controller('contributions')
export class ContributionsController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Post()
  @RequirePermission('catalog.write')
  add(@Auth() auth: OrgContext, @Body() dto: ContributionDto) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      found(await tx.party.findFirst({ where: { id: dto.partyId, organizationId: auth.orgId } }), 'Party');
      const asset = dto.assetType === 'WORK'
        ? await tx.musicalWork.findFirst({ where: { id: dto.assetId, organizationId: auth.orgId } })
        : await tx.recording.findFirst({ where: { id: dto.assetId, organizationId: auth.orgId } });
      found(asset, dto.assetType === 'WORK' ? 'Work' : 'Recording');
      const link = dto.assetType === 'WORK' ? { workId: dto.assetId } : { recordingId: dto.assetId };
      const dup = await tx.contribution.findFirst({ where: { organizationId: auth.orgId, partyId: dto.partyId, role: dto.role, ...link } });
      if (dup) throw new BadRequestException('This person already has that credit');
      const c = await tx.contribution.create({
        data: { organizationId: auth.orgId, partyId: dto.partyId, role: dto.role, creditOrder: dto.creditOrder ?? 1, ...link },
        include: { party: { select: { id: true, legalName: true, stageName: true } } },
      });
      await this.audit.log(tx, auth, { action: 'contribution.added', entityType: 'contribution', entityId: c.id, after: dto });
      return c;
    });
  }

  @Delete(':id')
  @RequirePermission('catalog.write')
  remove(@Auth() auth: OrgContext, @Param('id') id: string) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const c = found(await tx.contribution.findFirst({ where: { id, organizationId: auth.orgId } }), 'Credit');
      await tx.contribution.delete({ where: { id } });
      await this.audit.log(tx, auth, { action: 'contribution.removed', entityType: 'contribution', entityId: id, before: c });
      return { ok: true };
    });
  }
}
