import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, RequirePermission } from '../auth/context.js';
import type { OrgContext } from '../auth/context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from './notifications.service.js';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Re-run alert checks for the active organization now (the scheduler also runs hourly). */
  @Post('scan')
  @HttpCode(200)
  @RequirePermission('notifications.read')
  async scan(@Auth() auth: OrgContext) {
    const created = await this.prisma.tenant(auth.orgId, (tx) => this.notifications.scan(tx, auth.orgId));
    return { created };
  }

  @Get()
  @RequirePermission('notifications.read')
  list(@Auth() auth: OrgContext) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const where = { organizationId: auth.orgId, OR: [{ userId: auth.userId }, { userId: null }] };
      const [data, unread] = await Promise.all([
        tx.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 30 }),
        tx.notification.count({ where: { ...where, readAt: null } }),
      ]);
      return { data, unread };
    });
  }

  @Post(':id/read')
  @HttpCode(200)
  @RequirePermission('notifications.read')
  read(@Auth() auth: OrgContext, @Param('id') id: string) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      await tx.notification.updateMany({
        where: { id, organizationId: auth.orgId, OR: [{ userId: auth.userId }, { userId: null }] },
        data: { readAt: new Date() },
      });
      return { ok: true };
    });
  }

  @Post('read-all')
  @HttpCode(200)
  @RequirePermission('notifications.read')
  readAll(@Auth() auth: OrgContext) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      await tx.notification.updateMany({
        where: { organizationId: auth.orgId, readAt: null, OR: [{ userId: auth.userId }, { userId: null }] },
        data: { readAt: new Date() },
      });
      return { ok: true };
    });
  }
}
