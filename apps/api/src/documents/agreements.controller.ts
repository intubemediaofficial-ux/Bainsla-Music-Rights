import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { meter } from '../billing/usage.js';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDate, IsIn, IsNumber, IsObject, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
import type { AgreementType, DocumentStatus, Prisma } from '@prisma/client';
import { PrismaService, type Tx } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Auth, type OrgContext, RequirePermission } from '../auth/context.js';
import { pageArgs, toPage } from '../common/pagination.js';
import { found, ListQuery, toDate, trimOrNull } from '../catalog/shared.js';
import { DocumentsService } from './documents.service.js';
import { esc, page, RenderService, renderTemplate } from './render.service.js';

const TYPES = ['ASSIGNMENT', 'EXCLUSIVE_LICENSE', 'NON_EXCLUSIVE_LICENSE', 'PUBLISHING', 'PRODUCER', 'ARTIST', 'WORK_FOR_HIRE', 'NOC', 'OTHER'] as const;
const TYPE_LABEL: Record<string, string> = {
  ASSIGNMENT: 'copyright (assignment)', EXCLUSIVE_LICENSE: 'exclusive licence', NON_EXCLUSIVE_LICENSE: 'non-exclusive licence', PUBLISHING: 'publishing',
  PRODUCER: 'producer', ARTIST: 'artist', WORK_FOR_HIRE: 'work-for-hire', NOC: 'no-objection', OTHER: 'agreed',
};
const MAX_ASSETS = 2000;

class PartyIn {
  @IsString() partyId!: string;
  @IsString() @MinLength(2) @MaxLength(60) role!: string;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(200) signatoryName?: string | null;
}
class AssetIn {
  @IsOptional() @IsString() workId?: string;
  @IsOptional() @IsString() recordingId?: string;
}
class Consideration {
  @IsOptional() @IsNumber() amount?: number;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
  @IsOptional() @IsString() @MaxLength(2000) terms?: string;
}
class AgreementDto {
  @IsIn(TYPES) type!: AgreementType;
  @IsString() @MinLength(2) @MaxLength(250) title!: string;
  @IsOptional() @trimOrNull() @IsString() templateId?: string | null;
  @IsOptional() @IsArray() @IsIn(['en', 'hi'], { each: true }) languages?: string[];
  @IsOptional() @ValidateNested() @Type(() => Consideration) consideration?: Consideration;
  @IsOptional() @IsObject() clauses?: Record<string, string>;
  @IsOptional() @IsArray() @Matches(/^(WW|[A-Z]{2})$/, { each: true }) territories?: string[];
  @IsOptional() @toDate() @IsDate() effectiveDate?: Date | null;
  @IsOptional() @toDate() @IsDate() expiryDate?: Date | null;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => PartyIn) parties?: PartyIn[];
  @IsOptional() @IsArray() @ArrayMaxSize(MAX_ASSETS) @ValidateNested({ each: true }) @Type(() => AssetIn) assets?: AssetIn[];
}
class UpdateAgreementDto {
  @IsOptional() @IsIn(TYPES) type?: AgreementType;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(250) title?: string;
  @IsOptional() @trimOrNull() @IsString() templateId?: string | null;
  @IsOptional() @IsArray() @IsIn(['en', 'hi'], { each: true }) languages?: string[];
  @IsOptional() @ValidateNested() @Type(() => Consideration) consideration?: Consideration;
  @IsOptional() @IsObject() clauses?: Record<string, string>;
  @IsOptional() @IsArray() @Matches(/^(WW|[A-Z]{2})$/, { each: true }) territories?: string[];
  @IsOptional() @toDate() @IsDate() effectiveDate?: Date | null;
  @IsOptional() @toDate() @IsDate() expiryDate?: Date | null;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => PartyIn) parties?: PartyIn[];
  @IsOptional() @IsArray() @ArrayMaxSize(MAX_ASSETS) @ValidateNested({ each: true }) @Type(() => AssetIn) assets?: AssetIn[];
}
class RenderDto {
  @IsIn(['en', 'hi']) language!: string;
  @IsOptional() @IsIn(['agreement', 'annexure']) kind?: 'agreement' | 'annexure';
}
class NocDto {
  @IsIn(['en', 'hi']) language!: string;
  @IsOptional() @IsString() partyId?: string;
  @IsOptional() @IsIn(['separate', 'consolidated']) mode?: 'separate' | 'consolidated';
}
class StatusDto {
  @IsIn(['DRAFT', 'UNDER_REVIEW', 'SENT_FOR_SIGNATURE', 'EXECUTED', 'REJECTED', 'EXPIRED']) status!: DocumentStatus;
  @IsOptional() @IsString() executedDocumentId?: string;
  @IsOptional() @toDate() @IsDate() executionDate?: Date;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(100) signatureProvider?: string | null;
  @IsOptional() @trimOrNull() @IsString() @MaxLength(200) signatureRef?: string | null;
}
class AgreementQuery extends ListQuery {
  @IsOptional() @IsIn(['DRAFT', 'UNDER_REVIEW', 'SENT_FOR_SIGNATURE', 'EXECUTED', 'REJECTED', 'SUPERSEDED', 'EXPIRED']) status?: DocumentStatus;
}

