import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService, type Tx } from '../prisma/prisma.service.js';
import { usage } from '../billing/usage.js';

type N = { type: string; title: string; body?: string; entityType?: string; entityId?: string; dedupeKey: string };
const day = 86400_000;
const d10 = (d: Date) => d.toISOString().slice(0, 10);
const OPEN_DISPUTE = ['OPEN', 'EVIDENCE_SUBMITTED', 'AWAITING_RESPONSE', 'ESCALATED'] as const;
const OPEN_REG = ['PLANNED', 'FILED', 'UNDER_EXAMINATION', 'OBJECTION', 'HEARING'] as const;

/** Generates deduplicated alerts: licence expiry, conflicts, unsigned agreements, reviews, claim/registration deadlines, quota, trial end. */
@Injectable()
export class NotificationsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(NotificationsService.name);
  private timer?: NodeJS.Timeout;
  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test' || process.env.NOTIFY_SCAN_DISABLED === 'true') return;
    const every = Number(process.env.NOTIFY_SCAN_MINUTES ?? 60) * 60_000;
    setTimeout(() => void this.scanAll(), 30_000).unref();
    this.timer = setInterval(() => void this.scanAll(), every);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async scanAll() {
    try {
      const orgs = await this.prisma.system((tx) => tx.organization.findMany({ where: { status: { in: ['ACTIVE', 'TRIAL'] } }, select: { id: true } }));
      let created = 0;
      for (const o of orgs) created += await this.prisma.tenant(o.id, (tx) => this.scan(tx, o.id));
      this.log.log(`notification scan: ${orgs.length} orgs, ${created} new`);
      return created;
    } catch (e) {
      this.log.error(`notification scan failed: ${e instanceof Error ? e.message : String(e)}`);
      return 0;
    }
  }

  async scan(tx: Tx, orgId: string) {
    const now = new Date();
    const [licenses, conflicts, unsigned, reviews, disputes, regs, org, sub, used] = await Promise.all([
      tx.license.findMany({ where: { organizationId: orgId, endDate: { gte: now, lte: new Date(+now + 30 * day) } }, select: { id: true, licenseeName: true, endDate: true } }),
      tx.rightsClaim.findMany({ where: { organizationId: orgId, status: 'DISPUTED' }, select: { id: true, work: { select: { title: true } }, recording: { select: { title: true } } }, take: 200 }),
      tx.agreement.findMany({ where: { organizationId: orgId, status: 'SENT_FOR_SIGNATURE', updatedAt: { lte: new Date(+now - 7 * day) } }, select: { id: true, title: true } }),
      tx.document.findMany({ where: { organizationId: orgId, status: 'UNDER_REVIEW' }, select: { id: true, title: true }, take: 200 }),
      tx.dispute.findMany({ where: { organizationId: orgId, status: { in: [...OPEN_DISPUTE] }, deadline: { not: null, lte: new Date(+now + 7 * day) } }, select: { id: true, counterparty: true, platform: true, deadline: true } }),
      tx.registration.findMany({ where: { organizationId: orgId, status: { in: [...OPEN_REG] }, nextDeadline: { not: null, lte: new Date(+now + 7 * day) } }, select: { id: true, registry: true, nextDeadline: true } }),
      tx.organization.findUnique({ where: { id: orgId }, select: { plan: true } }),
      tx.subscription.findUnique({ where: { organizationId: orgId } }),
      usage(tx, orgId),
    ]);
    const out: N[] = [];
    for (const l of licenses) out.push({ type: 'LICENSE_EXPIRY', title: `Licence to ${l.licenseeName} expires ${d10(l.endDate!)}`, entityType: 'license', entityId: l.id, dedupeKey: `license:${l.id}:${d10(l.endDate!)}` });
    for (const c of conflicts) out.push({ type: 'CONFLICT', title: `Unresolved ownership conflict on “${c.work?.title ?? c.recording?.title ?? 'asset'}”`, body: 'Shares exceed 100% or claims overlap. Review in Rights → Conflicts.', entityType: 'rights_claim', entityId: c.id, dedupeKey: `conflict:${c.id}` });
    for (const a of unsigned) out.push({ type: 'UNSIGNED_AGREEMENT', title: `“${a.title}” is still unsigned`, body: 'Sent for signature over 7 days ago.', entityType: 'agreement', entityId: a.id, dedupeKey: `unsigned:${a.id}` });
    for (const r of reviews) out.push({ type: 'REVIEW', title: `Review needed: ${r.title}`, entityType: 'document', entityId: r.id, dedupeKey: `review:${r.id}` });
    for (const d of disputes) {
      const late = d.deadline! < now;
      out.push({ type: 'CLAIM_DEADLINE', title: `${late ? 'Overdue' : 'Deadline'}: ${d.platform} dispute with ${d.counterparty} (${d10(d.deadline!)})`, entityType: 'dispute', entityId: d.id, dedupeKey: `dispute:${d.id}:${d10(d.deadline!)}${late ? ':late' : ''}` });
    }
    for (const r of regs) out.push({ type: 'REGISTRATION_DEADLINE', title: `${r.registry} deadline ${d10(r.nextDeadline!)}`, entityType: 'registration', entityId: r.id, dedupeKey: `registration:${r.id}:${d10(r.nextDeadline!)}` });
    const p = org?.plan;
    const month = d10(now).slice(0, 7);
    const quota = (label: string, used: number, max: number | null | undefined) => {
      if (max && used / max >= 0.9) out.push({ type: 'QUOTA', title: `${label}: ${Math.round((used / max) * 100)}% of your plan used`, body: 'Upgrade in Billing & plan to avoid blocked uploads.', entityType: 'billing', dedupeKey: `quota:${label}:${month}` });
    };
    quota('Recordings', used.recordings, p?.maxRecordings);
    quota('Users', used.users, p?.maxUsers);
    quota('Storage', used.storageBytes, p?.maxStorageBytes != null ? Number(p.maxStorageBytes) : null);
    if (sub?.status === 'TRIALING' && sub.trialEndsAt && sub.trialEndsAt > now && sub.trialEndsAt < new Date(+now + 3 * day)) {
      out.push({ type: 'BILLING', title: `Trial ends ${d10(sub.trialEndsAt)}`, body: 'Choose a plan in Billing & plan.', entityType: 'billing', dedupeKey: `trial:${d10(sub.trialEndsAt)}` });
    }
    if (!out.length) return 0;
    const r = await tx.notification.createMany({ data: out.map((n) => ({ ...n, organizationId: orgId })), skipDuplicates: true });
    return r.count;
  }
}
