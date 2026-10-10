import { BadRequestException } from '@nestjs/common';
import type { UsageMetric } from '@prisma/client';
import type { Tx } from '../prisma/prisma.service.js';

export const monthStart = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

export function meter(tx: Tx, orgId: string, metric: UsageMetric, quantity: number | bigint = 1, refId?: string) {
  return tx.usageRecord.create({ data: { organizationId: orgId, metric, quantity: BigInt(quantity), refId: refId ?? null } });
}

export async function usage(tx: Tx, orgId: string) {
  const since = monthStart();
  const sum = (metric: UsageMetric) =>
    tx.usageRecord.aggregate({ where: { organizationId: orgId, metric, createdAt: { gte: since } }, _sum: { quantity: true } }).then((r) => Number(r._sum.quantity ?? 0n));
  const [recordings, users, storage, pdfJobsThisMonth, exportsThisMonth] = await Promise.all([
    tx.recording.count({ where: { organizationId: orgId, archivedAt: null } }),
    tx.membership.count({ where: { organizationId: orgId, status: { not: 'DISABLED' } } }),
    tx.documentVersion.aggregate({ where: { organizationId: orgId }, _sum: { sizeBytes: true } }),
    sum('PDF_JOBS'),
    sum('EXPORTS'),
  ]);
  return { recordings, users, storageBytes: Number(storage._sum.sizeBytes ?? 0n), pdfJobsThisMonth, exportsThisMonth };
}

export type Limits = { maxRecordings: number | null; maxUsers: number | null; maxStorageBytes: bigint | null };

/** Reasons the given usage does not fit a plan's limits (empty = fits). */
export function overLimits(u: { recordings: number; users: number; storageBytes: number }, p: Limits) {
  const out: string[] = [];
  if (p.maxRecordings != null && u.recordings > p.maxRecordings) out.push(`${u.recordings} recordings (plan allows ${p.maxRecordings})`);
  if (p.maxUsers != null && u.users > p.maxUsers) out.push(`${u.users} users (plan allows ${p.maxUsers})`);
  if (p.maxStorageBytes != null && BigInt(u.storageBytes) > p.maxStorageBytes) out.push(`${(u.storageBytes / 1e9).toFixed(2)} GB storage (plan allows ${(Number(p.maxStorageBytes) / 1e9).toFixed(0)} GB)`);
  return out;
}

/** Throws when adding `adding` recordings would exceed the plan. With adding=0 it verifies the current total. */
export async function assertRecordingQuota(tx: Tx, orgId: string, adding: number) {
  const org = await tx.organization.findUnique({ where: { id: orgId }, select: { plan: { select: { maxRecordings: true } } } });
  const max = org?.plan?.maxRecordings;
  if (!max) return;
  const n = await tx.recording.count({ where: { organizationId: orgId, archivedAt: null } });
  if (n + adding > max) throw new BadRequestException(`Plan limit reached: ${max} recordings (this would make ${n + adding}). Upgrade to add more.`);
}
