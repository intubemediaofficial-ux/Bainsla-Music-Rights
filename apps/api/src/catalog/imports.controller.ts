/// <reference types="multer" />
import { BadRequestException, Controller, Get, Header, Param, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { Prisma } from '@prisma/client';
import { PrismaService, Tx } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Auth, type OrgContext, RequirePermission } from '../auth/context.js';
import { found, ListQuery } from './shared.js';
import { pageArgs, toPage } from '../common/pagination.js';
import { isValidIsrc, isValidUpc, normalizeIsrc, normalizeTitle, normalizeUpc } from './validation.js';

/** Canonical column → accepted header aliases (case/space-insensitive). */
const COLUMNS: Record<string, string[]> = {
  title: ['title', 'song', 'song title', 'work title', 'track title', 'gaana'],
  version: ['version', 'mix'],
  isrc: ['isrc'],
  language: ['language', 'lang', 'bhasha'],
  genre: ['genre'],
  durationSec: ['duration', 'length', 'duration sec'],
  recordingDate: ['recording date', 'recorded on'],
  releaseTitle: ['release', 'release title', 'album'],
  upc: ['upc', 'ean', 'barcode'],
  releaseDate: ['release date'],
  label: ['label', 'record label'],
  singer: ['singer', 'singers', 'artist', 'performer'],
  lyricist: ['lyricist', 'lyrics', 'writer'],
  composer: ['composer', 'music', 'music director'],
  producer: ['producer'],
};
const PEOPLE: Record<string, 'SINGER' | 'LYRICIST' | 'COMPOSER' | 'PRODUCER'> = { singer: 'SINGER', lyricist: 'LYRICIST', composer: 'COMPOSER', producer: 'PRODUCER' };
const PARTY_TYPE = { SINGER: 'SINGER', LYRICIST: 'LYRICIST', COMPOSER: 'COMPOSER', PRODUCER: 'PRODUCER' } as const;
const MAX_ROWS = 5000;

type Row = Record<string, string>;
interface Parsed { row: number; data: Row; errors: string[]; warnings: string[] }

const key = (h: string) => h.toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();

function mapHeaders(headers: string[]) {
  const mapping: Record<string, string> = {};
  for (const h of headers) {
    const k = key(h);
    const col = Object.entries(COLUMNS).find(([, aliases]) => aliases.includes(k))?.[0];
    if (col && !Object.values(mapping).includes(col)) mapping[h] = col;
  }
  return mapping;
}

function duration(v?: string) {
  if (!v) return null;
  if (/^\d+$/.test(v)) return Number(v);
  const m = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(v);
  if (!m) return NaN;
  return m[3] ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : Number(m[1]) * 60 + Number(m[2]);
}

const splitNames = (v?: string) => (v ? v.split(/[,;/&]| and /i).map((s) => s.trim()).filter(Boolean) : []);
const toDateOrNull = (v?: string) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

async function readTable(file: Express.Multer.File): Promise<string[][]> {
  const name = file.originalname.toLowerCase();
  if (name.endsWith('.csv') || file.mimetype === 'text/csv') {
    return parse(file.buffer.toString('utf8').replace(/^\uFEFF/, ''), { skip_empty_lines: true, relax_column_count: true, trim: true });
  }
  if (name.endsWith('.xlsx')) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file.buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const out: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (r) => {
      const vals = (r.values as unknown[]).slice(1).map((v) => {
        if (v == null) return '';
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        if (typeof v === 'object' && v && 'text' in v) return String((v as { text: unknown }).text);
        if (typeof v === 'object' && v && 'result' in v) return String((v as { result: unknown }).result ?? '');
        return String(v).trim();
      });
      out.push(vals);
    });
    return out;
  }
  throw new BadRequestException('Upload a .csv or .xlsx file');
}

