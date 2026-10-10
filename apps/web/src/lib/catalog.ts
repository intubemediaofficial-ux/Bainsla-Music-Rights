export type Page<T> = { data: T[]; nextCursor: string | null };
export type PartyLite = { id: string; legalName: string; stageName: string | null };
export type AssetKind = "WORK" | "RECORDING";

export type Credit = { id: string; role: string; creditOrder: number; party: PartyLite };
export type Claim = {
  id: string; assetType: AssetKind; partyId: string; party: PartyLite; rightType: string; sharePercent: string | number;
  territories: string[]; startDate: string | null; endDate: string | null; status: string; basis: string | null; reviewedAt: string | null;
  work?: { id: string; title: string } | null; recording?: { id: string; title: string; isrc?: string | null } | null;
};
export type Issue = { kind: "OVER_100" | "DUPLICATE_PARTY"; rightType: string; territory: string; from: string | null; to: string | null; total: number; claimIds: string[] };
export type Validation = { rightType: string; maxTotal: number; worldwideTotal: number; issues: Issue[] };
export type Transfer = {
  id: string; rightType: string; sharePercent: string | null; territories: string[]; scope: string | null; effectiveDate: string | null; createdAt: string;
  fromParty: PartyLite; toParty: PartyLite; work?: { id: string; title: string } | null; recording?: { id: string; title: string } | null;
};
export type License = {
  id: string; assetType: AssetKind; licenseeName: string; territories: string[]; exclusive: boolean; permittedUses: string[];
  startDate: string | null; endDate: string | null; feeNote: string | null;
  work?: { id: string; title: string } | null; recording?: { id: string; title: string; isrc?: string | null } | null;
};
export type AssetRights = { rightsClaims: Claim[]; transfers: Transfer[]; validation: Validation[]; hasConflicts: boolean };

export const RIGHT_LABEL: Record<string, string> = {
  MASTER: "Master (sound recording)", COMPOSITION: "Composition", LYRICS: "Lyrics", PUBLISHING: "Publishing", PERFORMANCE: "Performance",
  MECHANICAL: "Mechanical", SYNC: "Sync", NEIGHBOURING: "Neighbouring", OTHER: "Other",
};
export const RIGHT_TYPES = Object.keys(RIGHT_LABEL);

export const CLAIM_STATUS: Record<string, { label: string; tone: "slate" | "green" | "amber" | "red" | "violet" | "sky" }> = {
  ASSERTED: { label: "Asserted", tone: "slate" },
  UNDER_REVIEW: { label: "Under review", tone: "sky" },
  REVIEWED: { label: "Internally reviewed", tone: "violet" },
  DOCUMENTED: { label: "Documented", tone: "green" },
  DISPUTED: { label: "Disputed", tone: "red" },
  UNKNOWN: { label: "Unknown", tone: "amber" },
  REJECTED: { label: "Rejected", tone: "slate" },
};

export const CREDIT_ROLE: Record<string, string> = {
  LYRICIST: "Lyricist", COMPOSER: "Composer", WRITER: "Writer", SINGER: "Singer", PERFORMER: "Performer", FEATURED_ARTIST: "Featured artist",
  MUSIC_DIRECTOR: "Music director", PRODUCER: "Producer", ARRANGER: "Arranger", MIX_ENGINEER: "Mix engineer", MASTERING_ENGINEER: "Mastering engineer",
  PUBLISHER: "Publisher", LABEL: "Label", OTHER: "Other",
};
export const WORK_ROLES = ["LYRICIST", "COMPOSER", "WRITER", "MUSIC_DIRECTOR", "ARRANGER", "PUBLISHER", "OTHER"];
export const RECORDING_ROLES = ["SINGER", "PERFORMER", "FEATURED_ARTIST", "MUSIC_DIRECTOR", "PRODUCER", "ARRANGER", "MIX_ENGINEER", "MASTERING_ENGINEER", "LABEL", "OTHER"];

export const PARTY_TYPES = ["ARTIST", "SINGER", "WRITER", "LYRICIST", "COMPOSER", "PRODUCER", "STUDIO", "PUBLISHER", "LABEL", "DISTRIBUTOR", "OTHER"];
export const RELEASE_TYPES = ["SINGLE", "EP", "ALBUM", "COMPILATION"];

export const partyName = (p?: PartyLite | null) => (!p ? "—" : p.stageName && p.stageName !== p.legalName ? `${p.stageName} (${p.legalName})` : p.legalName);
export const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");
export const pct = (v: string | number | null | undefined) => `${Number(v ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 4 })}%`;

export function fmtDuration(s?: number | null) {
  if (!s) return "—";
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export function parseDuration(v: FormDataEntryValue | null) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  const m = /^(\d+):(\d{1,2})$/.exec(s);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

export const qs = (o: Record<string, string | number | undefined | null | false>) =>
  new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "" && v !== false).map(([k, v]) => [k, String(v)])).toString();

/** FormData → string | null (blank → null), for optional fields. */
export const str = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v || null;
};
export const dateOrNull = (f: FormData, k: string) => str(f, k);
export const isoDay = (d?: string | null) => (d ? d.slice(0, 10) : "");
export const territories = (f: FormData, k = "territories") => {
  const v = String(f.get(k) ?? "").toUpperCase().split(/[\s,]+/).filter(Boolean);
  return v.length ? [...new Set(v)] : ["WW"];
};
export const assetHref = (c: { assetType: string; work?: { id: string } | null; recording?: { id: string } | null }) =>
  c.assetType === "WORK" ? `/works/${c.work?.id}` : `/recordings/${c.recording?.id}`;
