"use client";
import Link from "next/link";
import { use, useState } from "react";
import { CheckCircle2, Download, FileText, FileUp, Languages, Loader2, Lock, Pencil, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/app-shell";
import { DataTable, Pill, Td } from "@/components/data-table";
import { Field, NativeSelect } from "@/components/field";
import { DetailSkeleton, FormDialog, InfoGrid, SectionCard, useFetch } from "@/components/catalog";
import { downloadVersion, StatusPill, UploadDialog, VersionBadges } from "@/components/documents";
import { api, errMsg, fmtDate } from "@/lib/api";
import { AGREEMENT_TYPE, CATEGORY_LABEL, DOC_STATUS, fmtBytes, LANG } from "@/lib/documents";
import { useSession } from "@/lib/session";

type Agreement = {
  id: string; title: string; type: string; status: string; languages: string[]; territories: string[]; effectiveDate: string | null; expiryDate: string | null;
  executionDate: string | null; signatureProvider: string | null; signatureRef: string | null; locked: boolean; templateVersion: number | null;
  consideration: { amount?: number; currency?: string; terms?: string } | null; clauses: Record<string, string> | null;
  template: { id: string; name: string; language: string; version: number; status: string } | null;
  annexureSnapshot: { items: unknown[]; executedSha256?: string; frozenAt?: string } | null;
  parties: { id: string; role: string; signatoryName: string | null; signedAt: string | null; party: { id: string; legalName: string; address: string | null } }[];
  annexure: { no: number; kind: string; title: string; version: string; code: string; work: string; language: string; duration: string; id: string }[];
  documents: { id: string; title: string; category: string; status: string; versions: { id: string; versionNo: number; filename: string; sha256: string; isGenerated: boolean; createdAt: string; sizeBytes: number; scanStatus: string; mime?: string }[] }[];
  history: { id: string; action: string; actorEmail: string | null; createdAt: string }[];
};

const NEXT: Record<string, string[]> = {
  DRAFT: ["UNDER_REVIEW", "SENT_FOR_SIGNATURE", "REJECTED"],
  UNDER_REVIEW: ["DRAFT", "SENT_FOR_SIGNATURE", "REJECTED"],
  SENT_FOR_SIGNATURE: ["DRAFT", "EXECUTED", "REJECTED"],
  REJECTED: ["DRAFT"],
  EXECUTED: ["EXPIRED"],
};

export default function AgreementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useSession();
  const { data: a, error, reload } = useFetch<Agreement>(`/agreements/${id}`);
  const [working, setWorking] = useState<string | null>(null);
  const [upload, setUpload] = useState(false);
  const [execute, setExecute] = useState(false);
  const [nocLang, setNocLang] = useState("hi");
  const [nocMode, setNocMode] = useState("separate");
  if (!a) return <DetailSkeleton error={error} />;
  const write = can("rights.write");
  const genDocs = can("documents.write");
  const signed = a.documents.filter((d) => d.versions[0] && !d.versions[0].isGenerated && !["SUPERSEDED", "REJECTED"].includes(d.status));

  async function run(key: string, path: string, json: unknown, msg: string) {
    setWorking(key);
    try {
      await api(`/agreements/${id}${path}`, { json });
      toast.success(msg);
      void reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setWorking(null);
    }
  }
  async function status(s: string) {
    if (s === "EXECUTED") return setExecute(true);
    await run(`status-${s}`, "/status", { status: s }, `Marked ${DOC_STATUS[s].label.toLowerCase()}`);
  }
  async function doExecute(f: FormData) {
    const g = (k: string) => String(f.get(k) ?? "").trim() || undefined;
    await run("execute", "/status", { status: "EXECUTED", executedDocumentId: g("doc"), executionDate: g("date"), signatureProvider: g("provider") ?? null, signatureRef: g("ref") ?? null }, "Executed — agreement and Annexure-A are now locked");
    setExecute(false);
  }
  const c = a.consideration ?? {};
  const busy = (k: string) => working === k;
  const spin = (k: string) => (busy(k) ? <Loader2 className="size-4 animate-spin" /> : null);

  return (
    <>
      <div className="mb-2 text-sm text-muted-foreground"><Link href="/agreements" className="hover:underline">Agreements</Link> /</div>
      <PageHeader
        title={a.title}
        description={`${AGREEMENT_TYPE[a.type] ?? a.type} · ${a.languages.map((l) => LANG[l] ?? l).join(" + ")}`}
        actions={write && !a.locked && <Link href={`/agreements/${id}/edit`} className={buttonVariants({ variant: "outline" })}><Pencil className="size-4" /> Edit</Link>}
      />
      {a.locked ? (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          <Lock className="mt-0.5 size-4 shrink-0" />
          <span>Executed on {fmtDate(a.executionDate)} and locked. Annexure-A ({a.annexureSnapshot?.items.length ?? 0} songs) is frozen{a.annexureSnapshot?.executedSha256 ? <> · signed copy SHA-256 <code className="text-xs">{a.annexureSnapshot.executedSha256.slice(0, 16)}…</code></> : null}.</span>
        </div>
      ) : (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" /> Draft — generated PDFs are unsigned and are not ownership evidence. Upload the signed copy and mark the agreement executed.
        </div>
      )}
      <div className="grid gap-6">
        <SectionCard
          title={<span className="flex items-center gap-2">Agreement <StatusPill status={a.status} /></span>}
          action={write && (NEXT[a.status]?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-2">
              {NEXT[a.status].map((s) => <Button key={s} size="sm" variant={s === "EXECUTED" ? "default" : "outline"} disabled={!!working} onClick={() => void status(s)}>{spin(`status-${s}`)}{s === "EXECUTED" ? "Mark executed…" : DOC_STATUS[s].label}</Button>)}
            </div>
          )}
        >
          <InfoGrid
            items={[
              ["Territories", a.territories.join(", ")],
              ["Effective", a.effectiveDate && fmtDate(a.effectiveDate)],
              ["Expiry", a.expiryDate ? fmtDate(a.expiryDate) : "Perpetual"],
              ["Consideration", c.amount != null ? `${c.currency ?? "INR"} ${Number(c.amount).toLocaleString("en-IN")}` : null],
              ["Payment terms", c.terms],
              ["Jurisdiction", a.clauses?.jurisdiction],
              ["Template", a.template ? <Link href={`/templates/${a.template.id}`} className="text-primary hover:underline">{a.template.name} v{a.templateVersion ?? a.template.version}</Link> : "Automatic"],
              ["Signature", a.signatureProvider ? `${a.signatureProvider}${a.signatureRef ? ` · ${a.signatureRef}` : ""}` : null],
            ]}
          />
        </SectionCard>
        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard title={`Parties (${a.parties.length})`}>
            {a.parties.length === 0 ? <p className="text-sm text-muted-foreground">No parties yet — edit the agreement to add them.</p> : (
              <ul className="divide-y rounded-lg border">
                {a.parties.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span><Link href={`/parties/${p.party.id}`} className="font-medium hover:underline">{p.party.legalName}</Link>{p.signatoryName && <span className="text-muted-foreground"> · signs: {p.signatoryName}</span>}</span>
                    <span className="flex items-center gap-2 text-xs"><Pill tone="violet">{p.role.toLowerCase()}</Pill>{p.signedAt ? <Pill tone="green">signed {fmtDate(p.signedAt)}</Pill> : <Pill tone="slate">unsigned</Pill>}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
          <SectionCard title="Generate PDFs">
            <div className="grid gap-3">
              <div className="flex flex-wrap gap-2">
                {a.languages.map((l) => (
                  <Button key={l} variant="outline" disabled={!genDocs || !!working} onClick={() => void run(`render-${l}`, "/render", { language: l }, `${LANG[l]} agreement PDF generated`)}>
                    {busy(`render-${l}`) ? <Loader2 className="size-4 animate-spin" /> : <Languages className="size-4" />} Agreement ({l.toUpperCase()})
                  </Button>
                ))}
                <Button variant="outline" disabled={!genDocs || !!working} onClick={() => void run("annex", "/render", { language: a.languages[0] ?? "en", kind: "annexure" }, "Annexure-A PDF generated")}>
                  {busy("annex") ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />} Annexure-A
                </Button>
              </div>
              <div className="flex flex-wrap items-end gap-2 border-t pt-3">
                <div className="w-36"><NativeSelect label="NOC language" value={nocLang} onChange={(e) => setNocLang(e.target.value)}>{Object.entries(LANG).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</NativeSelect></div>
                <div className="w-48"><NativeSelect label="NOC format" value={nocMode} onChange={(e) => setNocMode(e.target.value)}><option value="separate">One per party</option><option value="consolidated">Single consolidated</option></NativeSelect></div>
                <Button variant="outline" disabled={!genDocs || !!working || !a.parties.length} onClick={() => void run("noc", "/noc", { language: nocLang, mode: nocMode }, "NOC generated")}>{spin("noc")} Generate NOC</Button>
              </div>
              <p className="text-xs text-muted-foreground">PDFs render Hindi (Devanagari) correctly, carry a DRAFT watermark, and are saved below as generated drafts.</p>
            </div>
          </SectionCard>
        </div>
        <SectionCard title={`Annexure-A — ${a.annexure.length} ${a.annexure.length === 1 ? "song" : "songs"}${a.locked ? " (frozen)" : ""}`}>
          <DataTable head={["#", "Title", "Type", "ISRC / ISWC", "Version", "Language", "Duration"]}>
            {a.annexure.length === 0 && <tr><Td colSpan={7} className="text-center text-muted-foreground">No songs — edit the agreement to add them.</Td></tr>}
            {a.annexure.map((r) => (
              <tr key={`${r.kind}-${r.id}`}>
                <Td>{r.no}</Td>
                <Td className="font-medium"><Link href={`/${r.kind === "Work" ? "works" : "recordings"}/${r.id}`} className="hover:underline">{r.title}</Link>{r.work && r.work !== r.title && <div className="text-xs text-muted-foreground">{r.work}</div>}</Td>
                <Td className="text-xs">{r.kind}</Td>
                <Td className="font-mono text-xs">{r.code || "—"}</Td>
                <Td className="text-xs">{r.version || "—"}</Td>
                <Td className="text-xs">{r.language || "—"}</Td>
                <Td className="text-xs">{r.duration || "—"}</Td>
              </tr>
            ))}
          </DataTable>
        </SectionCard>
        <SectionCard title={`Documents (${a.documents.length})`} action={genDocs && !a.locked && <Button size="sm" onClick={() => setUpload(true)}><FileUp className="size-4" /> Upload signed copy</Button>}>
          <DataTable head={["Document", "Category", "Status", "Latest file", ""]}>
            {a.documents.length === 0 && <tr><Td colSpan={5} className="text-center text-muted-foreground">Nothing yet — generate a PDF or upload the signed agreement.</Td></tr>}
            {a.documents.map((d) => {
              const v = d.versions[0];
              return (
                <tr key={d.id}>
                  <Td className="font-medium"><Link href={`/documents/${d.id}`} className="hover:underline">{d.title}</Link></Td>
                  <Td className="text-xs">{CATEGORY_LABEL[d.category] ?? d.category}</Td>
                  <Td><StatusPill status={d.status} /></Td>
                  <Td className="text-xs">{v && <div className="grid gap-1"><span className="text-muted-foreground">v{v.versionNo} · {fmtBytes(v.sizeBytes)} · {fmtDate(v.createdAt, true)}</span><VersionBadges v={{ ...v, mime: v.mime ?? "" }} /></div>}</Td>
                  <Td className="text-right">{v && <Button variant="ghost" size="icon" aria-label="Download" onClick={() => void downloadVersion(d.id, v.id)}><Download className="size-4" /></Button>}</Td>
                </tr>
              );
            })}
          </DataTable>
        </SectionCard>
        <SectionCard title="History">
          <ul className="divide-y text-sm">
            {a.history.map((h) => (
              <li key={h.id} className="flex justify-between gap-4 py-2"><span className="font-mono text-xs">{h.action}</span><span className="text-xs text-muted-foreground">{h.actorEmail ?? "system"} · {fmtDate(h.createdAt, true)}</span></li>
            ))}
          </ul>
        </SectionCard>
      </div>
      <UploadDialog open={upload} onOpenChange={setUpload} owner={{ type: "AGREEMENT", id }} defaultCategory="AGREEMENT" title="Upload signed agreement" onDone={() => void reload()} />
      <FormDialog open={execute} onOpenChange={setExecute} title="Mark agreement executed" description="Pick the uploaded signed copy. The agreement, its parties and Annexure-A will be locked permanently." onSubmit={(f) => void doExecute(f)} busy={busy("execute")} submitLabel="Execute & lock">
        {signed.length === 0 ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">Upload the signed copy first — generated drafts cannot be used as the executed document.</p>
        ) : (
          <NativeSelect label="Signed document" name="doc" required defaultValue={signed[0].id}>
            {signed.map((d) => <option key={d.id} value={d.id}>{d.title} · v{d.versions[0].versionNo}</option>)}
          </NativeSelect>
        )}
        <Field label="Execution date" name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Signature method" name="provider" placeholder="Wet ink, Aadhaar eSign, DocuSign…" />
          <Field label="Reference" name="ref" placeholder="Envelope / transaction ID" />
        </div>
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="size-3.5" /> Requires the Legal reviewer permission.</p>
      </FormDialog>
    </>
  );
}
