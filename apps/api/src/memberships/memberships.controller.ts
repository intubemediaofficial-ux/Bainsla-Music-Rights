import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { MembershipStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Auth, type OrgContext, RequirePermission } from '../auth/context.js';
import { assignableRoles } from '../auth/rbac.js';
import { randomToken, sha256 } from '../common/crypto.js';
import { config } from '../config.js';

class InviteDto {
  @IsEmail() @MaxLength(200) email!: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsEnum(Role) role!: Role;
  @IsOptional() @IsBoolean() canApproveOwnership?: boolean;
}

class UpdateMembershipDto {
  @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @IsEnum(MembershipStatus) status?: MembershipStatus;
  @IsOptional() @IsBoolean() canApproveOwnership?: boolean;
}

const SELECT = {
  id: true, role: true, status: true, canApproveOwnership: true, invitedAt: true, createdAt: true,
  inviteExpiresAt: true,
  user: { select: { id: true, email: true, name: true, mfaEnabled: true, lastLoginAt: true } },
} as const;

@ApiTags('memberships')
@Controller('memberships')
export class MembershipsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermission('members.read')
  list(@Auth() auth: OrgContext) {
    return this.prisma.tenant(auth.orgId, async (tx) => ({
      data: await tx.membership.findMany({ where: { organizationId: auth.orgId }, select: SELECT, orderBy: { createdAt: 'asc' } }),
      assignableRoles: auth.role ? assignableRoles(auth.role) : [],
    }));
  }

  @Post()
  @RequirePermission('members.manage')
  async invite(@Auth() auth: OrgContext, @Body() dto: InviteDto) {
    if (!auth.role || !assignableRoles(auth.role).includes(dto.role)) throw new ForbiddenException('You cannot assign that role');
    const email = dto.email.trim().toLowerCase();
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: auth.orgId }, include: { plan: true } });
    const token = randomToken();
    return this.prisma.tenant(auth.orgId, async (tx) => {
      if (org.plan?.maxUsers) {
        const count = await tx.membership.count({ where: { organizationId: auth.orgId, status: { not: 'DISABLED' } } });
        if (count >= org.plan.maxUsers) throw new BadRequestException(`Plan limit reached (${org.plan.maxUsers} users). Upgrade to add more.`);
      }
      // users are global (not tenant rows); creating a shell user for the invite is safe.
      const user = await tx.user.upsert({
        where: { email },
        update: {},
        create: { email, name: dto.name?.trim() || email.split('@')[0], status: 'INVITED' },
      });
      const existing = await tx.membership.findUnique({ where: { organizationId_userId: { organizationId: auth.orgId, userId: user.id } } });
      if (existing && existing.status === 'ACTIVE') throw new BadRequestException('This person is already a member');
      const data = {
        role: dto.role,
        status: 'INVITED' as const,
        canApproveOwnership: dto.role === 'RIGHTS_MANAGER' ? !!dto.canApproveOwnership : false,
        inviteTokenHash: sha256(token),
        inviteExpiresAt: new Date(Date.now() + 7 * 86400_000),
        invitedAt: new Date(),
        invitedById: auth.userId,
      };
      const m = existing
        ? await tx.membership.update({ where: { id: existing.id }, data, select: SELECT })
        : await tx.membership.create({ data: { ...data, organizationId: auth.orgId, userId: user.id }, select: SELECT });
      await this.audit.log(tx, auth, { action: 'membership.invited', entityType: 'membership', entityId: m.id, after: { email, role: dto.role } });
      return { membership: m, inviteUrl: `${config.appUrl}/invite?token=${token}` };
    });
  }

  @Patch(':id')
  @RequirePermission('members.manage')
  update(@Auth() auth: OrgContext, @Param('id') id: string, @Body() dto: UpdateMembershipDto) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const m = await tx.membership.findFirst({ where: { id, organizationId: auth.orgId } });
      if (!m) throw new NotFoundException();
      const allowed = auth.role ? assignableRoles(auth.role) : [];
      if (!allowed.includes(m.role)) throw new ForbiddenException('You cannot change this member');
      if (dto.role && !allowed.includes(dto.role)) throw new ForbiddenException('You cannot assign that role');
      if (m.userId === auth.userId) throw new BadRequestException('You cannot change your own membership');
      if (m.role === 'OWNER' && (dto.role && dto.role !== 'OWNER' || dto.status === 'DISABLED')) {
        const owners = await tx.membership.count({ where: { organizationId: auth.orgId, role: 'OWNER', status: 'ACTIVE' } });
        if (owners <= 1) throw new BadRequestException('Organization must keep at least one active owner');
      }
      const role = dto.role ?? m.role;
      const updated = await tx.membership.update({
        where: { id },
        data: {
          ...dto,
          canApproveOwnership: role === 'RIGHTS_MANAGER' ? (dto.canApproveOwnership ?? m.canApproveOwnership) : false,
        },
        select: SELECT,
      });
      await this.audit.log(tx, auth, {
        action: 'membership.updated', entityType: 'membership', entityId: id,
        before: { role: m.role, status: m.status, canApproveOwnership: m.canApproveOwnership }, after: dto,
      });
      if (dto.status === 'DISABLED') {
        await tx.session.updateMany({ where: { userId: m.userId, activeOrgId: auth.orgId, revokedAt: null }, data: { activeOrgId: null } });
      }
      return updated;
    });
  }

  @Delete(':id')
  @RequirePermission('members.manage')
  remove(@Auth() auth: OrgContext, @Param('id') id: string) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const m = await tx.membership.findFirst({ where: { id, organizationId: auth.orgId } });
      if (!m) throw new NotFoundException();
      if (m.userId === auth.userId) throw new BadRequestException('You cannot remove yourself');
      if (!(auth.role && assignableRoles(auth.role).includes(m.role))) throw new ForbiddenException('You cannot remove this member');
      if (m.role === 'OWNER') {
        const owners = await tx.membership.count({ where: { organizationId: auth.orgId, role: 'OWNER', status: 'ACTIVE' } });
        if (owners <= 1) throw new BadRequestException('Organization must keep at least one active owner');
      }
      await tx.membership.delete({ where: { id } });
      await tx.session.updateMany({ where: { userId: m.userId, activeOrgId: auth.orgId }, data: { activeOrgId: null } });
      await this.audit.log(tx, auth, { action: 'membership.removed', entityType: 'membership', entityId: id, before: { userId: m.userId, role: m.role } });
      return { ok: true };
    });
  }
}
