import type { Tone } from "./documents";

type S = Record<string, { label: string; tone: Tone }>;
export const REG_STATUS: S = {
  PLANNED: { label: "Planned", tone: "slate" }, FILED: { label: "Filed", tone: "sky" }, UNDER_EXAMINATION: { label: "Under examination", tone: "violet" },
  OBJECTION: { label: "Objection", tone: "amber" }, HEARING: { label: "Hearing", tone: "amber" }, REGISTERED: { label: "Registered", tone: "green" },
  REJECTED: { label: "Rejected", tone: "red" }, WITHDRAWN: { label: "Withdrawn", tone: "slate" },
};
export const DISPUTE_STATUS: S = {
  OPEN: { label: "Open", tone: "red" }, EVIDENCE_SUBMITTED: { label: "Evidence submitted", tone: "violet" }, AWAITING_RESPONSE: { label: "Awaiting response", tone: "amber" },
  ESCALATED: { label: "Escalated", tone: "red" }, RESOLVED_WON: { label: "Resolved — won", tone: "green" }, RESOLVED_LOST: { label: "Resolved — lost", tone: "slate" },
  WITHDRAWN: { label: "Withdrawn", tone: "slate" },
};
export const DISPUTE_CLOSED = ["RESOLVED_WON", "RESOLVED_LOST", "WITHDRAWN"];
export const PKG_STATUS: S = { INTERNALLY_REVIEWED: { label: "Internally reviewed", tone: "green" }, INCOMPLETE: { label: "Incomplete", tone: "amber" }, DISPUTED: { label: "Disputed", tone: "red" } };
export const SHARE_STATE: S = { active: { label: "Active", tone: "green" }, expired: { label: "Expired", tone: "slate" }, revoked: { label: "Revoked", tone: "red" }, exhausted: { label: "View limit reached", tone: "amber" } };
export const EVENT_TYPE: Record<string, string> = { NOTE: "Note", CORRESPONDENCE: "Correspondence", EVIDENCE: "Evidence", DEADLINE: "Deadline", STATUS_CHANGE: "Status change" };
export const PLATFORMS = ["YouTube", "YouTube Content ID", "Meta (Facebook/Instagram)", "Spotify", "JioSaavn", "Gaana", "Apple Music", "Amazon Music", "Wynk", "Other"];

export type AssetLite = { assetType: string; work?: { id: string; title: string; iswc?: string | null } | null; recording?: { id: string; title: string; isrc?: string | null; version?: string | null } | null };
export type Warning = { level: "error" | "warn" | "info"; code: string; message: string };
export const assetTitle = (a: AssetLite) => a.recording?.title ?? a.work?.title ?? "—";
export const assetCode = (a: AssetLite) => a.recording?.isrc ?? a.work?.iswc ?? null;
export const WARN_TONE: Record<Warning["level"], Tone> = { error: "red", warn: "amber", info: "sky" };
export const downloadPackage = (id: string, kind: "zip" | "pdf") => {
  const a = document.createElement("a");
  a.href = `/api/v1/packages/${id}/download?kind=${kind}`;
  a.click();
};
export const isOverdue = (d?: string | null) => !!d && new Date(d) < new Date();
