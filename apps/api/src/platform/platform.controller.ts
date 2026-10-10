import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { OrgStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Auth, type AuthContext, PlatformAdminOnly } from '../auth/context.js';
import { AuthService } from '../auth/auth.service.js';
import { randomToken, sha256 } from '../common/crypto.js';
import { config } from '../config.js';

class CreateTenantDto {
  @IsString() @MinLength(2) @MaxLength(200) legalName!: string;
  @IsOptional() @IsString() @MaxLength(120) displayName?: string;
  @IsEmail() ownerEmail!: string;
  @IsOptional() @IsString() @MaxLength(120) ownerName?: string;
  @IsOptional() @IsString() planCode?: string;
}

class UpdateTenantDto {
  @IsOptional() @IsEnum(OrgStatus) status?: OrgStatus;
  @IsOptional() @IsString() planCode?: string;
}

class BreakGlassDto {
  @IsString() @MinLength(15, { message: 'Give a specific reason (15+ chars) — this is audited' }) @MaxLength(500) reason!: string;
  @IsOptional() @IsInt() @Min(5) @Max(240) minutes?: number;
}

/** Platform operations. Never returns tenant catalog data — only counts and metadata. */
@ApiTags('platform')
@PlatformAdminOnly()
@Controller('platform')
export class PlatformController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
  ) {}

  @Get('overview')
  async overview() {
    return this.prisma.system(async (tx) => {
      const [orgs, users, recordings, works, sessions24h] = await Promise.all([
        tx.organization.groupBy({ by: ['status'], _count: true }),
        tx.user.count(),
        tx.recording.count(),
        tx.musicalWork.count(),
        tx.session.count({ where: { createdAt: { gt: new Date(Date.now() - 86400_000) } } }),
      ]);
      const db = await tx.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`;
      return {
        organizationsByStatus: Object.fromEntries(orgs.map((o) => [o.status, o._count])),
        users,
        recordings,
        works,
        logins24h: sessions24h,
        databaseBytes: db[0]?.size.toString() ?? null,
        uptimeSec: Math.round(process.uptime()),
      };
    });
  }

  @Get('organizations')
  organizations() {
    return this.prisma.system(async (tx) => {
      const orgs = await tx.organization.findMany({
        orderBy: { createdAt: 'desc' },
        include: { plan: { select: { code: true, name: true } }, _count: { select: { memberships: true } } },
      });
      const counts = await tx.recording.groupBy({ by: ['organizationId'], _count: true });
      const byOrg = new Map(counts.map((c) => [c.organizationId, c._count]));
      return orgs.map((o) => ({
        id: o.id, legalName: o.legalName, displayName: o.displayName, slug: o.slug, status: o.status,
        plan: o.plan, members: o._count.memberships, recordings: byOrg.get(o.id) ?? 0, createdAt: o.createdAt,
      }));
    });
  }

  @Get('plans')
  plans() {
    return this.prisma.plan.findMany({ orderBy: { sortOrder: 'asc' } }).then((ps) =>
      ps.map((p) => ({ ...p, maxStorageBytes: p.maxStorageBytes?.toString() ?? null })),
    );
  }

  @Post('organizations')
  async create(@Auth() actor: AuthContext, @Body() dto: CreateTenantDto) {
    const email = dto.ownerEmail.trim().toLowerCase();
    const token = randomToken();
    return this.prisma.system(async (tx) => {
      const plan = dto.planCode ? await tx.plan.findUnique({ where: { code: dto.planCode } }) : null;
      if (dto.planCode && !plan) throw new BadRequestException('Unknown plan');
      const org = await tx.organization.create({
        data: {
          legalName: dto.legalName.trim(),
          displayName: (dto.displayName || dto.legalName).trim(),
          slug: await this.auth.uniqueSlug(tx, dto.displayName || dto.legalName),
          planId: plan?.id,
          status: 'ACTIVE',
        },
      });
      const user = await tx.user.upsert({
        where: { email },
        update: {},
        create: { email, name: dto.ownerName?.trim() || email.split('@')[0], status: 'INVITED' },
      });
      await tx.membership.create({
        data: {
          organizationId: org.id, userId: user.id, role: Role.OWNER, status: 'INVITED',
          inviteTokenHash: sha256(token), inviteExpiresAt: new Date(Date.now() + 7 * 86400_000),
          invitedAt: new Date(), invitedById: actor.userId,
        },
      });
      if (plan) await tx.subscription.create({ data: { organizationId: org.id, planId: plan.id, status: 'ACTIVE' } });
      await this.audit.log(tx, actor, { orgId: org.id, action: 'platform.org_provisioned', entityType: 'organization', entityId: org.id, after: { legalName: org.legalName, ownerEmail: email } });
      return { organization: org, ownerInviteUrl: `${config.appUrl}/invite?token=${token}` };
    });
  }

  @Patch('organizations/:id')
  async update(@Auth() actor: AuthContext, @Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.prisma.system(async (tx) => {
      const org = await tx.organization.findUnique({ where: { id } });
      if (!org) throw new NotFoundException();
      let planId: string | undefined;
      if (dto.planCode) {
        const plan = await tx.plan.findUnique({ where: { code: dto.planCode } });
        if (!plan) throw new BadRequestException('Unknown plan');
        planId = plan.id;
        await tx.subscription.upsert({
          where: { organizationId: id },
          update: { planId },
          create: { organizationId: id, planId, status: 'ACTIVE' },
        });
      }
      const updated = await tx.organization.update({ where: { id }, data: { status: dto.status, planId } });
      await this.audit.log(tx, actor, { orgId: id, action: 'platform.org_updated', entityType: 'organization', entityId: id, before: { status: org.status, planId: org.planId }, after: dto });
      return updated;
    });
  }

  /** Audited, time-boxed, read-only access to a tenant for support. */
  @Post('organizations/:id/break-glass')
  async breakGlass(@Auth() actor: AuthContext, @Param('id') id: string, @Body() dto: BreakGlassDto) {
    const org = await this.prisma.organization.findUnique({ where: { id } });
    if (!org) throw new NotFoundException();
    const grant = await this.prisma.breakGlassGrant.create({
      data: { adminUserId: actor.userId, organizationId: id, reason: dto.reason, expiresAt: new Date(Date.now() + (dto.minutes ?? 30) * 60_000) },
    });
    await this.audit.log(null, actor, { orgId: id, action: 'platform.break_glass', entityType: 'organization', entityId: id, meta: { reason: dto.reason, expiresAt: grant.expiresAt } });
    return grant;
  }

  @Get('audit-logs')
  auditLogs() {
    return this.prisma.system((tx) =>
      tx.auditLog.findMany({ where: { action: { startsWith: 'platform.' } }, orderBy: { createdAt: 'desc' }, take: 100 }),
    );
  }
}
