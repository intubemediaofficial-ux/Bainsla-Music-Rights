"use client";
import Link from "next/link";
import { use, useState } from "react";
import { Download, FileUp, Lock, Pencil, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app-shell";
import { DataTable, Td } from "@/components/data-table";
import { Field, NativeSelect } from "@/components/field";
import { DetailSkeleton, FormDialog, InfoGrid, SectionCard, TextArea, useFetch } from "@/components/catalog";
import { downloadVersion, StatusPill, UploadDialog, VersionBadges } from "@/components/documents";
import { api, errMsg, fmtDate } from "@/lib/api";
import { isoDay } from "@/lib/catalog";
import { CATEGORIES, CATEGORY_LABEL, Doc, DOC_FLOW, DOC_STATUS, fmtBytes, OWNER_LABEL, ownerHref } from "@/lib/documents";
import { useSession } from "@/lib/session";

export default function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useSession();
  const router = useRouter();
  const { data: d, error, reload } = useFetch<Doc>(`/documents/${id}`);
  const [upload, setUpload] = useState(false);
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!d) return <DetailSkeleton error={error} />;
  const write = can("documents.write");
  const latest = d.versions[0];
  const href = ownerHref(d.ownerType, d.ownerId);

  async function setStatus(status: string) {
    if (status === "EXECUTED" && !confirm("Mark as executed? The document will be locked — no new versions or edits.")) return;
    try {
      await api(`/documents/${id}/status`, { json: { status } });
      toast.success(`Marked ${DOC_STATUS[status].label.toLowerCase()}`);
      void reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }
  async function save(f: FormData) {
    setBusy(true);
    const s = (k: string) => (String(f.get(k) ?? "").trim() || null);
    try {
      await api(`/documents/${id}`, { method: "PATCH", json: d!.locked ? { notes: s("notes"), expiresAt: s("expiresAt") } : { title: s("title") ?? d!.title, category: s("category"), signatoryName: s("signatoryName"), signedDate: s("signedDate"), expiresAt: s("expiresAt"), notes: s("notes") } });
      setEdit(false);
      void reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!confirm("Delete this draft document and all its versions?")) return;
    try {
      await api(`/documents/${id}`, { method: "DELETE" });
      router.push("/documents");
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  return (
    <>
      <div className="mb-2 text-sm text-muted-foreground"><Link href="/documents" className="hover:underline">Documents</Link> /</div>
      <PageHeader
        title={d.title}
        description={`${CATEGORY_LABEL[d.category] ?? d.category} · ${OWNER_LABEL[d.ownerType] ?? d.ownerType}${d.owner ? ` · ${d.owner}` : ""}`}
        actions={
          <>
            {latest && <Button variant="outline" onClick={() => void downloadVersion(d.id, latest.id)}><Download className="size-4" /> Download</Button>}
            {write && !d.locked && d.status !== "EXPIRED" && <Button variant="outline" onClick={() => setUpload(true)}><FileUp className="size-4" /> New version</Button>}
            {write && <Button variant="outline" onClick={() => setEdit(true)}><Pencil className="size-4" /> Edit</Button>}
            {write && ["DRAFT", "REJECTED"].includes(d.status) && <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => void remove()}><Trash2 className="size-4" /></Button>}
          </>
        }
      />
      {d.locked && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          <Lock className="size-4" /> {d.status === "EXECUTED" ? "Executed and locked — this version is preserved as evidence and cannot be changed." : "Superseded — kept for history only."}
        </div>
      )}
      {latest?.isGenerated && d.status !== "SUPERSEDED" && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <ShieldAlert className="size-4" /> This is a system-generated, unsigned draft. It is not evidence of ownership until a signed copy is uploaded and executed.
        </div>
      )}
      <div className="grid gap-6">
        <SectionCard
          title={<span className="flex items-center gap-2">Details <StatusPill status={d.status} /></span>}
          action={can("documents.review") && (DOC_FLOW[d.status]?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-2">
              {DOC_FLOW[d.status].map((s) => <Button key={s} size="sm" variant={s === "EXECUTED" ? "default" : "outline"} onClick={() => void setStatus(s)}>{DOC_STATUS[s].label}</Button>)}
            </div>
          )}
        >
          <InfoGrid
            items={[
              ["Attached to", href ? <Link href={href} className="text-primary hover:underline">{d.owner ?? d.ownerId}</Link> : d.owner ?? OWNER_LABEL[d.ownerType]],
              ["Signatory", d.signatoryName],
              ["Signed on", d.signedDate && fmtDate(d.signedDate)],
              ["Expires", d.expiresAt && fmtDate(d.expiresAt)],
              ["Created", fmtDate(d.createdAt, true)],
              ["Notes", d.notes],
            ]}
          />
        </SectionCard>
        <SectionCard title={`Versions (${d.versions.length})`}>
          <DataTable head={["#", "File", "Size", "SHA-256", "Checks", "Uploaded", ""]}>
            {d.versions.map((v) => (
              <tr key={v.id}>
                <Td className="font-medium">v{v.versionNo}</Td>
                <Td className="max-w-56 truncate text-xs" title={v.filename}>{v.filename}</Td>
                <Td className="whitespace-nowrap text-xs">{fmtBytes(v.sizeBytes)}</Td>
                <Td className="font-mono text-[11px] text-muted-foreground" title={v.sha256}>{v.sha256.slice(0, 16)}…</Td>
                <Td><VersionBadges v={v} /></Td>
                <Td className="whitespace-nowrap text-xs">{fmtDate(v.createdAt, true)}</Td>
                <Td className="text-right"><Button variant="ghost" size="icon" aria-label="Download" onClick={() => void downloadVersion(d.id, v.id)}><Download className="size-4" /></Button></Td>
              </tr>
            ))}
          </DataTable>
        </SectionCard>
        <SectionCard title="History">
          <ul className="divide-y text-sm">
            {(d.history ?? []).map((h) => (
              <li key={h.id} className="flex justify-between gap-4 py-2">
                <span className="font-mono text-xs">{h.action}</span>
                <span className="text-xs text-muted-foreground">{h.actorEmail ?? "system"} · {fmtDate(h.createdAt, true)}</span>
              </li>
            ))}
            {!d.history?.length && <li className="py-2 text-muted-foreground">No events.</li>}
          </ul>
        </SectionCard>
      </div>
      <UploadDialog open={upload} onOpenChange={setUpload} documentId={d.id} title="Upload new version" onDone={() => void reload()} />
      <FormDialog open={edit} onOpenChange={setEdit} title="Edit document" description={d.locked ? "Locked documents only allow notes and expiry changes." : undefined} onSubmit={(f) => void save(f)} busy={busy} wide>
        {!d.locked && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" name="title" defaultValue={d.title} required />
            <NativeSelect label="Category" name="category" defaultValue={d.category}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </NativeSelect>
            <Field label="Signatory name" name="signatoryName" defaultValue={d.signatoryName ?? ""} />
            <Field label="Signed on" name="signedDate" type="date" defaultValue={isoDay(d.signedDate)} />
          </div>
        )}
        <Field label="Expires on" name="expiresAt" type="date" defaultValue={isoDay(d.expiresAt)} />
        <TextArea label="Notes" name="notes" defaultValue={d.notes ?? ""} />
      </FormDialog>
    </>
  );
}
