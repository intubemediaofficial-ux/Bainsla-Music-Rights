import { BadRequestException, Body, Controller, Get, Headers, HttpCode, NotFoundException, Param, Post, Req, Res, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, MaxLength } from 'class-validator';
import type { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Auth, Public, RequirePermission } from '../auth/context.js';
import type { OrgContext } from '../auth/context.js';
import { sha256 } from '../common/crypto.js';
import { esc, page, RenderService } from '../documents/render.service.js';
import { contentDisposition } from '../cases/files.js';
import { BillingService } from './billing.service.js';
import { verifySignature } from './gateway.js';
import { overLimits, usage } from './usage.js';

class ChangePlanDto {
  @IsString() @MaxLength(40) planCode!: string;
}

const planOut = <T extends { maxStorageBytes: bigint | null }>(p: T) => ({ ...p, maxStorageBytes: p.maxStorageBytes?.toString() ?? null });
const inr = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
export const gatewayConfigured = () => !!process.env.RAZORPAY_WEBHOOK_SECRET;

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly render: RenderService,
  ) {}

  @Get()
  @RequirePermission('billing.manage')
  overview(@Auth() auth: OrgContext) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const [org, sub, used, invoices, plans] = await Promise.all([
        tx.organization.findUniqueOrThrow({ where: { id: auth.orgId }, include: { plan: true } }),
        tx.subscription.findUnique({ where: { organizationId: auth.orgId } }),
        usage(tx, auth.orgId),
        tx.invoice.findMany({ where: { organizationId: auth.orgId }, orderBy: { issuedAt: 'desc' }, take: 24 }),
        tx.plan.findMany({ where: { isActive: true, isPublic: true }, orderBy: { sortOrder: 'asc' } }),
      ]);
      return {
        plan: org.plan ? planOut(org.plan) : null,
        subscription: sub,
        usage: used,
        invoices,
        plans: plans.map(planOut),
        gatewayConfigured: gatewayConfigured(),
      };
    });
  }

  @Post('plan')
  @RequirePermission('billing.manage')
  changePlan(@Auth() auth: OrgContext, @Body() dto: ChangePlanDto) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const plan = await tx.plan.findUnique({ where: { code: dto.planCode } });
      if (!plan || !plan.isActive || !plan.isPublic) throw new BadRequestException('Unknown plan');
      if (plan.priceInrPaise == null) throw new BadRequestException(`${plan.name} is custom-quoted. Contact us and the platform team will set it up.`);
      const org = await tx.organization.findUniqueOrThrow({ where: { id: auth.orgId } });
      if (org.planId === plan.id) throw new BadRequestException(`You are already on ${plan.name}`);
      const over = overLimits(await usage(tx, auth.orgId), plan);
      if (over.length) throw new BadRequestException(`Your current usage does not fit ${plan.name}: ${over.join(', ')}.`);
      const sub = await tx.subscription.findUnique({ where: { organizationId: auth.orgId } });
      const keepActive = sub?.status === 'ACTIVE' && plan.priceInrPaise === 0;
      const data = keepActive
        ? { planId: plan.id }
        : { planId: plan.id, status: plan.priceInrPaise === 0 ? ('ACTIVE' as const) : ('TRIALING' as const), trialEndsAt: plan.priceInrPaise === 0 ? null : (sub?.trialEndsAt && sub.trialEndsAt > new Date() ? sub.trialEndsAt : new Date(Date.now() + 14 * 86400_000)) };
      const saved = await tx.subscription.upsert({ where: { organizationId: auth.orgId }, update: data, create: { organizationId: auth.orgId, ...data } });
      await tx.organization.update({ where: { id: auth.orgId }, data: { planId: plan.id } });
      await this.audit.log(tx, auth, { action: 'billing.plan_changed', entityType: 'subscription', entityId: saved.id, before: { planId: org.planId }, after: { plan: plan.code, status: saved.status } });
      return { ok: true, subscription: saved, plan: planOut(plan) };
    });
  }

  @Get('invoices/:id/pdf')
  @RequirePermission('billing.manage')
  async invoicePdf(@Auth() auth: OrgContext, @Param('id') id: string, @Res() res: Response) {
    const { inv, org } = await this.prisma.tenant(auth.orgId, async (tx) => ({
      inv: await tx.invoice.findFirst({ where: { id, organizationId: auth.orgId } }),
      org: await tx.organization.findUniqueOrThrow({ where: { id: auth.orgId } }),
    }));
    if (!inv) throw new NotFoundException('Invoice not found');
    const period = inv.periodStart ? `${inv.periodStart.toISOString().slice(0, 10)} → ${inv.periodEnd?.toISOString().slice(0, 10) ?? ''}` : '—';
    const html = page(`Invoice ${inv.number}`, `<h1>Invoice ${esc(inv.number)}</h1>
      <p><b>Billed to:</b> ${esc(org.legalName)}${org.gstin ? ` · GSTIN ${esc(org.gstin)}` : ''}<br/>${esc(org.address ?? '')}</p>
      <table><tr><th>Issued</th><td>${inv.issuedAt.toISOString().slice(0, 10)}</td></tr><tr><th>Period</th><td>${period}</td></tr>
      <tr><th>Status</th><td>${esc(inv.status)}</td></tr><tr><th>Gateway reference</th><td>${esc(inv.gatewayRef ?? '—')}</td></tr>
      <tr><th>Subscription</th><td>${inr(inv.amountPaise - inv.taxPaise)}</td></tr><tr><th>Tax</th><td>${inr(inv.taxPaise)}</td></tr>
      <tr><th>Total (${esc(inv.currency)})</th><td><b>${inr(inv.amountPaise)}</b></td></tr></table>
      <p class="muted">Amounts as reported by the payment gateway. Tax/GST configuration must be confirmed by the business before production use.</p>`);
    const pdf = this.render.executable() ? await this.render.pdf(html, `Invoice ${inv.number}`) : null;
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Type', pdf ? 'application/pdf' : 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', contentDisposition(`${inv.number}.${pdf ? 'pdf' : 'html'}`));
    res.send(pdf ?? Buffer.from(html));
  }
}

@ApiTags('billing')
@Controller('billing/webhooks')
export class BillingWebhookController {
  constructor(private readonly billing: BillingService) {}

  /** Razorpay webhook. Signature = HMAC-SHA256(raw body, RAZORPAY_WEBHOOK_SECRET). Idempotent per x-razorpay-event-id. */
  @Public()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post(':gateway')
  @HttpCode(200)
  receive(@Param('gateway') gateway: string, @Req() req: RawBodyRequest<Request>, @Headers('x-razorpay-signature') sig?: string, @Headers('x-razorpay-event-id') eventId?: string) {
    if (gateway !== 'razorpay') throw new NotFoundException('Unknown gateway');
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) throw new ServiceUnavailableException('Billing gateway is not configured');
    const raw = req.rawBody;
    if (!raw?.length) throw new BadRequestException('Empty body');
    if (!verifySignature(raw, sig, secret)) throw new UnauthorizedException('Invalid signature');
    let body: unknown;
    try {
      body = JSON.parse(raw.toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid JSON');
    }
    return this.billing.receive(gateway, eventId?.slice(0, 120) || sha256(raw.toString('utf8')), body);
  }
}
