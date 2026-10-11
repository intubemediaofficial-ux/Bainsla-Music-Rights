/**
 * Pure rights/share validation. A claim covers a set of territories ("WW" = everywhere)
 * over a closed date range (null = open). For every right type we check every
 * (territory, moment) slice and report where active shares add up to more than 100%.
 */
export interface ClaimLike {
  id: string;
  partyId: string;
  rightType: string;
  sharePercent: number;
  territories: string[];
  startDate: Date | null;
  endDate: Date | null;
  status: string;
}

export interface ShareIssue {
  kind: 'OVER_100' | 'DUPLICATE_PARTY';
  rightType: string;
  territory: string;
  from: Date | null;
  to: Date | null;
  total: number;
  claimIds: string[];
}

export interface RightSummary {
  rightType: string;
  maxTotal: number;
  worldwideTotal: number;
  issues: ShareIssue[];
}

const IGNORED = new Set(['REJECTED']);
const OTHER = '*';
const round = (n: number) => Math.round(n * 10000) / 10000;

export function covers(c: Pick<ClaimLike, 'territories'>, territory: string) {
  const t = c.territories.length ? c.territories : ['WW'];
  return t.includes('WW') || t.includes(territory);
}

export function territoriesOverlap(a: string[], b: string[]) {
  const A = a.length ? a : ['WW'];
  const B = b.length ? b : ['WW'];
  return A.includes('WW') || B.includes('WW') || A.some((x) => B.includes(x));
}

export function datesOverlap(a: Pick<ClaimLike, 'startDate' | 'endDate'>, b: Pick<ClaimLike, 'startDate' | 'endDate'>) {
  const aS = a.startDate?.getTime() ?? -Infinity;
  const aE = a.endDate?.getTime() ?? Infinity;
  const bS = b.startDate?.getTime() ?? -Infinity;
  const bE = b.endDate?.getTime() ?? Infinity;
  return aS <= bE && bS <= aE;
}

function activeAt(c: ClaimLike, t: number) {
  return (c.startDate?.getTime() ?? -Infinity) <= t && t <= (c.endDate?.getTime() ?? Infinity);
}

export function validateClaims(claims: ClaimLike[]): RightSummary[] {
  const live = claims.filter((c) => !IGNORED.has(c.status));
  const byType = new Map<string, ClaimLike[]>();
  for (const c of live) byType.set(c.rightType, [...(byType.get(c.rightType) ?? []), c]);

  const out: RightSummary[] = [];
  for (const [rightType, list] of byType) {
    const territories = new Set<string>([OTHER]);
    for (const c of list) for (const t of c.territories) if (t !== 'WW') territories.add(t);
    const points = new Set<number>([-Infinity]);
    for (const c of list) {
      if (c.startDate) points.add(c.startDate.getTime());
      if (c.endDate) points.add(c.endDate.getTime() + 1);
    }
    const sorted = [...points].sort((a, b) => a - b);

    const issues: ShareIssue[] = [];
    let maxTotal = 0;
    const seen = new Set<string>();
    for (const territory of territories) {
      for (let i = 0; i < sorted.length; i++) {
        const at = sorted[i];
        const active = list.filter((c) => covers(c, territory) && activeAt(c, at));
        const total = round(active.reduce((s, c) => s + c.sharePercent, 0));
        maxTotal = Math.max(maxTotal, total);
        if (total > 100) {
          const ids = active.map((c) => c.id).sort();
          const key = `${territory}|${ids.join(',')}`;
          if (!seen.has(key)) {
            seen.add(key);
            const next = sorted[i + 1];
            issues.push({
              kind: 'OVER_100', rightType, territory: territory === OTHER ? 'WW' : territory,
              from: Number.isFinite(at) ? new Date(at) : null,
              to: next !== undefined && Number.isFinite(next) ? new Date(next - 1) : null,
              total, claimIds: ids,
            });
          }
        }
      }
    }
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.partyId === b.partyId && territoriesOverlap(a.territories, b.territories) && datesOverlap(a, b)) {
          issues.push({ kind: 'DUPLICATE_PARTY', rightType, territory: '', from: null, to: null, total: round(a.sharePercent + b.sharePercent), claimIds: [a.id, b.id] });
        }
      }
    }
    const now = Date.now();
    const worldwideTotal = round(list.filter((c) => covers(c, OTHER) && activeAt(c, now)).reduce((s, c) => s + c.sharePercent, 0));
    out.push({ rightType, maxTotal, worldwideTotal, issues });
  }
  return out.sort((a, b) => a.rightType.localeCompare(b.rightType));
}

const ISRC_RE = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;
export function normalizeIsrc(v?: string | null) {
  if (!v) return null;
  const s = v.replace(/[-\s]/g, '').toUpperCase();
  return s || null;
}
export const isValidIsrc = (v: string) => ISRC_RE.test(v);

export function normalizeUpc(v?: string | null) {
  if (!v) return null;
  const s = v.replace(/[\s-]/g, '');
  return s || null;
}
/** UPC-A (12) or EAN-13 with GS1 check digit. */
export function isValidUpc(v: string) {
  if (!/^\d{12,13}$/.test(v)) return false;
  const digits = v.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export function normalizeIswc(v?: string | null) {
  if (!v) return null;
  const s = v.replace(/[-.\s]/g, '').toUpperCase();
  return s || null;
}
export const isValidIswc = (v: string) => /^T\d{10}$/.test(v);

export function normalizeTitle(t: string) {
  return t.normalize('NFKC').toLowerCase().replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ').trim();
}
