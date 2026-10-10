export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

function csrf(): string {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)mrc_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const method = (rest.method ?? (json !== undefined ? "POST" : "GET")).toUpperCase();
  const h = new Headers(headers);
  if (json !== undefined) h.set("content-type", "application/json");
  if (!["GET", "HEAD"].includes(method)) h.set("x-csrf-token", csrf());
  const res = await fetch(`/api/v1${path}`, {
    ...rest,
    method,
    headers: h,
    credentials: "same-origin",
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const text = await res.text();
  const body = text ? safeJson(text) : null;
  if (!res.ok) {
    const b = body as { message?: string | string[] } | null;
    const msg = Array.isArray(b?.message) ? b!.message.join(", ") : b?.message ?? res.statusText;
    throw new ApiError(res.status, msg, body);
  }
  return body as T;
}

function safeJson(t: string) {
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}

export function errMsg(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong";
}

export type Role = "OWNER" | "ADMIN" | "RIGHTS_MANAGER" | "LEGAL_REVIEWER" | "CATALOG_EDITOR" | "VIEWER";

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  RIGHTS_MANAGER: "Rights Manager",
  LEGAL_REVIEWER: "Legal Reviewer",
  CATALOG_EDITOR: "Catalog Editor",
  VIEWER: "Viewer / Artist",
};

export type OrgLite = { id: string; displayName: string; slug: string; status: string; logoUrl: string | null; brandColor: string | null };

export type Me = {
  user: { id: string; email: string; name: string; isPlatformAdmin: boolean; mfaEnabled: boolean };
  mfaPending: boolean;
  mfaSetupRequired: boolean;
  activeOrg: OrgLite | null;
  role: Role | null;
  breakGlass: boolean;
  permissions: string[];
  organizations: (OrgLite & { role: Role })[];
};

export function fmtDate(d: string | Date | null | undefined, withTime = false) {
  if (!d) return "—";
  const x = new Date(d);
  return x.toLocaleString("en-IN", withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" });
}

export function timeAgo(d: string | Date) {
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
