"use client";
import { use, useEffect, useState } from "react";
import { AlertTriangle, Download, FileText, Loader2, Lock, ShieldCheck } from "lucide-react";

type Meta = { state: string; label: string | null; organization: string; expiresAt: string; requiresPassword: boolean };
type Warning = { level: "error" | "warn" | "info"; message: string };
type FileRow = { path: string; sha256: string; bytes: number; source?: { title: string; status: string } };
type Claim = { party: string; rightType: string; share: number; territories: string[]; status: string };
type Unlocked = {
  label: string | null; organization: string; expiresAt: string;
  package: { status: string; generatedAt: string; sha256: string | null; asset: { title: string; isrc?: string | null; iswc?: string | null } | null; warnings: Warning[]; files: FileRow[]; data?: { claims?: Claim[]; asset?: { kind: string } } };
  downloads: { zip: string; pdf: string };
};
const STATUS: Record<string, [string, string]> = { INTERNALLY_REVIEWED: ["Internally reviewed", "bg-emerald-100 text-emerald-800"], INCOMPLETE: ["Incomplete", "bg-amber-100 text-amber-800"], DISPUTED: ["Disputed", "bg-red-100 text-red-800"] };
const LEVEL: Record<string, string> = { error: "bg-red-100 text-red-800", warn: "bg-amber-100 text-amber-800", info: "bg-sky-100 text-sky-800" };
const fmt = (d: string) => new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`/api/v1/public/shares/${path}`, { ...init, headers: { "content-type": "application/json" }, cache: "no-store" });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof body.message === "string" ? body.message : "Something went wrong");
  return body as T;
}

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<Unlocked | null>(null);

  useEffect(() => {
    call<Meta>(encodeURIComponent(token)).then(setMeta, (e: Error) => setErr(e.message));
  }, [token]);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      setData(await call<Unlocked>(`${encodeURIComponent(token)}/unlock`, { method: "POST", body: JSON.stringify({ password: pw }) }));
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const inactive = meta && meta.state !== "active";
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center gap-2 text-white">
          <ShieldCheck className="size-6 text-violet-300" />
          <span className="text-lg font-semibold">Music Rights Cloud</span>
          <span className="ml-auto text-xs text-white/60">Secure shared package</span>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
          {!meta && !err && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" /> Loading…</div>}
          {(err && !meta) || inactive ? (
            <div className="py-8 text-center">
              <AlertTriangle className="mx-auto mb-3 size-10 text-amber-500" />
              <h1 className="text-xl font-semibold">This link is not available</h1>
              <p className="mt-1 text-sm text-slate-500">{inactive ? `It has ${meta.state === "revoked" ? "been revoked" : meta.state === "exhausted" ? "reached its view limit" : "expired"}.` : err} Ask the sender for a new link.</p>
            </div>
          ) : null}
          {meta && !inactive && !data && (
            <form onSubmit={(e) => void unlock(e)} className="mx-auto max-w-sm py-6 text-center">
              <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-violet-100"><Lock className="size-6 text-violet-700" /></div>
              <h1 className="text-xl font-semibold">{meta.organization} shared a verification package</h1>
              {meta.label && <p className="mt-1 text-sm text-slate-500">{meta.label}</p>}
              <p className="mt-1 text-xs text-slate-400">Link expires {fmt(meta.expiresAt)}</p>
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Enter password" required autoFocus className="mt-6 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200" />
              {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
              <button disabled={busy} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60">{busy && <Loader2 className="size-4 animate-spin" />} Open package</button>
              <p className="mt-4 text-xs text-slate-400">Access to this link is logged.</p>
            </form>
          )}
          {data && (
            <div>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">{data.organization}{data.label ? ` · ${data.label}` : ""}</p>
                  <h1 className="text-2xl font-semibold">{data.package.asset?.title}</h1>
                  <p className="text-sm text-slate-500">{data.package.data?.asset?.kind}{data.package.asset?.isrc ? ` · ISRC ${data.package.asset.isrc}` : ""}{data.package.asset?.iswc ? ` · ISWC ${data.package.asset.iswc}` : ""} · generated {fmt(data.package.generatedAt)}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS[data.package.status]?.[1] ?? ""}`}>{STATUS[data.package.status]?.[0] ?? data.package.status}</span>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <a href={data.downloads.pdf} className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800"><FileText className="size-4" /> PDF summary</a>
                <a href={data.downloads.zip} className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-slate-50"><Download className="size-4" /> Evidence ZIP</a>
              </div>
              <p className="mt-2 text-xs text-slate-400">Download links stay valid for 10 minutes. ZIP SHA-256: <span className="break-all font-mono">{data.package.sha256}</span></p>
              <h2 className="mt-6 text-sm font-semibold">Warnings</h2>
              <ul className="mt-2 grid gap-1.5">
                {data.package.warnings.length ? data.package.warnings.map((w, i) => <li key={i} className="flex items-start gap-2 text-sm"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${LEVEL[w.level]}`}>{w.level}</span>{w.message}</li>) : <li className="text-sm text-emerald-700">No issues found.</li>}
              </ul>
              {!!data.package.data?.claims?.length && (
                <>
                  <h2 className="mt-6 text-sm font-semibold">Ownership on record</h2>
                  <table className="mt-2 w-full text-left text-sm"><thead className="text-xs text-slate-500"><tr><th className="py-1">Party</th><th>Right</th><th>Share</th><th>Status</th></tr></thead>
                    <tbody>{data.package.data.claims.map((c, i) => <tr key={i} className="border-t"><td className="py-1.5">{c.party}</td><td>{c.rightType}</td><td>{c.share}%</td><td className="text-xs">{c.status}</td></tr>)}</tbody></table>
                </>
              )}
              <h2 className="mt-6 text-sm font-semibold">Files in the ZIP</h2>
              <ul className="mt-2 grid gap-1 text-xs">{data.package.files.map((f) => <li key={f.path} className="flex flex-wrap justify-between gap-2 border-t py-1.5"><span className="font-mono">{f.path}</span><span className="break-all font-mono text-slate-400">{f.sha256.slice(0, 16)}…</span></li>)}</ul>
              <p className="mt-6 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">Internal verification summary. Not legal certification or a government registration. ISRC/ISWC/UPC identifiers do not by themselves prove ownership.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
