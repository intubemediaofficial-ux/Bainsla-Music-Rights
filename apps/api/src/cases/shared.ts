import { IsIn, IsString } from 'class-validator';
import { Tx } from '../prisma/prisma.service.js';
import { found } from '../catalog/shared.js';

export class AssetRef {
  @IsIn(['WORK', 'RECORDING']) assetType!: 'WORK' | 'RECORDING';
  @IsString() assetId!: string;
}

export const assetInclude = {
  work: { select: { id: true, title: true, iswc: true } },
  recording: { select: { id: true, title: true, isrc: true, version: true } },
} as const;

/** Resolve a work/recording inside the tenant and return the FK columns to store. */
export async function resolveAsset(tx: Tx, orgId: string, a: AssetRef) {
  if (a.assetType === 'WORK') {
    found(await tx.musicalWork.findFirst({ where: { id: a.assetId, organizationId: orgId }, select: { id: true } }), 'Musical work');
    return { assetType: 'WORK' as const, workId: a.assetId, recordingId: null };
  }
  found(await tx.recording.findFirst({ where: { id: a.assetId, organizationId: orgId }, select: { id: true } }), 'Recording');
  return { assetType: 'RECORDING' as const, workId: null, recordingId: a.assetId };
}

export async function ownerDocs(tx: Tx, orgId: string, ownerType: 'REGISTRATION' | 'DISPUTE' | 'VERIFICATION_PACKAGE', ownerId: string) {
  return tx.document.findMany({
    where: { organizationId: orgId, ownerType, ownerId },
    orderBy: { createdAt: 'desc' },
    include: { versions: { orderBy: { versionNo: 'desc' }, take: 1 } },
  });
}

export async function history(tx: Tx, orgId: string, entityType: string, entityId: string) {
  return tx.auditLog.findMany({
    where: { organizationId: orgId, entityType, entityId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, action: true, actorEmail: true, createdAt: true },
  });
}