async function validateRows(tx: Tx, orgId: string, rows: Row[]): Promise<Parsed[]> {
  const isrcs = rows.map((r) => normalizeIsrc(r.isrc)).filter(Boolean) as string[];
  const existing = new Set((await tx.recording.findMany({ where: { organizationId: orgId, isrc: { in: isrcs } }, select: { isrc: true } })).map((r) => r.isrc));
  const seen = new Set<string>();
  return rows.map((data, i) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!data.title?.trim()) errors.push('Title is missing');
    const isrc = normalizeIsrc(data.isrc);
    if (isrc) {
      if (!isValidIsrc(isrc)) errors.push(`Invalid ISRC "${data.isrc}"`);
      else if (seen.has(isrc)) errors.push(`ISRC ${isrc} repeats in this file`);
      else if (existing.has(isrc)) warnings.push(`ISRC ${isrc} already exists — row will be skipped`);
      seen.add(isrc);
    } else warnings.push('No ISRC');
    const upc = normalizeUpc(data.upc);
    if (upc && !isValidUpc(upc)) errors.push(`Invalid UPC "${data.upc}"`);
    const dur = duration(data.durationSec);
    if (Number.isNaN(dur)) errors.push(`Duration "${data.durationSec}" should be seconds or mm:ss`);
    if (toDateOrNull(data.releaseDate) === undefined) errors.push(`Release date "${data.releaseDate}" is not a date`);
    if (toDateOrNull(data.recordingDate) === undefined) errors.push(`Recording date "${data.recordingDate}" is not a date`);
    if (!Object.keys(PEOPLE).some((k) => data[k])) warnings.push('No singer/lyricist/composer');
    return { row: i + 2, data, errors, warnings };
  });
}

