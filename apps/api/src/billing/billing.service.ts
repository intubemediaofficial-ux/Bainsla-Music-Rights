import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { parseRazorpay } from './gateway.js';

const STATUS_NOTE: Record<string, [string, string]> = {
  ACTIVE: ['Payment received', 'Your subscription is active.'],
  PAST_DUE: ['Payment failed', 'Your last payment did not go through. Update the payment method to avoid interruption.'],
  CANCELED: ['Subscription cancelled', 'Your subscription has been cancelled.'],
};

@Injectable()
export class BillingService {
  private readonly log = new Logger(BillingService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Stores the event once (gateway+eventId unique) and applies it. Re-deliveries of a processed event are no-ops. */
  async receive(gateway: string, eventId: string, body: unknown) {
    const type = String((body as { event?: string })?.event ?? 'unknown');
    const ev = await this.prisma.system((tx) =>
      tx.webhookEvent.upsert({
        where: { gateway_eventId: { gateway, eventId } },
        create: { gateway, eventId, type, payload: body as Prisma.InputJsonValue },
        update: {},
      }),
    );
    if (ev.processedAt) return { ok: true, duplicate: true };
    return this.apply(ev.id);
  }

  /** Applies a stored event. On failure the error is kept and 500 is returned so the gateway retries. */
  async apply(id: string) {
    try {
      const outcome = await this.prisma.system(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
        const ev = await tx.webhookEvent.findUniqueOrThrow({ where: { id } });
        if (ev.processedAt) return 'duplicate';
        const n = parseRazorpay(ev.payload);
        let result = 'ignored';
        if (n.status) {
          const sub = n.orgId
            ? await tx.subscription.findUnique({ where: { organizationId: n.orgId } })
            : n.subscriptionRef
              ? await tx.subscription.findFirst({ where: { gateway: ev.gateway, gatewayRef: n.subscriptionRef } })
              : null;
          if (!sub) throw new Error(`No subscription matches ${n.orgId ? `organization ${n.orgId}` : `gateway ref ${n.subscriptionRef ?? '?'}`}`);
          const plan = n.planCode ? await tx.plan.findUnique({ where: { code: n.planCode } }) : null;
          await tx.subscription.update({
            where: { id: sub.id },
            data: { status: n.status, gateway: ev.gateway, gatewayRef: n.subscriptionRef ?? sub.gatewayRef, currentPeriodEnd: n.periodEnd ?? sub.currentPeriodEnd, ...(plan ? { planId: plan.id } : {}) },
          });
          if (plan) await tx.organization.update({ where: { id: sub.organizationId }, data: { planId: plan.id } });
          if (n.invoice && !(await tx.invoice.findFirst({ where: { organizationId: sub.organizationId, gatewayRef: n.invoice.ref } }))) {
            const d = new Date();
            const count = await tx.invoice.count({ where: { organizationId: sub.organizationId } });
            await tx.invoice.create({
              data: {
                organizationId: sub.organizationId,
                number: `MRC-${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(count + 1).padStart(4, '0')}`,
                amountPaise: n.invoice.amountPaise, taxPaise: n.invoice.taxPaise, currency: n.invoice.currency,
                periodStart: n.invoice.periodStart, periodEnd: n.invoice.periodEnd, gatewayRef: n.invoice.ref, status: 'PAID',
              },
            });
          }
          if (sub.status !== n.status || n.invoice) {
            const [title, body] = STATUS_NOTE[n.status];
            await tx.notification.upsert({
              where: { organizationId_dedupeKey: { organizationId: sub.organizationId, dedupeKey: `billing:${ev.id}` } },
              create: { organizationId: sub.organizationId, type: 'BILLING', title, body, entityType: 'billing', dedupeKey: `billing:${ev.id}` },
              update: {},
            });
          }
          await this.audit.log(tx, null, { orgId: sub.organizationId, action: 'billing.webhook', entityType: 'subscription', entityId: sub.id, before: { status: sub.status }, after: { status: n.status, event: n.type, gateway: ev.gateway } });
          result = n.status;
        }
        await tx.webhookEvent.update({ where: { id }, data: { processedAt: new Date(), attempts: { increment: 1 }, error: null } });
        return result;
      });
      return { ok: true, outcome };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`webhook ${id} failed: ${msg}`);
      await this.prisma.system((tx) => tx.webhookEvent.update({ where: { id }, data: { attempts: { increment: 1 }, error: msg.slice(0, 500) } }));
      throw new InternalServerErrorException('Webhook could not be applied; it will be retried');
    }
  }
}
