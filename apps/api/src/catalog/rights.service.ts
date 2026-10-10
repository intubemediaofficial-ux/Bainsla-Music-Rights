import type { AssetType } from '@prisma/client';
import type { Tx } from '../prisma/prisma.service.js';
import { dec } from './shared.js';
import { validateClaims, type ClaimLike } from './validation.js';

export const assetWhere = (assetType: AssetType, assetId: string) =>
  assetType === 'WORK' ? { workId: assetId } : { recordingId: assetId };

export async function loadClaimLikes(tx: Tx, orgId: string, assetType: AssetType, assetId: string, exceptId?: string): Promise<ClaimLike[]> {
  const rows = await tx.rightsClaim.findMany({
    where: { organizationId: orgId, assetType, ...assetWhere(assetType, assetId), ...(exceptId ? { id: { not: exceptId } } : {}) },
  });
  return rows.map((r) => ({ ...r, sharePercent: dec(r.sharePercent) }));
}

/** Claims + transfers + share validation for one work or recording. */
export async function assetRights(tx: Tx, orgId: string, assetType: AssetType, assetId: string) {
  const where = { organizationId: orgId, assetType, ...assetWhere(assetType, assetId) };
  const [claims, transfers] = await Promise.all([
    tx.rightsClaim.findMany({ where, include: { party: { select: { id: true, legalName: true, stageName: true } } }, orderBy: [{ rightType: 'asc' }, { sharePercent: 'desc' }] }),
    tx.rightsTransfer.findMany({
      where,
      include: { fromParty: { select: { id: true, legalName: true } }, toParty: { select: { id: true, legalName: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  const validation = validateClaims(claims.map((c) => ({ ...c, sharePercent: dec(c.sharePercent) })));
  return { rightsClaims: claims, transfers, validation, hasConflicts: validation.some((v) => v.issues.some((i) => i.kind === 'OVER_100')) };
}
