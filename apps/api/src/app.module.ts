import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { PartiesController } from './catalog/parties.controller.js';
import { WorksController } from './catalog/works.controller.js';
import { RecordingsController } from './catalog/recordings.controller.js';
import { ReleasesController } from './catalog/releases.controller.js';
import { RightsController } from './catalog/rights.controller.js';
import { ContributionsController } from './catalog/contributions.controller.js';
import { LicensesController } from './catalog/licenses.controller.js';
import { ImportsController } from './catalog/imports.controller.js';
import { PrismaModule } from './prisma/prisma.service.js';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthService } from './auth/auth.service.js';
import { AuthController } from './auth/auth.controller.js';
import { AuditService } from './audit/audit.service.js';
import { AuditController } from './audit/audit.controller.js';
import { OrganizationsController } from './organizations/organizations.controller.js';
import { MembershipsController } from './memberships/memberships.controller.js';
import { PlatformController } from './platform/platform.controller.js';
import { DashboardController } from './dashboard/dashboard.controller.js';
import { SearchController } from './search/search.controller.js';
import { HealthController } from './health/health.controller.js';
import { NotificationsController } from './notifications/notifications.controller.js';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
        redact: {
          paths: ['req.headers.cookie', 'req.headers.authorization', 'req.headers["x-csrf-token"]', 'res.headers["set-cookie"]'],
          censor: '[REDACTED]',
        },
        autoLogging: { ignore: (req) => req.url?.includes('/health') ?? false },
      },
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: Number(process.env.RATE_LIMIT_PER_MIN ?? 300) }]),
    PrismaModule,
  ],
  controllers: [
    PartiesController, WorksController, RecordingsController, ReleasesController, RightsController, ContributionsController, LicensesController, ImportsController,
    AuthController,
    AuditController,
    OrganizationsController,
    MembershipsController,
    PlatformController,
    DashboardController,
    SearchController,
    HealthController,
    NotificationsController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    AuditService,
    AuthService,
  ],
})
export class AppModule {}
