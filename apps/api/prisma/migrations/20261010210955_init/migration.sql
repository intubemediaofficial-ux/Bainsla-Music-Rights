-- CreateEnum
CREATE TYPE "OrgStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INVITED', 'DISABLED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'RIGHTS_MANAGER', 'LEGAL_REVIEWER', 'CATALOG_EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "PartyType" AS ENUM ('ARTIST', 'SINGER', 'WRITER', 'LYRICIST', 'COMPOSER', 'PRODUCER', 'STUDIO', 'PUBLISHER', 'LABEL', 'DISTRIBUTOR', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('WORK', 'RECORDING', 'RELEASE');

-- CreateEnum
CREATE TYPE "ReleaseType" AS ENUM ('SINGLE', 'EP', 'ALBUM', 'COMPILATION');

-- CreateEnum
CREATE TYPE "ContributorRole" AS ENUM ('LYRICIST', 'COMPOSER', 'WRITER', 'SINGER', 'PERFORMER', 'FEATURED_ARTIST', 'MUSIC_DIRECTOR', 'PRODUCER', 'ARRANGER', 'MIX_ENGINEER', 'MASTERING_ENGINEER', 'PUBLISHER', 'LABEL', 'OTHER');

-- CreateEnum
CREATE TYPE "RightType" AS ENUM ('MASTER', 'COMPOSITION', 'LYRICS', 'PUBLISHING', 'PERFORMANCE', 'MECHANICAL', 'SYNC', 'NEIGHBOURING', 'OTHER');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('ASSERTED', 'UNDER_REVIEW', 'REVIEWED', 'DOCUMENTED', 'DISPUTED', 'UNKNOWN', 'REJECTED');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'APPROVED_TEMPLATE', 'SENT_FOR_SIGNATURE', 'EXECUTED', 'REJECTED', 'SUPERSEDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('AGREEMENT', 'NOC', 'ANNEXURE', 'DECLARATION', 'CERTIFICATE', 'REGISTRATION', 'EVIDENCE', 'CORRESPONDENCE', 'INVOICE', 'OTHER');

-- CreateEnum
CREATE TYPE "OwnerType" AS ENUM ('ORGANIZATION', 'PARTY', 'WORK', 'RECORDING', 'RELEASE', 'RIGHTS_CLAIM', 'RIGHTS_TRANSFER', 'LICENSE', 'AGREEMENT', 'REGISTRATION', 'DISPUTE', 'VERIFICATION_PACKAGE');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "TemplateKind" AS ENUM ('AGREEMENT', 'NOC', 'ANNEXURE', 'DECLARATION');

