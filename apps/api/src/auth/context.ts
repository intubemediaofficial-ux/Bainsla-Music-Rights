import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import type { Permission } from './rbac.js';

export interface AuthContext {
  sessionId: string;
  userId: string;
  email: string;
  name: string;
  isPlatformAdmin: boolean;
  mfaEnabled: boolean;
  mfaVerified: boolean;
  orgId: string | null;
  role: Role | null;
  membershipId: string | null;
  breakGlass: boolean;
  permissions: Set<Permission>;
  ip: string | null;
}

/** Tenant-bound context: guaranteed organization. */
export interface OrgContext extends AuthContext {
  orgId: string;
}

export type AuthedRequest = Request & { auth?: AuthContext };

export const IS_PUBLIC = 'mrc:public';
export const ALLOW_PARTIAL = 'mrc:partial';
export const PERMS = 'mrc:perms';
export const PLATFORM_ADMIN = 'mrc:platform';
export const NO_ORG = 'mrc:no-org';

/** No session required. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Allowed before MFA is verified / set up (login steps, logout, me). */
export const AllowPartial = () => SetMetadata(ALLOW_PARTIAL, true);
/** Session required but no active organization needed. */
export const NoOrg = () => SetMetadata(NO_ORG, true);
export const RequirePermission = (...perms: Permission[]) => SetMetadata(PERMS, perms);
export const PlatformAdminOnly = () => SetMetadata(PLATFORM_ADMIN, true);

export const Auth = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().auth;
});
