import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Auth, type OrgContext, RequirePermission } from '../auth/context.js';

class UpdateOrgDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) legalName?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) displayName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @Matches(/^[0-9A-Z]{15}$/, { message: 'GSTIN must be 15 characters' }) gstin?: string;
  @IsOptional() @Matches(/^[A-Z]{2}$/) country?: string;
  @IsOptional() @Matches(/^https:\/\/\S+$/, { message: 'Logo URL must be https' }) logoUrl?: string;
  @IsOptional() @Matches(/^#[0-9a-fA-F]{6}$/) brandColor?: string;
}

const PUBLIC_FIELDS = {
  id: true, legalName: true, displayName: true, slug: true, status: true, email: true, phone: true,
  address: true, gstin: true, country: true, logoUrl: true, brandColor: true, createdAt: true,
  plan: { select: { code: true, name: true, maxRecordings: true, maxUsers: true, maxStorageBytes: true } },
} as const;

@ApiTags('organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('current')
  @RequirePermission('org.read')
  async current(@Auth() auth: OrgContext) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: auth.orgId }, select: PUBLIC_FIELDS });
    return { ...org, plan: org.plan && { ...org.plan, maxStorageBytes: org.plan.maxStorageBytes?.toString() ?? null } };
  }

  @Patch('current')
  @RequirePermission('org.manage')
  async update(@Auth() auth: OrgContext, @Body() dto: UpdateOrgDto) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const before = await tx.organization.findUniqueOrThrow({ where: { id: auth.orgId } });
      const after = await tx.organization.update({ where: { id: auth.orgId }, data: dto, select: PUBLIC_FIELDS });
      await this.audit.log(tx, auth, {
        action: 'org.updated',
        entityType: 'organization',
        entityId: auth.orgId,
        before: Object.fromEntries(Object.keys(dto).map((k) => [k, (before as Record<string, unknown>)[k]])),
        after: dto,
      });
      return { ...after, plan: after.plan && { ...after.plan, maxStorageBytes: after.plan.maxStorageBytes?.toString() ?? null } };
    });
  }
}
