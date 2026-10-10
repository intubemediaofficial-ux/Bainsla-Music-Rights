"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Download, FileUp, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DataTable, Pill, Td } from "@/components/data-table";
import { Field, NativeSelect } from "@/components/field";
import { FormDialog, SectionCard, StateRows, TextArea, useList } from "@/components/catalog";
import { api, errMsg, fmtDate } from "@/lib/api";
import { Page, qs } from "@/lib/catalog";
import { CATEGORIES, CATEGORY_LABEL, Doc, DOC_STATUS, fmtBytes, OWNER_LABEL, SCAN_STATUS, Version } from "@/lib/documents";
import { useSession } from "@/lib/session";

export async function downloadVersion(docId: string, versionId: string) {
  try {
    const { url } = await api<{ url: string }>(`/documents/${docId}/versions/${versionId}/link`);
    window.location.href = url;
  } catch (e) {
    toast.error(errMsg(e));
  }
}

export function VersionBadges({ v }: { v: Version }) {
  const s = SCAN_STATUS[v.scanStatus] ?? { label: v.scanStatus, tone: "slate" as const };
  return (
    <span className="inline-flex flex-wrap gap-1">
      {v.isGenerated && <Pill tone="amber">generated draft · not evidence</Pill>}
      <Pill tone={s.tone}>{s.label}</Pill>
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const s = DOC_STATUS[status] ?? { label: status, tone: "slate" as const };
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

const PICK_TYPES = ["ORGANIZATION", "RECORDING", "WORK", "RELEASE", "PARTY", "AGREEMENT"];
const LIST_PATH: Record<string, string> = { RECORDING: "/recordings", WORK: "/works", RELEASE: "/releases", PARTY: "/parties", AGREEMENT: "/agreements" };

function OwnerPicker() {
  const { me } = useSession();
  const [type, setType] = useState("RECORDING");
  const [items, setItems] = useState<{ id: string; label: string }[]>([]);
  useEffect(() => {
    if (type === "ORGANIZATION") return;
    api<Page<{ id: string; title?: string; legalName?: string; isrc?: string | null }>>(`${LIST_PATH[type]}?limit=200`).then(
      (r) => setItems(r.data.map((x) => ({ id: x.id, label: `${x.title ?? x.legalName ?? x.id}${x.isrc ? ` · ${x.isrc}` : ""}` }))),
      () => setItems([]),
    );
  }, [type]);
  return (
    <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
      <NativeSelect label="Attach to" name="ownerType" value={type} onChange={(e) => { setItems([]); setType(e.target.value); }}>
        {PICK_TYPES.map((t) => <option key={t} value={t}>{OWNER_LABEL[t]}</option>)}
      </NativeSelect>
      {type === "ORGANIZATION" ? (
        <>
          <input type="hidden" name="ownerId" value={me?.activeOrg?.id ?? ""} />
          <div className="self-end pb-2 text-sm text-muted-foreground">{me?.activeOrg?.displayName} (company-wide)</div>
        </>
      ) : (
        <NativeSelect label={OWNER_LABEL[type]} name="ownerId" required defaultValue="" key={type}>
          <option value="" disabled>Choose…</option>
          {items.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
        </NativeSelect>
      )}
    </div>
  );
}

/** Upload a new document (owner given or picked) or a new version of an existing one. */
export function UploadDialog({
  open, onOpenChange, owner, documentId, defaultCategory = "EVIDENCE", title = "Upload document", onDone,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; owner?: { type: string; id: string }; documentId?: string; defaultCategory?: string; title?: string;
  onDone: (r: { id: string }) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function submit(f: FormData) {
    const file = f.get("file");
    if (!(file instanceof File) || !file.size) return toast.error("Choose a file");
    const fd = new FormData();
    if (owner) { fd.set("ownerType", owner.type); fd.set("ownerId", owner.id); }
    for (const [k, v] of f.entries()) if (v instanceof File ? v.size : String(v).trim()) fd.set(k, v);
    setBusy(true);
    try {
      const r = await api<{ id: string; documentId?: string }>(documentId ? `/documents/${documentId}/versions` : "/documents", { method: "POST", body: fd });
      toast.success(documentId ? "New version uploaded" : "Document uploaded");
      onOpenChange(false);
      onDone({ id: r.documentId ?? r.id });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={title} description="PDF, image, Word/Excel, text or audio up to 25 MB. Files are encrypted at rest and checksummed (SHA-256)." onSubmit={(f) => void submit(f)} busy={busy} submitLabel="Upload" wide>
      <Field label="File" name="file" type="file" required accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.docx,.xlsx,.mp3,.wav" />
      {!documentId && (
        <>
          {!owner && <OwnerPicker />}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" name="title" placeholder="Defaults to the file name" />
            <NativeSelect label="Category" name="category" defaultValue={defaultCategory}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </NativeSelect>
            <Field label="Signatory name" name="signatoryName" placeholder="Who signed it (if signed)" />
            <Field label="Signed on" name="signedDate" type="date" />
            <Field label="Expires on" name="expiresAt" type="date" />
          </div>
          <TextArea label="Notes" name="notes" />
        </>
      )}
    </FormDialog>
  );
}

export function DocumentsTable({ rows, showOwner = true }: { rows: Doc[] | null; showOwner?: boolean }) {
  return (
    <DataTable head={["Document", ...(showOwner ? ["Attached to"] : []), "Category", "Status", "Latest file", ""]}>
      <StateRows rows={rows} cols={showOwner ? 6 : 5} empty="No documents yet." />
      {rows?.map((d) => {
        const v = d.versions[0];
        return (
          <tr key={d.id} className="hover:bg-muted/30">
            <Td className="font-medium"><Link href={`/documents/${d.id}`} className="hover:underline">{d.title}</Link></Td>
            {showOwner && <Td className="text-xs"><span className="text-muted-foreground">{OWNER_LABEL[d.ownerType] ?? d.ownerType}</span>{d.owner ? ` · ${d.owner}` : ""}</Td>}
            <Td className="text-xs">{CATEGORY_LABEL[d.category] ?? d.category}</Td>
            <Td><StatusPill status={d.status} /></Td>
            <Td className="text-xs">
              {v ? (
                <div className="grid gap-1">
                  <span className="text-muted-foreground">v{v.versionNo} · {fmtBytes(v.sizeBytes)} · {fmtDate(v.createdAt)}</span>
                  <VersionBadges v={v} />
                </div>
              ) : "—"}
            </Td>
            <Td className="text-right">{v && <Button variant="ghost" size="icon" aria-label="Download" onClick={() => void downloadVersion(d.id, v.id)}><Download className="size-4" /></Button>}</Td>
          </tr>
        );
      })}
    </DataTable>
  );
}

/** Evidence documents attached to a work / recording / party. */
export function DocumentsCard({ ownerType, ownerId }: { ownerType: string; ownerId: string }) {
  const { can } = useSession();
  const list = useList<Doc>("/documents", qs({ ownerType, ownerId, limit: 50 }));
  const [open, setOpen] = useState(false);
  const executed = list.rows?.filter((d) => d.status === "EXECUTED").length ?? 0;
  return (
    <SectionCard
      title={`Documents & evidence (${list.rows?.length ?? 0})`}
      action={can("documents.write") && <Button size="sm" variant="outline" onClick={() => setOpen(true)}><FileUp className="size-4" /> Upload</Button>}
    >
      {list.rows && list.rows.length > 0 && executed === 0 && (
        <p className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          <ShieldAlert className="size-4" /> No executed (signed) document yet — drafts and generated PDFs are not ownership evidence.
        </p>
      )}
      <DocumentsTable rows={list.rows} showOwner={false} />
      <UploadDialog open={open} onOpenChange={setOpen} owner={{ type: ownerType, id: ownerId }} onDone={() => void list.reload()} />
    </SectionCard>
  );
}