const AGREEMENT_FLOW: Record<string, DocumentStatus[]> = {
  DRAFT: ['UNDER_REVIEW', 'SENT_FOR_SIGNATURE', 'REJECTED'],
  UNDER_REVIEW: ['DRAFT', 'SENT_FOR_SIGNATURE', 'REJECTED'],
  SENT_FOR_SIGNATURE: ['DRAFT', 'EXECUTED', 'REJECTED'],
  REJECTED: ['DRAFT'],
  EXECUTED: ['EXPIRED'],
};

const full = {
  parties: { include: { party: { select: { id: true, legalName: true, stageName: true, address: true, email: true } } } },
  assets: {
    orderBy: { sortOrder: 'asc' },
    include: {
      work: { select: { id: true, title: true, iswc: true, language: true } },
      recording: { select: { id: true, title: true, isrc: true, version: true, language: true, durationSec: true, work: { select: { title: true } } } },
    },
  },
  template: { select: { id: true, name: true, language: true, version: true, status: true, isStarter: true } },
} satisfies Prisma.AgreementInclude;
type Full = Prisma.AgreementGetPayload<{ include: typeof full }>;

const fmt = (d: Date | null | undefined, lang = 'en') => (d ? d.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '');
const dur = (s?: number | null) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '');

export function annexureRows(a: Pick<Full, 'assets'>) {
  return a.assets.map((x, i) => x.recording
    ? { no: i + 1, kind: 'Recording', title: x.recording.title, version: x.recording.version ?? '', code: x.recording.isrc ?? '', work: x.recording.work?.title ?? '', language: x.recording.language ?? '', duration: dur(x.recording.durationSec), id: x.recording.id }
    : { no: i + 1, kind: 'Work', title: x.work?.title ?? '', version: '', code: x.work?.iswc ?? '', work: '', language: x.work?.language ?? '', duration: '', id: x.work?.id ?? '' });
}

function annexureTable(rows: ReturnType<typeof annexureRows>, lang: string) {
  const h = lang === 'hi' ? ['क्र.', 'शीर्षक', 'प्रकार', 'ISRC / ISWC', 'संस्करण', 'भाषा', 'अवधि'] : ['#', 'Title', 'Type', 'ISRC / ISWC', 'Version', 'Language', 'Duration'];
  if (!rows.length) return `<p class="blank">${lang === 'hi' ? 'कोई गीत नहीं जोड़ा गया' : 'No songs selected'}</p>`;
  return `<table><thead><tr>${h.map((x) => `<th>${x}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr><td>${r.no}</td><td>${esc(r.title)}${r.work && r.work !== r.title ? `<br/><small>${esc(r.work)}</small>` : ''}</td><td>${r.kind}</td><td>${esc(r.code)}</td><td>${esc(r.version)}</td><td>${esc(r.language)}</td><td>${r.duration}</td></tr>`)
    .join('')}</tbody></table>`;
}