@ApiTags('imports')
@Controller('imports')
export class ImportsController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Get('template.csv')
  @RequirePermission('catalog.import')
  @Header('content-type', 'text/csv; charset=utf-8')
  @Header('content-disposition', 'attachment; filename="catalog-import-template.csv"')
  template() {
    return '\uFEFFtitle,version,isrc,language,genre,duration,singer,lyricist,composer,producer,release,upc,release date,label\n' +
      'Mera Gaon,Original,INA1B2400001,Hindi,Folk,3:45,Demo Singer,Demo Lyricist,Demo Composer,Demo Producer,Mera Gaon - Single,036000291452,2024-05-01,Demo Label\n';
  }

  @Get()
  @RequirePermission('catalog.import')
  list(@Auth() auth: OrgContext, @Query() q: ListQuery) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const rows = await tx.importBatch.findMany({
        where: { organizationId: auth.orgId },
        select: { id: true, kind: true, filename: true, status: true, summary: true, createdAt: true, committedAt: true, rolledBackAt: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...pageArgs(q, 25),
      });
      return toPage(rows, q, 25);
    });
  }

  @Get(':id')
  @RequirePermission('catalog.import')
  get(@Auth() auth: OrgContext, @Param('id') id: string) {
    return this.prisma.tenant(auth.orgId, async (tx) => found(await tx.importBatch.findFirst({ where: { id, organizationId: auth.orgId } }), 'Import'));
  }

  /** Step 1: parse + validate, store a preview. Nothing is created yet. */
  @Post('preview')
  @RequirePermission('catalog.import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  async preview(@Auth() auth: OrgContext, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Attach a file');
    const table = await readTable(file);
    if (table.length < 2) throw new BadRequestException('The file has no data rows');
    if (table.length - 1 > MAX_ROWS) throw new BadRequestException(`Max ${MAX_ROWS} rows per import`);
    const [headers, ...body] = table;
    const mapping = mapHeaders(headers);
    if (!Object.values(mapping).includes('title')) throw new BadRequestException('A "title" column is required. Download the template for the expected columns.');
    const rows: Row[] = body.map((cells) => {
      const r: Row = {};
      headers.forEach((h, i) => {
        const col = mapping[h];
        if (col && cells[i] != null && String(cells[i]).trim() !== '') r[col] = String(cells[i]).trim();
      });
      return r;
    });
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const parsed = await validateRows(tx, auth.orgId, rows);
      const summary = { total: parsed.length, valid: parsed.filter((p) => !p.errors.length).length, invalid: parsed.filter((p) => p.errors.length).length, warnings: parsed.filter((p) => p.warnings.length).length };
      const b = await tx.importBatch.create({
        data: {
          organizationId: auth.orgId, kind: 'catalog', filename: file.originalname.slice(0, 200), mapping, summary,
          rows: parsed as unknown as Prisma.InputJsonValue, errors: parsed.filter((p) => p.errors.length).map((p) => ({ row: p.row, errors: p.errors })), createdById: auth.userId,
        },
      });
      await this.audit.log(tx, auth, { action: 'import.previewed', entityType: 'import', entityId: b.id, after: summary });
      return { id: b.id, mapping, unmapped: headers.filter((h) => !mapping[h]), summary, rows: parsed.slice(0, 500) };
    });
  }

  /** Step 2: create works, recordings, parties, credits and releases for every valid row. Idempotent per batch. */
  @Post(':id/commit')
  @RequirePermission('catalog.import')
  commit(@Auth() auth: OrgContext, @Param('id') id: string) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const b = found(await tx.importBatch.findFirst({ where: { id, organizationId: auth.orgId } }), 'Import');
      if (b.status !== 'PREVIEWED') throw new BadRequestException(`Import is already ${b.status.toLowerCase()}`);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
      const parsed = await validateRows(tx, auth.orgId, (b.rows as unknown as Parsed[]).map((p) => p.data));
      const created = { works: [] as string[], recordings: [] as string[], parties: [] as string[], releases: [] as string[], contributions: [] as string[], tracks: [] as string[] };
      const partyCache = new Map<string, string>();
      const workCache = new Map<string, string>();
      const releaseCache = new Map<string, string>();
      let imported = 0;
      let skipped = 0;

      const party = async (name: string, role: keyof typeof PARTY_TYPE) => {
        const k = name.toLowerCase();
        if (partyCache.has(k)) return partyCache.get(k)!;
        let p = await tx.party.findFirst({ where: { organizationId: auth.orgId, OR: [{ legalName: { equals: name, mode: 'insensitive' } }, { stageName: { equals: name, mode: 'insensitive' } }] } });
        if (!p) {
          p = await tx.party.create({ data: { organizationId: auth.orgId, legalName: name, types: [PARTY_TYPE[role]], createdById: auth.userId } });
          created.parties.push(p.id);
        } else if (!p.types.includes(PARTY_TYPE[role])) {
          await tx.party.update({ where: { id: p.id }, data: { types: { push: PARTY_TYPE[role] } } });
        }
        partyCache.set(k, p.id);
        return p.id;
      };

      for (const p of parsed) {
        const d = p.data;
        const isrc = normalizeIsrc(d.isrc);
        if (p.errors.length || p.warnings.some((w) => w.includes('already exists'))) {
          skipped++;
          continue;
        }
        const wk = `${normalizeTitle(d.title)}|${(d.lyricist ?? '').toLowerCase()}|${(d.composer ?? '').toLowerCase()}`;
        let workId = workCache.get(wk);
        if (!workId) {
          const w = await tx.musicalWork.create({ data: { organizationId: auth.orgId, title: d.title, language: d.language ?? null, genre: d.genre ?? null, createdById: auth.userId } });
          workId = w.id;
          workCache.set(wk, workId);
          created.works.push(workId);
          for (const role of ['lyricist', 'composer'] as const) {
            for (const [i, name] of splitNames(d[role]).entries()) {
              const c = await tx.contribution.create({ data: { organizationId: auth.orgId, workId, partyId: await party(name, PEOPLE[role]), role: PEOPLE[role], creditOrder: i + 1 } });
              created.contributions.push(c.id);
            }
          }
        }
        const rec = await tx.recording.create({
          data: {
            organizationId: auth.orgId, workId, title: d.title, version: d.version ?? null, isrc, durationSec: duration(d.durationSec) ?? null,
            recordingDate: toDateOrNull(d.recordingDate) ?? null, language: d.language ?? null, createdById: auth.userId,
          },
        });
        created.recordings.push(rec.id);
        for (const role of ['singer', 'producer'] as const) {
          for (const [i, name] of splitNames(d[role]).entries()) {
            const c = await tx.contribution.create({ data: { organizationId: auth.orgId, recordingId: rec.id, partyId: await party(name, PEOPLE[role]), role: PEOPLE[role], creditOrder: i + 1 } });
            created.contributions.push(c.id);
          }
        }
        if (d.releaseTitle || d.upc) {
          const upc = normalizeUpc(d.upc);
          const rk = upc ?? normalizeTitle(d.releaseTitle);
          let relId = releaseCache.get(rk);
          if (!relId) {
            const ex = upc ? await tx.release.findFirst({ where: { organizationId: auth.orgId, upc } }) : null;
            const rel = ex ?? (await tx.release.create({ data: { organizationId: auth.orgId, title: d.releaseTitle || d.title, upc, releaseDate: toDateOrNull(d.releaseDate) ?? null, labelName: d.label ?? null, createdById: auth.userId } }));
            if (!ex) created.releases.push(rel.id);
            relId = rel.id;
            releaseCache.set(rk, relId);
          }
          const last = await tx.releaseTrack.findFirst({ where: { releaseId: relId }, orderBy: { trackNo: 'desc' } });
          const t = await tx.releaseTrack.create({ data: { organizationId: auth.orgId, releaseId: relId, recordingId: rec.id, trackNo: (last?.trackNo ?? 0) + 1 } });
          created.tracks.push(t.id);
        }
        imported++;
      }
      const summary = { ...(b.summary as object), imported, skipped, created: Object.fromEntries(Object.entries(created).map(([k, v]) => [k, v.length])) };
      await tx.importBatch.update({ where: { id }, data: { status: 'COMMITTED', committedAt: new Date(), createdIds: created, summary } });
      await this.audit.log(tx, auth, { action: 'import.committed', entityType: 'import', entityId: id, after: summary });
      return { ok: true, summary };
    }, { timeout: 120_000 });
  }

  /** Removes exactly what this batch created, unless it has since been used by rights, licenses or agreements. */
  @Post(':id/rollback')
  @RequirePermission('catalog.import')
  rollback(@Auth() auth: OrgContext, @Param('id') id: string) {
    return this.prisma.tenant(auth.orgId, async (tx) => {
      const b = found(await tx.importBatch.findFirst({ where: { id, organizationId: auth.orgId } }), 'Import');
      if (b.status !== 'COMMITTED') throw new BadRequestException('Only committed imports can be rolled back');
      const c = b.createdIds as Record<string, string[]>;
      const org = auth.orgId;
      const used = await Promise.all([
        tx.rightsClaim.count({ where: { organizationId: org, OR: [{ workId: { in: c.works } }, { recordingId: { in: c.recordings } }, { partyId: { in: c.parties } }] } }),
        tx.license.count({ where: { organizationId: org, OR: [{ workId: { in: c.works } }, { recordingId: { in: c.recordings } }] } }),
        tx.agreementAsset.count({ where: { organizationId: org, OR: [{ workId: { in: c.works } }, { recordingId: { in: c.recordings } }] } }),
      ]);
      if (used.some((n) => n > 0)) throw new BadRequestException('Some imported records already have rights, licenses or agreements. Archive them individually instead.');
      await tx.releaseTrack.deleteMany({ where: { organizationId: org, id: { in: c.tracks } } });
      await tx.contribution.deleteMany({ where: { organizationId: org, id: { in: c.contributions } } });
      await tx.recording.deleteMany({ where: { organizationId: org, id: { in: c.recordings } } });
      await tx.musicalWork.deleteMany({ where: { organizationId: org, id: { in: c.works } } });
      await tx.release.deleteMany({ where: { organizationId: org, id: { in: c.releases }, tracks: { none: {} } } });
      await tx.party.deleteMany({ where: { organizationId: org, id: { in: c.parties }, contributions: { none: {} } } });
      await tx.importBatch.update({ where: { id }, data: { status: 'ROLLED_BACK', rolledBackAt: new Date() } });
      await this.audit.log(tx, auth, { action: 'import.rolled_back', entityType: 'import', entityId: id });
      return { ok: true };
    }, { timeout: 60_000 });
  }
}