-- CreateEnum
CREATE TYPE "AgreementType" AS ENUM ('ASSIGNMENT', 'EXCLUSIVE_LICENSE', 'NON_EXCLUSIVE_LICENSE', 'PUBLISHING', 'PRODUCER', 'ARTIST', 'WORK_FOR_HIRE', 'NOC', 'OTHER');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PLANNED', 'FILED', 'UNDER_EXAMINATION', 'OBJECTION', 'HEARING', 'REGISTERED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'EVIDENCE_SUBMITTED', 'AWAITING_RESPONSE', 'ESCALATED', 'RESOLVED_WON', 'RESOLVED_LOST', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "DisputeEventType" AS ENUM ('NOTE', 'CORRESPONDENCE', 'EVIDENCE', 'DEADLINE', 'STATUS_CHANGE');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('INTERNALLY_REVIEWED', 'INCOMPLETE', 'DISPUTED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "UsageMetric" AS ENUM ('STORAGE_BYTES', 'PDF_JOBS', 'EXPORTS', 'USERS', 'RECORDINGS');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PREVIEWED', 'COMMITTED', 'ROLLED_BACK', 'FAILED');

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceInrPaise" INTEGER,
    "maxRecordings" INTEGER,
    "maxUsers" INTEGER,
    "maxStorageBytes" BIGINT,
    "features" JSONB NOT NULL DEFAULT '{}',
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "OrgStatus" NOT NULL DEFAULT 'TRIAL',
    "planId" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "gstin" TEXT,
    "country" TEXT NOT NULL DEFAULT 'IN',
    "logoUrl" TEXT,
    "brandColor" TEXT DEFAULT '#7c3aed',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecretEnc" TEXT,
    "mfaPendingSecretEnc" TEXT,
    "mfaRecoveryHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfHash" TEXT NOT NULL,
    "activeOrgId" TEXT,
    "mfaVerified" BOOLEAN NOT NULL DEFAULT false,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "break_glass_grants" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "break_glass_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "canApproveOwnership" BOOLEAN NOT NULL DEFAULT false,
    "inviteTokenHash" TEXT,
    "inviteExpiresAt" TIMESTAMP(3),
    "invitedAt" TIMESTAMP(3),
    "invitedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "record_assignments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "assetType" "AssetType" NOT NULL,
    "assetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "record_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parties" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "stageName" TEXT,
    "types" "PartyType"[],
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "identifiers" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "musical_works" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "language" TEXT,
    "genre" TEXT,
    "iswc" TEXT,
    "lyricsExcerpt" TEXT,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "musical_works_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recordings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workId" TEXT,
    "title" TEXT NOT NULL,
    "version" TEXT,
    "isrc" TEXT,
    "durationSec" INTEGER,
    "recordingDate" TIMESTAMP(3),
    "language" TEXT,
    "studioName" TEXT,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recordings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "releases" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "ReleaseType" NOT NULL DEFAULT 'SINGLE',
    "upc" TEXT,
    "releaseDate" TIMESTAMP(3),
    "labelName" TEXT,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_tracks" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "recordingId" TEXT NOT NULL,
    "discNo" INTEGER NOT NULL DEFAULT 1,
    "trackNo" INTEGER NOT NULL,

    CONSTRAINT "release_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contributions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "workId" TEXT,
    "recordingId" TEXT,
    "role" "ContributorRole" NOT NULL,
    "creditOrder" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rights_claims" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetType" "AssetType" NOT NULL,
    "workId" TEXT,
    "recordingId" TEXT,
    "partyId" TEXT NOT NULL,
    "rightType" "RightType" NOT NULL,
    "sharePercent" DECIMAL(7,4) NOT NULL,
    "territories" TEXT[] DEFAULT ARRAY['WW']::TEXT[],
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" "ClaimStatus" NOT NULL DEFAULT 'ASSERTED',
    "basis" TEXT,
    "agreementId" TEXT,
    "createdById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rights_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rights_transfers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetType" "AssetType" NOT NULL,
    "workId" TEXT,
    "recordingId" TEXT,
    "fromPartyId" TEXT NOT NULL,
    "toPartyId" TEXT NOT NULL,
    "rightType" "RightType" NOT NULL,
    "sharePercent" DECIMAL(7,4),
    "scope" TEXT,
    "territories" TEXT[] DEFAULT ARRAY['WW']::TEXT[],
    "agreementId" TEXT,
    "effectiveDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rights_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licenses" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetType" "AssetType" NOT NULL,
    "workId" TEXT,
    "recordingId" TEXT,
    "licenseePartyId" TEXT,
    "licenseeName" TEXT NOT NULL,
    "territories" TEXT[] DEFAULT ARRAY['WW']::TEXT[],
    "exclusive" BOOLEAN NOT NULL DEFAULT false,
    "permittedUses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "feeNote" TEXT,
    "agreementId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "licenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_templates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "kind" "TemplateKind" NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "version" INTEGER NOT NULL DEFAULT 1,
    "body" TEXT NOT NULL,
    "variables" JSONB NOT NULL DEFAULT '[]',
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "isStarter" BOOLEAN NOT NULL DEFAULT false,
    "reviewedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agreements" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "AgreementType" NOT NULL,
    "title" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "templateId" TEXT,
    "templateVersion" INTEGER,
    "languages" TEXT[] DEFAULT ARRAY['en']::TEXT[],
    "consideration" JSONB NOT NULL DEFAULT '{}',
    "clauses" JSONB NOT NULL DEFAULT '{}',
    "territories" TEXT[] DEFAULT ARRAY['WW']::TEXT[],
    "effectiveDate" TIMESTAMP(3),
    "executionDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "annexureSnapshot" JSONB,
    "lockedAt" TIMESTAMP(3),
    "signatureProvider" TEXT,
    "signatureRef" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agreement_parties" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "signatoryName" TEXT,
    "signedAt" TIMESTAMP(3),

    CONSTRAINT "agreement_parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agreement_assets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "workId" TEXT,
    "recordingId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "agreement_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerType" "OwnerType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "DocumentCategory" NOT NULL DEFAULT 'EVIDENCE',
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersionId" TEXT,
    "signatoryName" TEXT,
    "signedDate" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "notes" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_versions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "scanStatus" "ScanStatus" NOT NULL DEFAULT 'PENDING',
    "isGenerated" BOOLEAN NOT NULL DEFAULT false,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registrations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetType" "AssetType" NOT NULL,
    "workId" TEXT,
    "recordingId" TEXT,
    "jurisdiction" TEXT NOT NULL DEFAULT 'IN',
    "registry" TEXT NOT NULL DEFAULT 'Copyright Office, India',
    "category" TEXT,
    "applicationNo" TEXT,
    "diaryNo" TEXT,
    "registrationNo" TEXT,
    "filedAt" TIMESTAMP(3),
    "registeredAt" TIMESTAMP(3),
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PLANNED',
    "nextDeadline" TIMESTAMP(3),
    "objectionNote" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetType" "AssetType" NOT NULL,
    "workId" TEXT,
    "recordingId" TEXT,
    "counterparty" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "caseNo" TEXT,
    "claimType" TEXT,
    "contentUrl" TEXT,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "deadline" TIMESTAMP(3),
    "resolution" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispute_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "type" "DisputeEventType" NOT NULL,
    "body" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "documentId" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispute_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_packages" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assetType" "AssetType" NOT NULL,
    "workId" TEXT,
    "recordingId" TEXT,
    "status" "VerificationStatus" NOT NULL,
    "manifest" JSONB NOT NULL,
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "storageKey" TEXT,
    "pdfStorageKey" TEXT,
    "sha256" TEXT,
    "idempotencyKey" TEXT,
    "generatedById" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "share_links" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "watermark" TEXT,
    "maxViews" INTEGER,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "share_link_accesses" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "shareLinkId" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "action" TEXT NOT NULL DEFAULT 'VIEW',
    "accessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_link_accesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "actorUserId" TEXT,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" JSONB NOT NULL DEFAULT '{}',
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "dedupeKey" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "gateway" TEXT,
    "gatewayRef" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "taxPaise" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "gatewayRef" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_records" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "metric" "UsageMetric" NOT NULL,
    "quantity" BIGINT NOT NULL,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PREVIEWED',
    "mapping" JSONB NOT NULL DEFAULT '{}',
    "rows" JSONB NOT NULL DEFAULT '[]',
    "summary" JSONB NOT NULL DEFAULT '{}',
    "errors" JSONB NOT NULL DEFAULT '[]',
    "createdIds" JSONB NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "committedAt" TIMESTAMP(3),
    "rolledBackAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "break_glass_grants_adminUserId_organizationId_idx" ON "break_glass_grants"("adminUserId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_gateway_eventId_key" ON "webhook_events"("gateway", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_inviteTokenHash_key" ON "memberships"("inviteTokenHash");

