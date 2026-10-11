import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SubscriptionStatus } from '@prisma/client';

export function verifySignature(raw: Buffer, signature: string | undefined, secret: string) {
  if (!signature) return false;
  const expected = createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature.trim());
  return a.length === b.length && timingSafeEqual(a, b);
}

export type BillingEvent = {
  type: string;
  orgId?: string;
  subscriptionRef?: string;
  planCode?: string;
  status?: SubscriptionStatus;
  periodEnd?: Date;
  invoice?: { ref: string; amountPaise: number; taxPaise: number; currency: string; periodStart?: Date; periodEnd?: Date };
};

type Entity = { id?: string; notes?: Record<string, string>; current_start?: number; current_end?: number; amount?: number; tax?: number; currency?: string };
const STATUS: Record<string, SubscriptionStatus> = {
  'subscription.activated': 'ACTIVE',
  'subscription.charged': 'ACTIVE',
  'subscription.resumed': 'ACTIVE',
  'subscription.pending': 'PAST_DUE',
  'subscription.halted': 'PAST_DUE',
  'payment.failed': 'PAST_DUE',
  'subscription.cancelled': 'CANCELED',
  'subscription.completed': 'CANCELED',
};
const ts = (s?: number) => (s ? new Date(s * 1000) : undefined);

/** Normalises a Razorpay webhook body. Unknown events come back without a status and are acknowledged as ignored. */
export function parseRazorpay(body: unknown): BillingEvent {
  const b = (body ?? {}) as { event?: string; payload?: { subscription?: { entity?: Entity }; payment?: { entity?: Entity } } };
  const type = String(b.event ?? 'unknown');
  const sub = b.payload?.subscription?.entity;
  const pay = b.payload?.payment?.entity;
  const notes: Record<string, string> = { ...pay?.notes, ...sub?.notes };
  const ev: BillingEvent = { type, orgId: notes.organizationId, subscriptionRef: sub?.id, planCode: notes.planCode, status: STATUS[type], periodEnd: ts(sub?.current_end) };
  if (type === 'subscription.charged' && pay?.id && typeof pay.amount === 'number') {
    ev.invoice = { ref: pay.id, amountPaise: pay.amount, taxPaise: pay.tax ?? 0, currency: (pay.currency ?? 'INR').toUpperCase(), periodStart: ts(sub?.current_start), periodEnd: ts(sub?.current_end) };
  }
  return ev;
}
