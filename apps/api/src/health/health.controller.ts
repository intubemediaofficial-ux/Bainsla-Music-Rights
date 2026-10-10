import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service.js';
import { Public } from '../auth/context.js';
import { access, constants } from 'node:fs/promises';
import { config } from '../config.js';
import { RenderService } from '../documents/render.service.js';

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly render: RenderService,
  ) {}

  /** Readiness for monitors: DB, private storage writable, PDF renderer, scanner config. 503 if DB/storage fail. */
  @Public()
  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response) {
    const checks: Record<string, string> = {};
    try { await this.prisma.$queryRaw`SELECT 1`; checks.db = 'ok'; } catch { checks.db = 'fail'; }
    try { await access(config.storageDir, constants.W_OK); checks.storage = 'ok'; } catch { checks.storage = 'fail'; }
    checks.pdf = this.render.executable() ? 'ok' : 'missing';
    checks.malwareScanner = process.env.CLAMD_HOST ? 'configured' : 'not-configured';
    checks.billingGateway = process.env.RAZORPAY_WEBHOOK_SECRET ? 'configured' : 'not-configured';
    const ok = checks.db === 'ok' && checks.storage === 'ok';
    if (!ok) res.status(503);
    return { status: ok ? 'ok' : 'fail', checks, uptimeSec: Math.round(process.uptime()), time: new Date().toISOString() };
  }

  @Public()
  @Get()
  async health() {
    const started = Date.now();
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', db: 'ok', dbLatencyMs: Date.now() - started, version: process.env.APP_VERSION ?? 'dev', time: new Date().toISOString() };
  }
}