const territoriesLabel = (t: string[], lang: string) => (!t.length || t.includes('WW') ? (lang === 'hi' ? 'विश्वव्यापी' : 'Worldwide') : t.join(', '));

@ApiTags('agreements')
@Controller('agreements')
export class AgreementsController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly docs: DocumentsService, private readonly render: RenderService) {}

  @Get()
  @RequirePermission('documents.read')
  list(@Auth() auth: OrgContext, @Query() q: AgreementQuery) {
    const where: Prisma.AgreementWhereInput = {
      organizationId: auth.orgId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.q ? { OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { parties: { some: { party: { legalName: { contains: q.q, mode: 'insensitive' } } } } }] } : {}),
    };
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const rows = await tx.agreement.findMany({
        where, ...pageArgs(q), orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        include: { parties: { include: { party: { select: { id: true, legalName: true } } } }, _count: { select: { assets: true } } },
      });
      const counts = await tx.agreement.groupBy({ by: ['status'], where: { organizationId: auth.orgId }, _count: true });
      return { ...toPage(rows, q), counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) };
    });
  }

  @Get(':id')
  @RequirePermission('documents.read')
  get(@Auth() auth: OrgContext, @Param('id') id: string) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const a = found(await tx.agreement.findFirst({ where: { id, organizationId: auth.orgId }, include: full }), 'Agreement');
      const documents = await tx.document.findMany({
        where: { organizationId: auth.orgId, ownerType: 'AGREEMENT', ownerId: id }, orderBy: { createdAt: 'desc' },
        include: { versions: { orderBy: { versionNo: 'desc' }, take: 1, select: { id: true, versionNo: true, filename: true, sha256: true, isGenerated: true, createdAt: true, sizeBytes: true, scanStatus: true } } },
      });
      const history = await tx.auditLog.findMany({ where: { organizationId: auth.orgId, entityType: 'agreement', entityId: id }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, action: true, actorEmail: true, createdAt: true } });
      return {
        ...a, locked: !!a.lockedAt, annexure: annexureRows(a), history,
        documents: documents.map((d) => ({ ...d, versions: d.versions.map((v) => ({ ...v, sizeBytes: Number(v.sizeBytes) })) })),
      };
    });
  }

  private async validateLinks(tx: Tx, orgId: string, dto: { parties?: PartyIn[]; assets?: AssetIn[]; templateId?: string | null }) {
    if (dto.templateId) {
      const t = await tx.documentTemplate.findFirst({ where: { id: dto.templateId, OR: [{ organizationId: orgId }, { organizationId: null }] }, select: { kind: true } });
      if (!t) throw new BadRequestException('Template not found');
      if (t.kind !== 'AGREEMENT') throw new BadRequestException('Pick an agreement template');
    }
    if (dto.parties) {
      const ids = [...new Set(dto.parties.map((p) => p.partyId))];
      if ((await tx.party.count({ where: { id: { in: ids }, organizationId: orgId } })) !== ids.length) throw new BadRequestException('One or more parties were not found');
      const keys = dto.parties.map((p) => `${p.partyId}:${p.role}`);
      if (new Set(keys).size !== keys.length) throw new BadRequestException('A party is listed twice with the same role');
    }
    if (dto.assets) {
      for (const a of dto.assets) if (!!a.workId === !!a.recordingId) throw new BadRequestException('Each Annexure-A item must be exactly one work or one recording');
      const w = [...new Set(dto.assets.flatMap((a) => (a.workId ? [a.workId] : [])))];
      const r = [...new Set(dto.assets.flatMap((a) => (a.recordingId ? [a.recordingId] : [])))];
      if (w.length + r.length !== dto.assets.length) throw new BadRequestException('A song is listed twice in Annexure-A');
      const [wc, rc] = await Promise.all([tx.musicalWork.count({ where: { id: { in: w }, organizationId: orgId } }), tx.recording.count({ where: { id: { in: r }, organizationId: orgId } })]);
      if (wc !== w.length || rc !== r.length) throw new BadRequestException('One or more songs were not found');
    }
  }

  private async replaceLinks(tx: Tx, orgId: string, agreementId: string, dto: { parties?: PartyIn[]; assets?: AssetIn[] }) {
    if (dto.parties) {
      await tx.agreementParty.deleteMany({ where: { agreementId, organizationId: orgId } });
      await tx.agreementParty.createMany({ data: dto.parties.map((p) => ({ organizationId: orgId, agreementId, partyId: p.partyId, role: p.role.trim().toUpperCase(), signatoryName: p.signatoryName ?? null })) });
    }
    if (dto.assets) {
      await tx.agreementAsset.deleteMany({ where: { agreementId, organizationId: orgId } });
      await tx.agreementAsset.createMany({ data: dto.assets.map((a, i) => ({ organizationId: orgId, agreementId, workId: a.workId ?? null, recordingId: a.recordingId ?? null, sortOrder: i })) });
    }
  }

  @Post()
  @RequirePermission('rights.write')
  create(@Auth() auth: OrgContext, @Body() dto: AgreementDto) {
    if (dto.effectiveDate && dto.expiryDate && dto.expiryDate < dto.effectiveDate) throw new BadRequestException('Expiry must be after the effective date');
    return this.prisma.tenant(auth.orgId, async (tx) => {
      await this.validateLinks(tx, auth.orgId, dto);
      const a = await tx.agreement.create({
        data: {
          organizationId: auth.orgId, type: dto.type, title: dto.title.trim(), templateId: dto.templateId ?? null, languages: dto.languages?.length ? dto.languages : ['en'],
          consideration: (dto.consideration ?? {}) as Prisma.InputJsonValue, clauses: (dto.clauses ?? {}) as Prisma.InputJsonValue, territories: dto.territories?.length ? dto.territories : ['WW'],
          effectiveDate: dto.effectiveDate ?? null, expiryDate: dto.expiryDate ?? null, createdById: auth.userId,
        },
      });
      await this.replaceLinks(tx, auth.orgId, a.id, dto);
      await this.audit.log(tx, auth, { action: 'agreement.create', entityType: 'agreement', entityId: a.id, after: { title: a.title, type: a.type, parties: dto.parties?.length ?? 0, assets: dto.assets?.length ?? 0 } });
      return a;
    });
  }

  @Patch(':id')
  @RequirePermission('rights.write')
  update(@Auth() auth: OrgContext, @Param('id') id: string, @Body() dto: UpdateAgreementDto) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const a = found(await tx.agreement.findFirst({ where: { id, organizationId: auth.orgId } }), 'Agreement');
      if (a.lockedAt) throw new BadRequestException('This agreement is executed and locked. Create an amendment instead.');
      await this.validateLinks(tx, auth.orgId, dto);
      const eff = dto.effectiveDate !== undefined ? dto.effectiveDate : a.effectiveDate;
      const exp = dto.expiryDate !== undefined ? dto.expiryDate : a.expiryDate;
      if (eff && exp && exp < eff) throw new BadRequestException('Expiry must be after the effective date');
      const { parties, assets, consideration, clauses, ...rest } = dto;
      const after = await tx.agreement.update({
        where: { id },
        data: {
          ...rest, ...(consideration ? { consideration: consideration as Prisma.InputJsonValue } : {}), ...(clauses ? { clauses: clauses as Prisma.InputJsonValue } : {}),
          ...(a.status === 'UNDER_REVIEW' || a.status === 'SENT_FOR_SIGNATURE' ? { status: 'DRAFT' as const } : {}),
        },
      });
      await this.replaceLinks(tx, auth.orgId, id, { parties, assets });
      await this.audit.log(tx, auth, { action: 'agreement.update', entityType: 'agreement', entityId: id, after: { fields: Object.keys(dto) } });
      return after;
    });
  }

  private async pickTemplate(tx: Tx, orgId: string, a: Full, kind: 'AGREEMENT' | 'NOC', language: string) {
    if (kind === 'AGREEMENT' && a.templateId) {
      const t = await tx.documentTemplate.findFirst({ where: { id: a.templateId, OR: [{ organizationId: orgId }, { organizationId: null }] } });
      if (t && t.language === language) return t;
    }
    return (
      (await tx.documentTemplate.findFirst({ where: { organizationId: orgId, kind, language, status: 'APPROVED_TEMPLATE' }, orderBy: { version: 'desc' } })) ??
      (await tx.documentTemplate.findFirst({ where: { organizationId: null, isStarter: true, kind, language } }))
    );
  }

  private vars(a: Full, org: { legalName: string }, lang: string) {
    const c = (a.consideration ?? {}) as Record<string, unknown>;
    const cl = (a.clauses ?? {}) as Record<string, string>;
    const rows = annexureRows(a);
    const parties = a.parties.map((p) => ({ name: p.party.legalName, address: p.party.address ?? '', role: p.role, signatory: p.signatoryName ?? p.party.legalName }));
    return {
      date: fmt(new Date(), lang),
      org: { legal_name: org.legalName },
      agreement: {
        title: a.title, type: a.type, effective_date: fmt(a.effectiveDate, lang), expiry_date: fmt(a.expiryDate, lang),
        territories: territoriesLabel(a.territories, lang), rights: cl.rights || TYPE_LABEL[a.type],
      },
      consideration: { amount: c.amount != null ? Number(c.amount).toLocaleString('en-IN') : '', currency: (c.currency as string) || 'INR', terms: (c.terms as string) ?? '' },
      clauses: { warranties: cl.warranties ?? '', governing_law: cl.governing_law || 'India', jurisdiction: cl.jurisdiction ?? '', additional: cl.additional ?? '' },
      parties,
      annexure_count: rows.length,
      annexure_table: annexureTable(rows, lang),
      signature_block: `<div class="sig">${parties.map((p) => `<div>${esc(p.signatory)}<br/><small>${esc(p.role)} — ${esc(p.name)}</small><br/>${lang === 'hi' ? 'हस्ताक्षर एवं दिनांक' : 'Signature & date'}</div>`).join('')}</div>`,
    };
  }

  private async loadForRender(auth: OrgContext, id: string) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const a = found(await tx.agreement.findFirst({ where: { id, organizationId: auth.orgId }, include: full }), 'Agreement');
      const org = await tx.organization.findUniqueOrThrow({ where: { id: auth.orgId }, select: { legalName: true } });
      return { a, org };
    });
  }

  /** Store a generated PDF as a new version of the matching generated draft, or as a new document. */
  private async storeGenerated(auth: OrgContext, agreementId: string, title: string, category: 'AGREEMENT' | 'ANNEXURE' | 'NOC', pdf: Buffer, filename: string, meta: Record<string, unknown>) {
    const stored = await this.docs.storage.put(auth.orgId, pdf);
    const file = { ...stored, mime: 'application/pdf', filename, scanStatus: 'SKIPPED' as const };
    return this.prisma.tenant(auth.orgId, async (tx) => {
      await this.docs.assertQuota(tx, auth.orgId, pdf.length);
      const existing = await tx.document.findFirst({ where: { organizationId: auth.orgId, ownerType: 'AGREEMENT', ownerId: agreementId, title, category, status: 'DRAFT', versions: { every: { isGenerated: true } } } });
      let documentId: string;
      let versionNo: number;
      if (existing) {
        const v = await this.docs.addVersion(tx, auth.orgId, existing.id, file, { isGenerated: true, userId: auth.userId });
        documentId = existing.id;
        versionNo = v.versionNo;
      } else {
        const d = await this.docs.createDocument(tx, auth.orgId, { ownerType: 'AGREEMENT', ownerId: agreementId, title, category, userId: auth.userId, notes: 'Generated draft — not evidence until signed and uploaded.' }, file, true);
        documentId = d.id;
        versionNo = 1;
      }
      await this.audit.log(tx, auth, { action: `agreement.render_${category.toLowerCase()}`, entityType: 'agreement', entityId: agreementId, after: { documentId, versionNo, sha256: stored.sha256, ...meta } });
      return { documentId, versionNo, sha256: stored.sha256, sizeBytes: stored.sizeBytes };
    });
  }

  @Post(':id/render')
  @RequirePermission('documents.write')
  async renderAgreement(@Auth() auth: OrgContext, @Param('id') id: string, @Body() dto: RenderDto) {
    const { a, org } = await this.loadForRender(auth, id);
    const kind = dto.kind ?? 'agreement';
    const lang = dto.language;
    const vars = this.vars(a, org, lang);
    let html: string;
    let templateInfo: Record<string, unknown> = {};
    if (kind === 'annexure') {
      html = page(`Annexure-A — ${a.title}`, `<h1>${lang === 'hi' ? 'अनुलग्नक-ए (Annexure-A)' : 'Annexure-A'}</h1><p><b>${esc(a.title)}</b><br/>${esc(vars.agreement.effective_date)} · ${esc(vars.agreement.territories)}</p>${vars.annexure_table}`, { watermark: a.lockedAt ? undefined : 'DRAFT' });
    } else {
      const t = await this.prisma.tenant(auth.orgId, (tx) => this.pickTemplate(tx, auth.orgId, a, 'AGREEMENT', lang));
      if (!t) throw new BadRequestException(`No ${lang === 'hi' ? 'Hindi' : 'English'} agreement template is available`);
      templateInfo = { templateId: t.id, templateVersion: t.version, approved: t.status === 'APPROVED_TEMPLATE' };
      html = page(a.title, renderTemplate(t.body, vars), { watermark: t.status === 'APPROVED_TEMPLATE' ? 'DRAFT' : 'DRAFT — TEMPLATE NOT APPROVED' });
      await this.prisma.tenant(auth.orgId, (tx) => tx.agreement.update({ where: { id }, data: { templateVersion: t.version } }));
    }
    const pdf = await this.render.pdf(html, `${a.title} · ${kind === 'annexure' ? 'Annexure-A' : lang.toUpperCase()} draft`);
    await this.prisma.tenant(auth.orgId, (tx) => meter(tx, auth.orgId, 'PDF_JOBS', 1, id));
    const label = kind === 'annexure' ? 'Annexure-A' : lang === 'hi' ? 'Hindi draft' : 'English draft';
    return this.storeGenerated(auth, id, `${a.title} — ${label}`, kind === 'annexure' ? 'ANNEXURE' : 'AGREEMENT', pdf, `${a.title} - ${label}.pdf`, { language: lang, ...templateInfo });
  }

  @Post(':id/noc')
  @RequirePermission('documents.write')
  async noc(@Auth() auth: OrgContext, @Param('id') id: string, @Body() dto: NocDto) {
    const { a, org } = await this.loadForRender(auth, id);
    const t = await this.prisma.tenant(auth.orgId, (tx) => this.pickTemplate(tx, auth.orgId, a, 'NOC', dto.language));
    if (!t) throw new BadRequestException('No NOC template is available for this language');
    const targets = dto.partyId ? a.parties.filter((p) => p.partyId === dto.partyId) : a.parties;
    if (!targets.length) throw new BadRequestException(dto.partyId ? 'That party is not on this agreement' : 'Add parties to the agreement first');
    const base = this.vars(a, org, dto.language);
    const one = (p: (typeof targets)[number]) => renderTemplate(t.body, { ...base, party: { name: p.party.legalName, address: p.party.address ?? '' } });
    const wm = { watermark: t.status === 'APPROVED_TEMPLATE' ? 'DRAFT' : 'DRAFT — TEMPLATE NOT APPROVED' };
    const out = [];
    if ((dto.mode ?? 'separate') === 'consolidated') {
      const pdf = await this.render.pdf(page(`NOC — ${a.title}`, targets.map(one).join('<div class="pb"></div>'), wm), `${a.title} · NOC (consolidated)`);
      out.push(await this.storeGenerated(auth, id, `${a.title} — NOC (consolidated, ${dto.language.toUpperCase()})`, 'NOC', pdf, `${a.title} - NOC.pdf`, { language: dto.language, parties: targets.length }));
    } else {
      for (const p of targets) {
        const pdf = await this.render.pdf(page(`NOC — ${p.party.legalName}`, one(p), wm), `${a.title} · NOC · ${p.party.legalName}`);
        out.push(await this.storeGenerated(auth, id, `${a.title} — NOC ${p.party.legalName} (${dto.language.toUpperCase()})`, 'NOC', pdf, `NOC - ${p.party.legalName}.pdf`, { language: dto.language, partyId: p.partyId }));
      }
    }
    await this.prisma.tenant(auth.orgId, (tx) => meter(tx, auth.orgId, 'PDF_JOBS', out.length, id));
    return { documents: out };
  }

  @Post(':id/status')
  @RequirePermission('rights.write')
  setStatus(@Auth() auth: OrgContext, @Param('id') id: string, @Body() dto: StatusDto) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const a = found(await tx.agreement.findFirst({ where: { id, organizationId: auth.orgId }, include: full }), 'Agreement');
      if (!AGREEMENT_FLOW[a.status]?.includes(dto.status)) throw new BadRequestException(`Cannot move a ${a.status} agreement to ${dto.status}`);
      if ((dto.status === 'EXECUTED' || dto.status === 'REJECTED') && !auth.permissions.has('documents.review')) throw new ForbiddenException('Only legal reviewers or admins can execute or reject agreements');
      const data: Prisma.AgreementUpdateInput = { status: dto.status };
      if (dto.status === 'EXECUTED') {
        if (!a.parties.length || !a.assets.length) throw new BadRequestException('Add parties and Annexure-A songs before executing');
        if (!dto.executedDocumentId) throw new BadRequestException('Upload the signed copy and pick it as the executed document');
        const doc = await tx.document.findFirst({ where: { id: dto.executedDocumentId, organizationId: auth.orgId, ownerType: 'AGREEMENT', ownerId: id }, include: { versions: { orderBy: { versionNo: 'desc' }, take: 1 } } });
        if (!doc) throw new BadRequestException('The executed document must be uploaded on this agreement');
        const v = doc.versions[0];
        if (!v || v.isGenerated) throw new BadRequestException('An unsigned generated PDF is not evidence. Upload the signed copy.');
        if (v.scanStatus === 'INFECTED' || v.scanStatus === 'FAILED') throw new BadRequestException('The signed copy failed the malware scan');
        const when = dto.executionDate ?? new Date();
        await tx.document.update({ where: { id: doc.id }, data: { status: 'EXECUTED', signedDate: doc.signedDate ?? when } });
        await tx.document.updateMany({ where: { organizationId: auth.orgId, ownerType: 'AGREEMENT', ownerId: id, status: 'DRAFT', versions: { every: { isGenerated: true } } }, data: { status: 'SUPERSEDED' } });
        await tx.agreementParty.updateMany({ where: { agreementId: id, organizationId: auth.orgId, signedAt: null }, data: { signedAt: when } });
        Object.assign(data, {
          executionDate: when, lockedAt: new Date(), signatureProvider: dto.signatureProvider ?? 'external', signatureRef: dto.signatureRef ?? null,
          annexureSnapshot: { frozenAt: new Date().toISOString(), executedDocumentId: doc.id, executedSha256: v.sha256, items: annexureRows(a) } as Prisma.InputJsonValue,
        });
      }
      const after = await tx.agreement.update({ where: { id }, data });
      await this.audit.log(tx, auth, { action: `agreement.${dto.status.toLowerCase()}`, entityType: 'agreement', entityId: id, before: { status: a.status }, after: { status: dto.status, executedDocumentId: dto.executedDocumentId } });
      return after;
    });
  }
}
