import { BadRequestException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { DocumentCategory, OwnerType } from '@prisma/client';
import type { Tx } from '../prisma/prisma.service.js';
import { StorageService } from './storage.service.js';
import { ALLOWED_MIME, scan, sniff } from './scanner.js';

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const OWNER_TABLE: Partial<Record<OwnerType, (tx: Tx) => { count: (a: { where: object }) => Promise<number> }>> = {
  WORK: (tx) => tx.musicalWork,
  RECORDING: (tx) => tx.recording,
  RELEASE: (tx) => tx.release,
  PARTY: (tx) => tx.party,
  AGREEMENT: (tx) => tx.agreement,
  LICENSE: (tx) => tx.license,
  RIGHTS_CLAIM: (tx) => tx.rightsClaim,
  REGISTRATION: (tx) => tx.registration,
  DISPUTE: (tx) => tx.dispute,
};

export function safeFilename(name: string) {
  const base = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/^\.+/, '').trim().slice(0, 180);
  return base || 'file';
}

@Injectable()
export class DocumentsService {
  constructor(readonly storage: StorageService) {}

  async assertOwner(tx: Tx, orgId: string, ownerType: OwnerType, ownerId: string) {
    if (ownerType === 'ORGANIZATION') {
      if (ownerId !== orgId) throw new BadRequestException('Organization documents must belong to your organization');
      return;
    }
    const t = OWNER_TABLE[ownerType];
    if (!t) throw new BadRequestException(`Documents cannot be attached to ${ownerType}`);
    if (!(await t(tx).count({ where: { id: ownerId, organizationId: orgId } }))) throw new NotFoundException(`${ownerType.toLowerCase()} not found`);
  }

  async assertQuota(tx: Tx, orgId: string, extra: number) {
    const org = await tx.organization.findUnique({ where: { id: orgId }, select: { plan: { select: { maxStorageBytes: true } } } });
    const max = org?.plan?.maxStorageBytes;
    if (!max) return;
    const used = await tx.documentVersion.aggregate({ where: { organizationId: orgId }, _sum: { sizeBytes: true } });
    if ((used._sum.sizeBytes ?? 0n) + BigInt(extra) > max) throw new BadRequestException('Storage quota for your plan is full. Upgrade or remove drafts.');
  }

  /** Validate real file type, run malware scan and store encrypted. Infected files are never stored. */
  async ingest(orgId: string, buf: Buffer, filename: string) {
    if (!buf.length) throw new BadRequestException('The file is empty');
    if (buf.length > MAX_UPLOAD_BYTES) throw new BadRequestException('Files are limited to 25 MB');
    const ext = sniff(buf);
    if (!ext) throw new UnprocessableEntityException('Unsupported file type. Allowed: PDF, PNG, JPG, WEBP, DOCX, XLSX, TXT, MP3, WAV.');
    const result = await scan(buf);
    if (result.status === 'INFECTED') throw new UnprocessableEntityException('Upload blocked: the malware scanner flagged this file.');
    const stored = await this.storage.put(orgId, buf);
    let name = safeFilename(filename);
    if (!name.toLowerCase().endsWith(`.${ext}`) && !(ext === 'jpg' && /\.jpeg$/i.test(name))) name = `${name}.${ext}`;
    return { ...stored, mime: ALLOWED_MIME[ext], filename: name, scanStatus: result.status };
  }

  async addVersion(
    tx: Tx,
    orgId: string,
    documentId: string,
    file: { storageKey: string; sha256: string; sizeBytes: number; mime: string; filename: string; scanStatus: 'CLEAN' | 'SKIPPED' | 'FAILED' | 'INFECTED' },
    opts: { isGenerated?: boolean; userId?: string | null } = {},
  ) {
    const last = await tx.documentVersion.findFirst({ where: { documentId, organizationId: orgId }, orderBy: { versionNo: 'desc' }, select: { versionNo: true } });
    const v = await tx.documentVersion.create({
      data: {
        organizationId: orgId, documentId, versionNo: (last?.versionNo ?? 0) + 1, storageKey: file.storageKey, filename: file.filename,
        mime: file.mime, sizeBytes: BigInt(file.sizeBytes), sha256: file.sha256, scanStatus: file.scanStatus,
        isGenerated: opts.isGenerated ?? false, uploadedById: opts.userId ?? null,
      },
    });
    await tx.document.update({ where: { id: documentId }, data: { currentVersionId: v.id } });
    return v;
  }

  async createDocument(
    tx: Tx,
    orgId: string,
    d: { ownerType: OwnerType; ownerId: string; title: string; category: DocumentCategory; status?: 'DRAFT' | 'UNDER_REVIEW'; notes?: string | null; signatoryName?: string | null; signedDate?: Date | null; expiresAt?: Date | null; userId?: string | null },
    file: Parameters<DocumentsService['addVersion']>[3],
    isGenerated = false,
  ) {
    const doc = await tx.document.create({
      data: {
        organizationId: orgId, ownerType: d.ownerType, ownerId: d.ownerId, title: d.title, category: d.category, status: d.status ?? 'DRAFT',
        notes: d.notes ?? null, signatoryName: d.signatoryName ?? null, signedDate: d.signedDate ?? null, expiresAt: d.expiresAt ?? null, uploadedById: d.userId ?? null,
      },
    });
    const v = await this.addVersion(tx, orgId, doc.id, file, { isGenerated, userId: d.userId });
    return { ...doc, currentVersionId: v.id };
  }
}

export const publicVersion = <T extends { sizeBytes: bigint; storageKey: string }>(v: T) => {
  const { storageKey: _k, ...rest } = v;
  return { ...rest, sizeBytes: Number(v.sizeBytes) };
};
