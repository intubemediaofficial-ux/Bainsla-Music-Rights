export type Tone = "slate" | "green" | "amber" | "red" | "violet" | "sky";

export const DOC_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "slate" },
  UNDER_REVIEW: { label: "Under review", tone: "sky" },
  APPROVED_TEMPLATE: { label: "Approved", tone: "green" },
  SENT_FOR_SIGNATURE: { label: "Sent for signature", tone: "violet" },
  EXECUTED: { label: "Executed", tone: "green" },
  REJECTED: { label: "Rejected", tone: "red" },
  SUPERSEDED: { label: "Superseded", tone: "slate" },
  EXPIRED: { label: "Expired", tone: "amber" },
};

export const SCAN_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Scan pending", tone: "sky" },
  CLEAN: { label: "Scanned clean", tone: "green" },
  INFECTED: { label: "Infected", tone: "red" },
  SKIPPED: { label: "Not scanned", tone: "amber" },
  FAILED: { label: "Scan failed", tone: "red" },
};

export const CATEGORY_LABEL: Record<string, string> = {
  AGREEMENT: "Agreement", NOC: "NOC", ANNEXURE: "Annexure", DECLARATION: "Declaration", CERTIFICATE: "Certificate",
  REGISTRATION: "Registration", EVIDENCE: "Evidence", CORRESPONDENCE: "Correspondence", INVOICE: "Invoice", OTHER: "Other",
};
export const CATEGORIES = Object.keys(CATEGORY_LABEL);

export const OWNER_LABEL: Record<string, string> = {
  ORGANIZATION: "Organization", PARTY: "Party", WORK: "Musical work", RECORDING: "Recording", RELEASE: "Release", AGREEMENT: "Agreement",
  RIGHTS_CLAIM: "Rights claim", LICENSE: "License", REGISTRATION: "Registration", DISPUTE: "Dispute",
};

export const AGREEMENT_TYPE: Record<string, string> = {
  ASSIGNMENT: "Copyright assignment", EXCLUSIVE_LICENSE: "Exclusive licence", NON_EXCLUSIVE_LICENSE: "Non-exclusive licence", PUBLISHING: "Publishing",
  PRODUCER: "Producer", ARTIST: "Artist", WORK_FOR_HIRE: "Work for hire", NOC: "No-objection (NOC)", OTHER: "Other",
};

export const TEMPLATE_KIND: Record<string, string> = { AGREEMENT: "Agreement", NOC: "NOC", ANNEXURE: "Annexure", DECLARATION: "Declaration" };
export const LANG: Record<string, string> = { en: "English", hi: "हिन्दी (Hindi)" };

export type Version = {
  id: string; versionNo: number; filename: string; mime: string; sizeBytes: number; sha256: string; scanStatus: string; isGenerated: boolean; createdAt: string;
};
export type AuditRow = { id: string; action: string; actorEmail: string | null; createdAt: string; summary?: unknown };
export type Doc = {
  id: string; ownerType: string; ownerId: string; title: string; category: string; status: string; signatoryName: string | null; signedDate: string | null;
  expiresAt: string | null; notes: string | null; createdAt: string; updatedAt: string; owner: string | null; versions: Version[];
  _count?: { versions: number }; locked?: boolean; history?: AuditRow[];
};
export type Template = {
  id: string; organizationId: string | null; kind: string; name: string; language: string; version: number; status: string; isStarter: boolean;
  approvedAt: string | null; updatedAt: string; variables: string[] | null; body?: string; editable?: boolean;
  history?: { id: string; version: number; status: string; updatedAt: string }[];
};

export const DOC_FLOW: Record<string, string[]> = {
  DRAFT: ["UNDER_REVIEW", "SENT_FOR_SIGNATURE", "EXECUTED", "REJECTED"],
  UNDER_REVIEW: ["DRAFT", "SENT_FOR_SIGNATURE", "EXECUTED", "REJECTED"],
  SENT_FOR_SIGNATURE: ["DRAFT", "EXECUTED", "REJECTED"],
  EXECUTED: ["SUPERSEDED", "EXPIRED"],
  REJECTED: ["DRAFT"],
};

export function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

export function ownerHref(type: string, id: string) {
  const m: Record<string, string> = { WORK: "works", RECORDING: "recordings", RELEASE: "releases", PARTY: "parties", AGREEMENT: "agreements" };
  return m[type] ? `/${m[type]}/${id}` : null;
}
