import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import argon2 from 'argon2';
import type { Response } from 'express';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { config, CSRF_COOKIE, SESSION_COOKIE } from '../config.js';
import { decrypt, encrypt, randomToken, sha256 } from '../common/crypto.js';
import type { AuthContext } from './context.js';
import { permissionsFor } from './rbac.js';
import { mfaQr, newMfaSecret, verifyTotp } from './mfa.js';

const DUMMY_HASH = '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$0q7r3Yt2d3QzFQ4m2V2x0yQ2u6h3QnU0bGZ0ZWxkZWQ';

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'org'
  );
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  hashPassword(pw: string) {
    return argon2.hash(pw, { type: argon2.argon2id });
  }

  private setCookies(res: Response, token: string, csrf: string, expires: Date) {
    const base = { secure: config.cookieSecure, sameSite: 'lax' as const, path: '/', expires };
    res.cookie(SESSION_COOKIE, token, { ...base, httpOnly: true });
    res.cookie(CSRF_COOKIE, csrf, { ...base, httpOnly: false });
  }

  clearCookies(res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.clearCookie(CSRF_COOKIE, { path: '/' });
  }

  private async createSession(
    res: Response,
    userId: string,
    opts: { mfaVerified: boolean; ip?: string | null; ua?: string | null; activeOrgId?: string | null },
  ) {
    const token = randomToken();
    const csrf = randomToken(24);
    const expiresAt = new Date(Date.now() + config.sessionTtlHours * 3600_000);
    let activeOrgId = opts.activeOrgId ?? null;
    if (!activeOrgId) {
      const first = await this.prisma.system((tx) =>
        tx.membership.findFirst({ where: { userId, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } }),
      );
      activeOrgId = first?.organizationId ?? null;
    }
    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: sha256(token),
        csrfHash: sha256(csrf),
        mfaVerified: opts.mfaVerified,
        ip: opts.ip ?? null,
        userAgent: opts.ua?.slice(0, 300) ?? null,
        activeOrgId,
        expiresAt,
      },
    });
    this.setCookies(res, token, csrf, expiresAt);
  }

  async login(email: string, password: string, res: Response, ip: string | null, ua: string | null) {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    const now = new Date();
    if (!user || !user.passwordHash || user.status !== 'ACTIVE') {
      await argon2.verify(DUMMY_HASH, password).catch(() => false);
      throw new UnauthorizedException('Invalid email or password');
    }
    if (user.lockedUntil && user.lockedUntil > now) {
      throw new ForbiddenException('Account temporarily locked after repeated failures. Try again later.');
    }
    const ok = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!ok) {
      const failures = user.failedLogins + 1;
      const lock = failures >= config.loginMaxFailures;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLogins: lock ? 0 : failures,
          lockedUntil: lock ? new Date(now.getTime() + config.loginLockMinutes * 60_000) : null,
        },
      });
      await this.audit.log(null, { userId: user.id, email: user.email, ip, orgId: null }, {
        action: lock ? 'auth.locked' : 'auth.login_failed',
        entityType: 'user',
        entityId: user.id,
        orgId: null,
      });
      throw new UnauthorizedException('Invalid email or password');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null, lastLoginAt: now },
    });
    await this.createSession(res, user.id, { mfaVerified: !user.mfaEnabled, ip, ua });
    await this.audit.log(null, { userId: user.id, email: user.email, ip, orgId: null }, {
      action: 'auth.login',
      entityType: 'user',
      entityId: user.id,
      orgId: null,
    });
    return { mfaRequired: user.mfaEnabled };
  }

  async verifyMfa(auth: AuthContext, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (!user.mfaEnabled || !user.mfaSecretEnc) throw new BadRequestException('MFA is not enabled');
    let ok = await verifyTotp(decrypt(user.mfaSecretEnc), code);
    if (!ok) {
      const h = sha256(code.trim().toUpperCase());
      if (user.mfaRecoveryHashes.includes(h)) {
        ok = true;
        await this.prisma.user.update({
          where: { id: user.id },
          data: { mfaRecoveryHashes: user.mfaRecoveryHashes.filter((x) => x !== h) },
        });
      }
    }
    if (!ok) throw new UnauthorizedException('Invalid code');
    await this.prisma.session.update({ where: { id: auth.sessionId }, data: { mfaVerified: true } });
    return { ok: true };
  }

  async startMfaSetup(auth: AuthContext) {
    const secret = newMfaSecret();
    await this.prisma.user.update({ where: { id: auth.userId }, data: { mfaPendingSecretEnc: encrypt(secret) } });
    const qr = await mfaQr(auth.email, secret);
    return { secret, ...qr };
  }

  async enableMfa(auth: AuthContext, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (!user.mfaPendingSecretEnc) throw new BadRequestException('Start MFA setup first');
    const secret = decrypt(user.mfaPendingSecretEnc);
    if (!(await verifyTotp(secret, code))) throw new BadRequestException('Invalid code — check your authenticator time');
    const recovery = Array.from({ length: 8 }, () => randomToken(6).toUpperCase().replace(/[^A-Z0-9]/g, 'X').slice(0, 8));
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        mfaEnabled: true,
        mfaSecretEnc: encrypt(secret),
        mfaPendingSecretEnc: null,
        mfaRecoveryHashes: recovery.map((r) => sha256(r)),
      },
    });
    await this.prisma.session.update({ where: { id: auth.sessionId }, data: { mfaVerified: true } });
    await this.audit.log(null, auth, { action: 'auth.mfa_enabled', entityType: 'user', entityId: user.id, orgId: null });
    return { recoveryCodes: recovery };
  }

  async disableMfa(auth: AuthContext, password: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (!user.mfaEnabled || !user.mfaSecretEnc || !user.passwordHash) throw new BadRequestException('MFA is not enabled');
    const ok = (await argon2.verify(user.passwordHash, password)) && (await verifyTotp(decrypt(user.mfaSecretEnc), code));
    if (!ok) throw new UnauthorizedException('Invalid password or code');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { mfaEnabled: false, mfaSecretEnc: null, mfaRecoveryHashes: [] },
    });
    await this.audit.log(null, auth, { action: 'auth.mfa_disabled', entityType: 'user', entityId: user.id, orgId: null });
    return { ok: true };
  }

  async changePassword(auth: AuthContext, current: string, next: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (!user.passwordHash || !(await argon2.verify(user.passwordHash, current))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await this.hashPassword(next), passwordChangedAt: new Date() },
      }),
      // Revoke every other session.
      this.prisma.session.updateMany({
        where: { userId: user.id, id: { not: auth.sessionId }, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit.log(null, auth, { action: 'auth.password_changed', entityType: 'user', entityId: user.id, orgId: null });
    return { ok: true };
  }

  async logout(auth: AuthContext, res: Response) {
    await this.prisma.session.update({ where: { id: auth.sessionId }, data: { revokedAt: new Date() } });
    this.clearCookies(res);
    return { ok: true };
  }

  async me(auth: AuthContext) {
    const memberships = await this.prisma.system((tx) =>
      tx.membership.findMany({
        where: { userId: auth.userId, status: 'ACTIVE', organization: { status: { not: 'CLOSED' } } },
        include: { organization: { select: { id: true, displayName: true, slug: true, status: true, logoUrl: true, brandColor: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    );
    let activeOrg = memberships.find((m) => m.organizationId === auth.orgId)?.organization ?? null;
    if (!activeOrg && auth.breakGlass && auth.orgId) {
      activeOrg = await this.prisma.organization.findUnique({
        where: { id: auth.orgId },
        select: { id: true, displayName: true, slug: true, status: true, logoUrl: true, brandColor: true },
      });
    }
    return {
      user: {
        id: auth.userId,
        email: auth.email,
        name: auth.name,
        isPlatformAdmin: auth.isPlatformAdmin,
        mfaEnabled: auth.mfaEnabled,
      },
      mfaPending: auth.mfaEnabled && !auth.mfaVerified,
      mfaSetupRequired:
        config.enforceAdminMfa &&
        !auth.mfaEnabled &&
        (auth.isPlatformAdmin || auth.role === 'OWNER' || auth.role === 'ADMIN'),
      activeOrg,
      role: auth.role,
      breakGlass: auth.breakGlass,
      permissions: [...auth.permissions],
      organizations: memberships.map((m) => ({ ...m.organization, role: m.role })),
    };
  }

  async switchOrg(auth: AuthContext, organizationId: string) {
    const membership = await this.prisma.system((tx) =>
      tx.membership.findUnique({ where: { organizationId_userId: { organizationId, userId: auth.userId } } }),
    );
    let allowed = membership?.status === 'ACTIVE';
    if (!allowed && auth.isPlatformAdmin) {
      allowed = !!(await this.prisma.breakGlassGrant.findFirst({
        where: { adminUserId: auth.userId, organizationId, revokedAt: null, expiresAt: { gt: new Date() } },
      }));
    }
    if (!allowed) throw new ForbiddenException('Not a member of that organization');
    await this.prisma.session.update({ where: { id: auth.sessionId }, data: { activeOrgId: organizationId } });
    return { ok: true };
  }

  async signup(
    dto: { name: string; email: string; password: string; organizationName: string; acceptTerms: boolean },
    res: Response,
    ip: string | null,
    ua: string | null,
  ) {
    if (!config.allowSignup) throw new ForbiddenException('Self-service signup is disabled');
    if (!dto.acceptTerms) throw new BadRequestException('You must accept the Terms and Privacy Policy');
    const email = dto.email.trim().toLowerCase();
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) throw new BadRequestException('An account with this email already exists — sign in instead');
    const passwordHash = await this.hashPassword(dto.password);
    const { user, org } = await this.prisma.system(async (tx) => {
      const plan = await tx.plan.findFirst({ where: { code: 'artist' } });
      const user = await tx.user.create({ data: { email, name: dto.name.trim(), passwordHash } });
      const org = await tx.organization.create({
        data: {
          legalName: dto.organizationName.trim(),
          displayName: dto.organizationName.trim(),
          slug: await this.uniqueSlug(tx, dto.organizationName),
          planId: plan?.id,
          email,
          settings: { termsAcceptedAt: new Date().toISOString(), termsAcceptedBy: email },
        },
      });
      await tx.membership.create({ data: { organizationId: org.id, userId: user.id, role: Role.OWNER } });
      if (plan) {
        await tx.subscription.create({
          data: {
            organizationId: org.id,
            planId: plan.id,
            status: 'TRIALING',
            trialEndsAt: new Date(Date.now() + 14 * 86400_000),
          },
        });
      }
      await this.audit.log(tx, { userId: user.id, email, ip, orgId: org.id }, {
        action: 'org.created',
        entityType: 'organization',
        entityId: org.id,
        after: { displayName: org.displayName, via: 'signup' },
      });
      return { user, org };
    });
    await this.createSession(res, user.id, { mfaVerified: true, ip, ua, activeOrgId: org.id });
    return { ok: true, organizationId: org.id };
  }

  async uniqueSlug(tx: Prisma.TransactionClient, name: string) {
    const base = slugify(name);
    let slug = base;
    for (let i = 2; await tx.organization.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
    return slug;
  }

  async inviteInfo(token: string) {
    const m = await this.prisma.system((tx) =>
      tx.membership.findUnique({
        where: { inviteTokenHash: sha256(token) },
        include: { organization: { select: { displayName: true } }, user: { select: { email: true, name: true, passwordHash: true } } },
      }),
    );
    if (!m || !m.inviteExpiresAt || m.inviteExpiresAt < new Date()) throw new BadRequestException('Invite is invalid or expired');
    return {
      organization: m.organization.displayName,
      email: m.user.email,
      name: m.user.name,
      role: m.role,
      needsPassword: !m.user.passwordHash,
    };
  }

  async acceptInvite(dto: { token: string; name?: string; password?: string }, res: Response, ip: string | null, ua: string | null) {
    const m = await this.prisma.system((tx) =>
      tx.membership.findUnique({ where: { inviteTokenHash: sha256(dto.token) }, include: { user: true } }),
    );
    if (!m || !m.inviteExpiresAt || m.inviteExpiresAt < new Date()) throw new BadRequestException('Invite is invalid or expired');
    if (!m.user.passwordHash && !dto.password) throw new BadRequestException('Choose a password');
    const userData: Prisma.UserUpdateInput = { status: 'ACTIVE' };
    if (!m.user.passwordHash && dto.password) userData.passwordHash = await this.hashPassword(dto.password);
    if (dto.name) userData.name = dto.name;
    await this.prisma.system(async (tx) => {
      await tx.user.update({ where: { id: m.userId }, data: userData });
      await tx.membership.update({
        where: { id: m.id },
        data: { status: 'ACTIVE', inviteTokenHash: null, inviteExpiresAt: null },
      });
      await this.audit.log(tx, { userId: m.userId, email: m.user.email, ip, orgId: m.organizationId }, {
        action: 'membership.accepted',
        entityType: 'membership',
        entityId: m.id,
      });
    });
    await this.createSession(res, m.userId, { mfaVerified: !m.user.mfaEnabled, ip, ua, activeOrgId: m.organizationId });
    return { ok: true, mfaRequired: m.user.mfaEnabled };
  }

  permissionsFor = permissionsFor;
}