-- CreateIndex
CREATE INDEX "memberships_userId_idx" ON "memberships"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_organizationId_userId_key" ON "memberships"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "record_assignments_organizationId_idx" ON "record_assignments"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "record_assignments_membershipId_assetType_assetId_key" ON "record_assignments"("membershipId", "assetType", "assetId");

-- CreateIndex
CREATE INDEX "parties_organizationId_legalName_idx" ON "parties"("organizationId", "legalName");

-- CreateIndex
CREATE INDEX "musical_works_organizationId_title_idx" ON "musical_works"("organizationId", "title");

-- CreateIndex
CREATE INDEX "recordings_organizationId_title_idx" ON "recordings"("organizationId", "title");

-- CreateIndex
CREATE UNIQUE INDEX "recordings_organizationId_isrc_key" ON "recordings"("organizationId", "isrc");

-- CreateIndex
CREATE INDEX "releases_organizationId_title_idx" ON "releases"("organizationId", "title");

-- CreateIndex
CREATE UNIQUE INDEX "releases_organizationId_upc_key" ON "releases"("organizationId", "upc");

-- CreateIndex
CREATE INDEX "release_tracks_organizationId_idx" ON "release_tracks"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "release_tracks_releaseId_discNo_trackNo_key" ON "release_tracks"("releaseId", "discNo", "trackNo");

-- CreateIndex
CREATE UNIQUE INDEX "release_tracks_releaseId_recordingId_key" ON "release_tracks"("releaseId", "recordingId");

-- CreateIndex
CREATE INDEX "contributions_organizationId_idx" ON "contributions"("organizationId");

-- CreateIndex
CREATE INDEX "contributions_workId_idx" ON "contributions"("workId");

-- CreateIndex
CREATE INDEX "contributions_recordingId_idx" ON "contributions"("recordingId");

-- CreateIndex
CREATE INDEX "rights_claims_organizationId_assetType_idx" ON "rights_claims"("organizationId", "assetType");

-- CreateIndex
CREATE INDEX "rights_claims_workId_idx" ON "rights_claims"("workId");

-- CreateIndex
CREATE INDEX "rights_claims_recordingId_idx" ON "rights_claims"("recordingId");

-- CreateIndex
CREATE INDEX "rights_transfers_organizationId_idx" ON "rights_transfers"("organizationId");

-- CreateIndex
CREATE INDEX "licenses_organizationId_endDate_idx" ON "licenses"("organizationId", "endDate");

-- CreateIndex
CREATE INDEX "document_templates_organizationId_kind_idx" ON "document_templates"("organizationId", "kind");

-- CreateIndex
CREATE INDEX "agreements_organizationId_status_idx" ON "agreements"("organizationId", "status");

