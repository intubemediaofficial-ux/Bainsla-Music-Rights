import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service.js';
import { Auth, type OrgContext, RequirePermission } from '../auth/context.js';

@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('summary')
  @RequirePermission('catalog.read')
  summary(@Auth() auth: OrgContext) {
    const org = auth.orgId;
    const now = new Date();
    const soon = new Date(now.getTime() + 60 * 86400_000);
    return this.prisma.tenant(org, async (tx) => {
      const [
        works, recordings, releases, parties,
        recordingsWithoutExecutedDocs, reviewedClaims, documentedClaims, disputedClaims, openDisputes,
        expiringLicenses, expiringAgreements, pendingRegistrations, registered, unsignedAgreements,
      ] = await Promise.all([
        tx.musicalWork.count({ where: { organizationId: org, archivedAt: null } }),
        tx.recording.count({ where: { organizationId: org, archivedAt: null } }),
        tx.release.count({ where: { organizationId: org, archivedAt: null } }),
        tx.party.count({ where: { organizationId: org, archivedAt: null } }),
        tx.$queryRaw<{ n: bigint }[]>`
          SELECT count(*)::bigint AS n FROM recordings r
          WHERE r."organizationId" = ${org} AND r."archivedAt" IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM documents d WHERE d."organizationId" = ${org} AND d.status = 'EXECUTED'
            AND ((d."ownerType" = 'RECORDING' AND d."ownerId" = r.id) OR (d."ownerType" = 'WORK' AND d."ownerId" = r."workId"))
          ) AND NOT EXISTS (
            SELECT 1 FROM agreement_assets aa JOIN agreements a ON a.id = aa."agreementId"
            WHERE aa."organizationId" = ${org} AND a.status = 'EXECUTED' AND (aa."recordingId" = r.id OR aa."workId" = r."workId")
          )`,
        tx.rightsClaim.count({ where: { organizationId: org, status: 'REVIEWED' } }),
        tx.rightsClaim.count({ where: { organizationId: org, status: 'DOCUMENTED' } }),
        tx.rightsClaim.count({ where: { organizationId: org, status: 'DISPUTED' } }),
        tx.dispute.count({ where: { organizationId: org, status: { in: ['OPEN', 'EVIDENCE_SUBMITTED', 'AWAITING_RESPONSE', 'ESCALATED'] } } }),
        tx.license.findMany({
          where: { organizationId: org, endDate: { gte: now, lte: soon } },
          select: { id: true, licenseeName: true, endDate: true, work: { select: { title: true } }, recording: { select: { title: true } } },
          orderBy: { endDate: 'asc' }, take: 10,
        }),
        tx.agreement.findMany({
          where: { organizationId: org, expiryDate: { gte: now, lte: soon } },
          select: { id: true, title: true, expiryDate: true }, orderBy: { expiryDate: 'asc' }, take: 10,
        }),
        tx.registration.count({ where: { organizationId: org, status: { in: ['PLANNED', 'FILED', 'UNDER_EXAMINATION', 'OBJECTION', 'HEARING'] } } }),
        tx.registration.count({ where: { organizationId: org, status: 'REGISTERED' } }),
        tx.agreement.count({ where: { organizationId: org, status: { in: ['DRAFT', 'UNDER_REVIEW', 'SENT_FOR_SIGNATURE'] } } }),
      ]);
      const missingEvidence = await tx.$queryRaw<{ id: string; title: string; isrc: string | null }[]>`
        SELECT r.id, r.title, r.isrc FROM recordings r
        WHERE r."organizationId" = ${org} AND r."archivedAt" IS NULL
        AND NOT EXISTS (SELECT 1 FROM documents d WHERE d."organizationId" = ${org}
          AND ((d."ownerType" = 'RECORDING' AND d."ownerId" = r.id) OR (d."ownerType" = 'WORK' AND d."ownerId" = r."workId")))
        AND NOT EXISTS (SELECT 1 FROM agreement_assets aa WHERE aa."organizationId" = ${org} AND (aa."recordingId" = r.id OR aa."workId" = r."workId"))
        ORDER BY r."createdAt" DESC LIMIT 8`;
      const conflicts = await tx.rightsClaim.findMany({
        where: { organizationId: org, status: 'DISPUTED' },
        select: { id: true, rightType: true, sharePercent: true, work: { select: { title: true } }, recording: { select: { title: true } }, party: { select: { legalName: true } } },
        take: 8, orderBy: { updatedAt: 'desc' },
      });
      const activity = await tx.auditLog.findMany({
        where: { organizationId: org },
        orderBy: { createdAt: 'desc' },
        take: 15,
        select: { id: true, action: true, entityType: true, entityId: true, actorEmail: true, createdAt: true },
      });
      return {
        kpis: {
          works, recordings, releases, parties,
          incompleteDocumentation: Number(recordingsWithoutExecutedDocs[0]?.n ?? 0),
          reviewedClaims, documentedClaims, conflicts: disputedClaims, openDisputes,
          expiringAgreements: expiringAgreements.length + expiringLicenses.length,
          pendingRegistrations, registered, unsignedAgreements,
        },
        missingEvidence,
        conflicts,
        expiring: [
          ...expiringLicenses.map((l) => ({ kind: 'license', id: l.id, title: `${l.work?.title ?? l.recording?.title ?? 'Asset'} → ${l.licenseeName}`, date: l.endDate })),
          ...expiringAgreements.map((a) => ({ kind: 'agreement', id: a.id, title: a.title, date: a.expiryDate })),
        ],
        activity,
      };
    });
  }
}
