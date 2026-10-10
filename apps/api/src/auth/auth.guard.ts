import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service.js';
import { config, SESSION_COOKIE } from '../config.js';
import { safeEqualHex, sha256 } from '../common/crypto.js';
import {
  ALLOW_PARTIAL,
  AuthContext,
  AuthedRequest,
  IS_PUBLIC,
  NO_ORG,
  PERMS,
  PLATFORM_ADMIN,
} from './context.js';
import { BREAK_GLASS_PERMISSIONS, Permission, permissionsFor, PRIVILEGED_ROLES } from './rbac.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  private meta<T>(key: string, ctx: ExecutionContext): T | undefined {
    return this.reflector.getAllAndOverride<T>(key, [ctx.getHandler(), ctx.getClass()]);
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (this.meta<boolean>(IS_PUBLIC, ctx)) return true;

    const token: string | undefined = req.cookies?.[SESSION_COOKIE];
    if (!token) throw new UnauthorizedException('Not signed in');

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: true },
    });
    const now = new Date();
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt < now ||
      now.getTime() - session.lastSeenAt.getTime() > config.sessionIdleHours * 3600_000 ||
      session.user.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedException('Session expired');
    }

    // CSRF: double-submit token bound to the session.
    if (!SAFE_METHODS.has(req.method)) {
      const header = req.headers['x-csrf-token'];
      const value = Array.isArray(header) ? header[0] : header;
      if (!value || !safeEqualHex(sha256(value), session.csrfHash)) {
        throw new ForbiddenException('Invalid CSRF token');
      }
    }

    const user = session.user;
    const auth: AuthContext = {
      sessionId: session.id,
      userId: user.id,
      email: user.email,
      name: user.name,
      isPlatformAdmin: user.isPlatformAdmin,
      mfaEnabled: user.mfaEnabled,
      mfaVerified: session.mfaVerified,
      orgId: null,
      role: null,
      membershipId: null,
      breakGlass: false,
      permissions: new Set(),
      ip: req.ip ?? null,
    };

    if (session.activeOrgId) {
      const membership = await this.prisma.system((tx) =>
        tx.membership.findUnique({
          where: { organizationId_userId: { organizationId: session.activeOrgId!, userId: user.id } },
          include: { organization: { select: { status: true } } },
        }),
      );
      if (membership && membership.status === 'ACTIVE' && membership.organization.status !== 'CLOSED') {
        auth.orgId = membership.organizationId;
        auth.role = membership.role;
        auth.membershipId = membership.id;
        auth.permissions = membership.organization.status === 'SUSPENDED'
          ? new Set(['org.read', 'billing.manage'] as Permission[])
          : permissionsFor(membership.role, membership.canApproveOwnership);
      } else if (user.isPlatformAdmin) {
        const grant = await this.prisma.breakGlassGrant.findFirst({
          where: { adminUserId: user.id, organizationId: session.activeOrgId, revokedAt: null, expiresAt: { gt: now } },
        });
        if (grant) {
          auth.orgId = grant.organizationId;
          auth.breakGlass = true;
          auth.permissions = new Set(BREAK_GLASS_PERMISSIONS);
        }
      }
    }
    req.auth = auth;

    if (now.getTime() - session.lastSeenAt.getTime() > 5 * 60_000) {
      await this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: now } });
    }

    const partialOk = this.meta<boolean>(ALLOW_PARTIAL, ctx);
    if (user.mfaEnabled && !session.mfaVerified && !partialOk) {
      throw new UnauthorizedException({ message: 'MFA verification required', code: 'MFA_REQUIRED' });
    }
    const privileged = user.isPlatformAdmin || (auth.role !== null && PRIVILEGED_ROLES.includes(auth.role));
    if (config.enforceAdminMfa && privileged && !user.mfaEnabled && !partialOk) {
      throw new ForbiddenException({ message: 'MFA setup required for admins', code: 'MFA_SETUP_REQUIRED' });
    }

    if (this.meta<boolean>(PLATFORM_ADMIN, ctx)) {
      if (!user.isPlatformAdmin) throw new ForbiddenException('Platform admin only');
      return true;
    }

    const perms = this.meta<Permission[]>(PERMS, ctx) ?? [];
    if (this.meta<boolean>(NO_ORG, ctx) || (partialOk && perms.length === 0)) return true;
    if (!auth.orgId) throw new ForbiddenException({ message: 'No active organization', code: 'NO_ORG' });
    for (const p of perms) {
      if (!auth.permissions.has(p)) throw new ForbiddenException(`Missing permission: ${p}`);
    }
    return true;
  }
}
