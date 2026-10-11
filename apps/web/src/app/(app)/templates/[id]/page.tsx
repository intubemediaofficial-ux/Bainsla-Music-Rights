"use client";
import Link from "next/link";
import { use, useState } from "react";
import { CheckCircle2, Copy, Send, ShieldAlert, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app-shell";
import { Pill } from "@/components/data-table";
import { DetailSkeleton, InfoGrid, SectionCard, useFetch } from "@/components/catalog";
import { StatusPill } from "@/components/documents";
import { api, errMsg, fmtDate } from "@/lib/api";
import { LANG, Template, TEMPLATE_KIND } from "@/lib/documents";
import { useSession } from "@/lib/session";

const SAMPLE: Record<string, string> = {
  "agreement.title": "Sample Assignment 2026", "agreement.territories": "Worldwide", "agreement.effective_date": "01 Jan 2026", "organization.name": "Your Label",
  "party.name": "Ram Singh", "party.address": "Jaipur, Rajasthan", "consideration.amount": "50,000", "consideration.currency": "INR",
  "clauses.governing_law": "India", "clauses.jurisdiction": "Jaipur", "clauses.warranties": "The assignor warrants original authorship.",
};

function preview(body: string) {
  const sample = body
    .replace(/\{\{\{\s*annexure_table\s*\}\}\}/g, '<table border="1" cellpadding="4" style="border-collapse:collapse;width:100%"><tr><th>#</th><th>Title</th><th>ISRC / ISWC</th></tr><tr><td>1</td><td>Sample song</td><td>INZ9Z2600001</td></tr></table>')
    .replace(/\{\{\{\s*signature_blocks\s*\}\}\}/g, '<p style="margin-top:40px">______________________<br/>Signatory</p>')
    .replace(/\{\{#\s*([\w.]+)\s*\}\}([\s\S]*?)\{\{\/\s*\1\s*\}\}/g, (_m, _k, inner: string) => inner.replace(/\{\{\s*name\s*\}\}/g, "Ram Singh").replace(/\{\{\s*role\s*\}\}/g, "Assignor"))
    .replace(/\{\{\{?\s*([\w.]+)\s*\}?\}\}/g, (_m, k: string) => SAMPLE[k] ?? `[${k}]`);
  return `<!doctype html><meta charset="utf-8"><style>body{font-family:"Noto Sans","Noto Sans Devanagari",system-ui,sans-serif;font-size:13px;line-height:1.6;padding:24px;color:#111}h1{font-size:20px}h2{font-size:15px}</style>${sample}`;
}

export default function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can, me } = useSession();
  const router = useRouter();
  const { data: t, error, reload } = useFetch<Template>(`/templates/${id}`);
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!t) return <DetailSkeleton error={error} />;
  const body = draft ?? t.body ?? "";
  const editable = !!t.editable && can("documents.write") && ["DRAFT", "REJECTED", "APPROVED_TEMPLATE"].includes(t.status);

  async function act(path: string, json?: unknown, msg?: string) {
    setBusy(true);
    try {
      const r = await api<Template>(`/templates/${id}${path}`, { method: "POST", json });
      if (msg) toast.success(msg);
      if (r?.id && r.id !== id) router.push(`/templates/${r.id}`);
      else void reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    try {
      const r = await api<Template>(`/templates/${id}`, { method: "PATCH", json: { body } });
      toast.success(r.id !== id ? `Saved as new version v${r.version}` : "Saved");
      setDraft(null);
      if (r.id !== id) router.push(`/templates/${r.id}`);
      else void reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!confirm("Delete this template?")) return;
    try {
      await api(`/templates/${id}`, { method: "DELETE" });
      router.push("/templates");
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  return (
    <>
      <div className="mb-2 text-sm text-muted-foreground"><Link href="/templates" className="hover:underline">Templates</Link> /</div>
      <PageHeader
        title={t.name}
        description={`${TEMPLATE_KIND[t.kind] ?? t.kind} template · ${LANG[t.language] ?? t.language} · v${t.version}`}
        actions={
          <>
            {t.isStarter && can("documents.write") && <Button variant="outline" disabled={busy} onClick={() => void act("/copy", undefined, "Copied to your templates")}><Copy className="size-4" /> Copy to my templates</Button>}
            {t.editable && ["DRAFT", "REJECTED"].includes(t.status) && can("documents.write") && <Button variant="outline" disabled={busy} onClick={() => void act("/submit", undefined, "Sent for legal review")}><Send className="size-4" /> Submit for review</Button>}
            {t.editable && t.status === "UNDER_REVIEW" && can("documents.review") && (
              <>
                <Button disabled={busy} onClick={() => void act("/review", { decision: "approve" }, "Approved")}><CheckCircle2 className="size-4" /> Approve</Button>
                <Button variant="outline" disabled={busy} onClick={() => void act("/review", { decision: "reject" }, "Rejected")}><XCircle className="size-4" /> Reject</Button>
              </>
            )}
            {t.editable && ["DRAFT", "REJECTED"].includes(t.status) && can("documents.write") && <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => void remove()}><Trash2 className="size-4" /></Button>}
          </>
        }
      />
      {t.status !== "APPROVED_TEMPLATE" && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <ShieldAlert className="size-4" /> Not approved — PDFs generated from this template carry a &quot;TEMPLATE NOT APPROVED&quot; watermark.
        </div>
      )}
      <div className="grid gap-6">
        <SectionCard title={<span className="flex items-center gap-2">Details <StatusPill status={t.status} /> {t.isStarter && <Pill tone="sky">platform starter</Pill>}</span>}>
          <InfoGrid
            items={[
              ["Approved", t.approvedAt && fmtDate(t.approvedAt, true)],
              ["Updated", fmtDate(t.updatedAt, true)],
              ["Merge fields", (t.variables ?? []).length ? <span className="flex flex-wrap gap-1">{(t.variables ?? []).map((v) => <code key={v} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{v}</code>)}</span> : null],
              ["Versions", t.history?.length ? <span className="flex flex-wrap gap-1">{t.history.map((h) => <Link key={h.id} href={`/templates/${h.id}`} className={`rounded border px-1.5 text-xs ${h.id === t.id ? "border-primary text-primary" : "hover:bg-muted"}`}>v{h.version} · {h.status.toLowerCase().replace(/_/g, " ")}</Link>)}</span> : null],
              ["Signed in as", me?.user.email],
            ]}
          />
        </SectionCard>
        <div className="grid gap-6 xl:grid-cols-2">
          <SectionCard title="HTML body" action={editable && draft !== null && <Button size="sm" disabled={busy} onClick={() => void save()}>{t.status === "APPROVED_TEMPLATE" ? "Save as new version" : "Save"}</Button>}>
            <textarea
              value={body}
              readOnly={!editable}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
              className="h-[560px] w-full rounded-lg border border-input bg-muted/30 p-3 font-mono text-xs leading-relaxed outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            {!editable && <p className="mt-2 text-xs text-muted-foreground">{t.isStarter ? "Starter templates are read-only — copy it to edit." : "Read-only in this status."}</p>}
          </SectionCard>
          <SectionCard title="Preview (sample data)">
            <iframe title="Template preview" sandbox="" srcDoc={preview(body)} className="h-[560px] w-full rounded-lg border bg-white" />
          </SectionCard>
        </div>
      </div>
    </>
  );
}