-- CreateIndex
CREATE INDEX "agreement_parties_organizationId_idx" ON "agreement_parties"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "agreement_parties_agreementId_partyId_role_key" ON "agreement_parties"("agreementId", "partyId", "role");

-- CreateIndex
CREATE INDEX "agreement_assets_organizationId_idx" ON "agreement_assets"("organizationId");

-- CreateIndex
CREATE INDEX "agreement_assets_agreementId_idx" ON "agreement_assets"("agreementId");

-- CreateIndex
CREATE INDEX "documents_organizationId_ownerType_ownerId_idx" ON "documents"("organizationId", "ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "document_versions_organizationId_idx" ON "document_versions"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_documentId_versionNo_key" ON "document_versions"("documentId", "versionNo");

-- CreateIndex
CREATE INDEX "registrations_organizationId_status_idx" ON "registrations"("organizationId", "status");

-- CreateIndex
CREATE INDEX "disputes_organizationId_status_idx" ON "disputes"("organizationId", "status");

-- CreateIndex
CREATE INDEX "dispute_events_organizationId_disputeId_idx" ON "dispute_events"("organizationId", "disputeId");

-- CreateIndex
CREATE INDEX "verification_packages_organizationId_idx" ON "verification_packages"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "verification_packages_organizationId_idempotencyKey_key" ON "verification_packages"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "share_links_tokenHash_key" ON "share_links"("tokenHash");

-- CreateIndex
CREATE INDEX "share_links_organizationId_idx" ON "share_links"("organizationId");

-- CreateIndex
CREATE INDEX "share_link_accesses_organizationId_shareLinkId_idx" ON "share_link_accesses"("organizationId", "shareLinkId");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_createdAt_idx" ON "audit_logs"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "notifications_organizationId_userId_readAt_idx" ON "notifications"("organizationId", "userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_organizationId_dedupeKey_key" ON "notifications"("organizationId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_organizationId_key" ON "subscriptions"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_organizationId_number_key" ON "invoices"("organizationId", "number");

-- CreateIndex
CREATE INDEX "usage_records_organizationId_metric_createdAt_idx" ON "usage_records"("organizationId", "metric", "createdAt");

-- CreateIndex
CREATE INDEX "import_batches_organizationId_createdAt_idx" ON "import_batches"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_assignments" ADD CONSTRAINT "record_assignments_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_workId_fkey" FOREIGN KEY ("workId") REFERENCES "musical_works"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_tracks" ADD CONSTRAINT "release_tracks_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_tracks" ADD CONSTRAINT "release_tracks_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "recordings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_workId_fkey" FOREIGN KEY ("workId") REFERENCES "musical_works"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "recordings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rights_claims" ADD CONSTRAINT "rights_claims_workId_fkey" FOREIGN KEY ("workId") REFERENCES "musical_works"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rights_claims" ADD CONSTRAINT "rights_claims_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "recordings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rights_claims" ADD CONSTRAINT "rights_claims_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rights_transfers" ADD CONSTRAINT "rights_transfers_workId_fkey" FOREIGN KEY ("workId") REFERENCES "musical_works"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rights_transfers" ADD CONSTRAINT "rights_transfers_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "recordings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rights_transfers" ADD CONSTRAINT "rights_transfers_fromPartyId_fkey" FOREIGN KEY ("fromPartyId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rights_transfers" ADD CONSTRAINT "rights_transfers_toPartyId_fkey" FOREIGN KEY ("toPartyId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rights_transfers" ADD CONSTRAINT "rights_transfers_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_workId_fkey" FOREIGN KEY ("workId") REFERENCES "musical_works"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "recordings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_licenseePartyId_fkey" FOREIGN KEY ("licenseePartyId") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "document_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreement_parties" ADD CONSTRAINT "agreement_parties_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreement_parties" ADD CONSTRAINT "agreement_parties_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreement_assets" ADD CONSTRAINT "agreement_assets_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreement_assets" ADD CONSTRAINT "agreement_assets_workId_fkey" FOREIGN KEY ("workId") REFERENCES "musical_works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreement_assets" ADD CONSTRAINT "agreement_assets_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "recordings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_workId_fkey" FOREIGN KEY ("workId") REFERENCES "musical_works"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "recordings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_workId_fkey" FOREIGN KEY ("workId") REFERENCES "musical_works"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "recordings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_events" ADD CONSTRAINT "dispute_events_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "disputes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_packages" ADD CONSTRAINT "verification_packages_workId_fkey" FOREIGN KEY ("workId") REFERENCES "musical_works"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_packages" ADD CONSTRAINT "verification_packages_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "recordings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "verification_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_link_accesses" ADD CONSTRAINT "share_link_accesses_shareLinkId_fkey" FOREIGN KEY ("shareLinkId") REFERENCES "share_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
