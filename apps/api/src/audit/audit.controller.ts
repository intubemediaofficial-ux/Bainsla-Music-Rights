import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { Auth, type OrgContext, RequirePermission } from '../auth/context.js';
import { PageQuery, pageArgs, toPage } from '../common/pagination.js';

class AuditQuery extends PageQuery {
  @IsOptional() @IsString() entityType?: string;
  @IsOptional() @IsString() entityId?: string;
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsString() actor?: string;
}

@ApiTags('audit-logs')
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermission('audit.read')
  async list(@Auth() auth: OrgContext, @Query() q: AuditQuery) {
    const where: Prisma.AuditLogWhereInput = {
      organizationId: auth.orgId,
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.action ? { action: { startsWith: q.action } } : {}),
      ...(q.actor ? { actorEmail: { contains: q.actor, mode: 'insensitive' } } : {}),
    };
    const rows = await this.prisma.tenant(auth.orgId, (tx) =>
      tx.auditLog.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...pageArgs(q, 50) }),
    );
    return toPage(rows, q, 50);
  }
}
