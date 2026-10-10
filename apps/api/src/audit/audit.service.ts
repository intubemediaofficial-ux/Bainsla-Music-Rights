import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, Tx } from '../prisma/prisma.service.js';
import { redact } from '../common/redact.js';
import type { AuthContext } from '../auth/context.js';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  meta?: unknown;
  orgId?: string | null;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Write inside the caller's transaction so the audit row commits atomically with the change. */
  async log(tx: Tx | null, actor: Pick<AuthContext, 'userId' | 'email' | 'ip' | 'orgId'> | null, e: AuditEntry) {
    const data: Prisma.AuditLogUncheckedCreateInput = {
      organizationId: e.orgId !== undefined ? e.orgId : (actor?.orgId ?? null),
      actorUserId: actor?.userId ?? null,
      actorEmail: actor?.email ?? null,
      ip: actor?.ip ?? null,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId ?? null,
      summary: redact({ before: e.before, after: e.after, meta: e.meta }) as Prisma.InputJsonValue,
    };
    if (tx) return tx.auditLog.create({ data });
    return this.prisma.system((t) => t.auditLog.create({ data }));
  }
}
