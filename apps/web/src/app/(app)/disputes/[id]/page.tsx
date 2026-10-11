"use client";
import Link from "next/link";
import { use, useState } from "react";
import { ExternalLink, MessageSquarePlus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app-shell";
import { DataTable, Pill, Td } from "@/components/data-table";
import { Field, NativeSelect } from "@/components/field";
import { DetailSkeleton, FormDialog, InfoGrid, SectionCard, TextArea, useFetch } from "@/components/catalog";
import { DocumentsCard } from "@/components/documents";
import { GeneratePackageButton, StatusTag } from "@/components/cases";
import { api, errMsg, fmtDate } from "@/lib/api";
import { assetHref, CLAIM_STATUS, isoDay, pct, RIGHT_LABEL, str } from "@/lib/catalog";
import { assetCode, assetTitle, DISPUTE_STATUS, EVENT_TYPE, isOverdue, type AssetLite } from "@/lib/cases";
import { useSession } from "@/lib/session";

type Dispute = AssetLite & {
  id: string; workId: string | null; recordingId: string | null; counterparty: string; platform: string; caseNo: string | null; claimType: string | null; contentUrl: string | null;
  status: string; deadline: string | null; resolution: string | null; openedAt: string; resolvedAt: string | null; closed: boolean;
  events: { id: string; type: string; body: string; occurredAt: string; dueAt: string | null; documentId: string | null }[];
  claims: { id: string; rightType: string; sharePercent: string; status: string; party: { id: string; legalName: string } }[];
  documents: { id: string; title: string }[];
  history: { id: string; action: string; actorEmail: string | null; createdAt: string }[];
};
const EVENT_TONE: Record<string, "slate" | "violet" | "sky" | "amber" | "green"> = { NOTE: "slate", CORRESPONDENCE: "sky", EVIDENCE: "violet", DEADLINE: "amber", STATUS_CHANGE: "green" };

export default function DisputePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useSession();
  const { data: d, error, reload } = useFetch<Dispute>(`/disputes/${id}`);
  const [dlg, setDlg] = useState<"event" | "status" | "edit" | null>(null);
  const [busy, setBusy] = useState(false);
  if (!d) return <DetailSkeleton error={error} />;
  const w = can("disputes.write");
  const assetId = (d.workId ?? d.recordingId)!;

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      setDlg(null);
      await reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title={`${assetTitle(d)} vs ${d.counterparty}`}
        description={`${d.platform}${d.claimType ? ` · ${d.claimType}` : ""}${d.caseNo ? ` · ${d.caseNo}` : ""}`}
        actions={<div className="flex flex-wrap gap-2">
          {can("packages.generate") && <GeneratePackageButton assetType={d.assetType as "WORK" | "RECORDING"} assetId={assetId} />}
          {w && <Button variant="outline" onClick={() => setDlg("status")}>Change status</Button>}
          {w && !d.closed && <Button variant="outline" onClick={() => setDlg("edit")}><Pencil className="size-4" /></Button>}
        </div>}
      />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="grid content-start gap-6">
          <SectionCard title={<span className="flex items-center gap-2">Case <StatusTag map={DISPUTE_STATUS} status={d.status} /></span>}>
            <InfoGrid items={[
              ["Song", <Link key="a" href={assetHref(d)} className="text-primary hover:underline">{assetTitle(d)}{assetCode(d) ? ` · ${assetCode(d)}` : ""}</Link>],
              ["Counterparty", d.counterparty], ["Platform", d.platform], ["Case / claim ID", d.caseNo ?? "—"], ["Claim type", d.claimType ?? "—"],
              ["Content", d.contentUrl ? <a key="u" href={d.contentUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-primary hover:underline">Open <ExternalLink className="size-3" /></a> : "—"],
              ["Deadline", d.deadline ? (isOverdue(d.deadline) && !d.closed ? <Pill key="dl" tone="red">{fmtDate(d.deadline)} overdue</Pill> : fmtDate(d.deadline)) : "—"],
              ["Opened", fmtDate(d.openedAt)], ["Resolved", fmtDate(d.resolvedAt)],
            ]} />
            {d.resolution && <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm"><b>Outcome:</b> {d.resolution}</div>}
          </SectionCard>
          <SectionCard title="Timeline" action={w && <Button size="sm" onClick={() => setDlg("event")}><MessageSquarePlus className="size-4" /> Add entry</Button>}>
            <ol className="relative grid gap-4 border-l pl-5">
              {d.events.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[26px] top-1 size-3 rounded-full border-2 border-background bg-primary" />
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Pill tone={EVENT_TONE[e.type] ?? "slate"}>{EVENT_TYPE[e.type] ?? e.type}</Pill>{fmtDate(e.occurredAt, true)}{e.dueAt && <span>· due {fmtDate(e.dueAt)}</span>}</div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{e.body}</p>
                  {e.documentId && <Link href={`/documents/${e.documentId}`} className="text-xs text-primary hover:underline">Attached document →</Link>}
                </li>
              ))}
            </ol>
          </SectionCard>
        </div>
        <div className="grid content-start gap-6">
          <SectionCard title="Ownership on record">
            {d.claims.length ? (
              <DataTable head={["Party", "Right", "Share", "Status"]}>
                {d.claims.map((c) => (
                  <tr key={c.id}><Td className="text-xs"><Link href={`/parties/${c.party.id}`} className="hover:underline">{c.party.legalName}</Link></Td><Td className="text-xs">{RIGHT_LABEL[c.rightType] ?? c.rightType}</Td><Td className="text-xs">{pct(c.sharePercent)}</Td><Td><Pill tone={CLAIM_STATUS[c.status]?.tone ?? "slate"}>{CLAIM_STATUS[c.status]?.label ?? c.status}</Pill></Td></tr>
                ))}
              </DataTable>
            ) : <p className="text-sm text-muted-foreground">No ownership claims recorded for this song — add them before responding.</p>}
          </SectionCard>
          <SectionCard title="History">
            <ul className="grid gap-2 text-sm">{d.history.map((h) => <li key={h.id} className="flex justify-between gap-2"><span>{h.action.replace("dispute.", "")} <span className="text-xs text-muted-foreground">{h.actorEmail}</span></span><span className="text-xs text-muted-foreground">{fmtDate(h.createdAt, true)}</span></li>)}</ul>
          </SectionCard>
        </div>
      </div>
      <div className="mt-6"><DocumentsCard ownerType="DISPUTE" ownerId={id} /></div>

      <FormDialog open={dlg === "event"} onOpenChange={(o) => !o && setDlg(null)} title="Add timeline entry" busy={busy} submitLabel="Add"
        onSubmit={(f) => void run(() => api(`/disputes/${id}/events`, { method: "POST", json: { type: str(f, "type"), body: str(f, "body"), occurredAt: str(f, "occurredAt") ?? undefined, dueAt: str(f, "dueAt"), documentId: str(f, "documentId") } }), "Added")}>
        <NativeSelect label="Type" name="type" defaultValue="NOTE">{["NOTE", "CORRESPONDENCE", "EVIDENCE", "DEADLINE"].map((t) => <option key={t} value={t}>{EVENT_TYPE[t]}</option>)}</NativeSelect>
        <TextArea label="Details" name="body" rows={4} required />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="When" name="occurredAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
          <Field label="Due by (deadline)" name="dueAt" type="date" />
        </div>
        <NativeSelect label="Attach document (upload below first)" name="documentId" defaultValue=""><option value="">None</option>{d.documents.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</NativeSelect>
      </FormDialog>
      <FormDialog open={dlg === "status"} onOpenChange={(o) => !o && setDlg(null)} title="Change status" busy={busy} submitLabel="Update"
        onSubmit={(f) => void run(() => api(`/disputes/${id}/status`, { method: "POST", json: { status: str(f, "status"), note: str(f, "note") } }), "Status updated")}>
        <NativeSelect label="New status" name="status" defaultValue={d.status}>{Object.entries(DISPUTE_STATUS).map(([k, v]) => <option key={k} value={k} disabled={k === d.status}>{v.label}</option>)}</NativeSelect>
        <TextArea label="Note (required when resolving or withdrawing)" name="note" rows={3} />
      </FormDialog>
      <FormDialog open={dlg === "edit"} onOpenChange={(o) => !o && setDlg(null)} title="Edit dispute" busy={busy} wide
        onSubmit={(f) => void run(() => api(`/disputes/${id}`, { method: "PATCH", json: { counterparty: str(f, "counterparty") ?? undefined, platform: str(f, "platform") ?? undefined, caseNo: str(f, "caseNo"), claimType: str(f, "claimType"), contentUrl: str(f, "contentUrl"), deadline: str(f, "deadline") } }), "Saved")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Counterparty" name="counterparty" defaultValue={d.counterparty} required />
          <Field label="Platform" name="platform" defaultValue={d.platform} required />
          <Field label="Case / claim ID" name="caseNo" defaultValue={d.caseNo ?? ""} />
          <Field label="Claim type" name="claimType" defaultValue={d.claimType ?? ""} />
          <Field label="Content URL" name="contentUrl" type="url" defaultValue={d.contentUrl ?? ""} />
          <Field label="Deadline" name="deadline" type="date" defaultValue={isoDay(d.deadline)} />
        </div>
      </FormDialog>
    </>
  );
}
