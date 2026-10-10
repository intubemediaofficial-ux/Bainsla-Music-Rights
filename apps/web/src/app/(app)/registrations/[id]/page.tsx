"use client";
import Link from "next/link";
import { use, useState } from "react";
import { Info, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app-shell";
import { Field } from "@/components/field";
import { DetailSkeleton, FormDialog, InfoGrid, SectionCard, TextArea, useFetch } from "@/components/catalog";
import { DocumentsCard } from "@/components/documents";
import { GeneratePackageButton, StatusTag } from "@/components/cases";
import { api, errMsg, fmtDate } from "@/lib/api";
import { assetHref, isoDay, str } from "@/lib/catalog";
import { assetCode, assetTitle, REG_STATUS, type AssetLite } from "@/lib/cases";
import { useSession } from "@/lib/session";

type Reg = AssetLite & {
  id: string; workId: string | null; recordingId: string | null; jurisdiction: string; registry: string; category: string | null; applicationNo: string | null; diaryNo: string | null; registrationNo: string | null;
  filedAt: string | null; registeredAt: string | null; status: string; nextDeadline: string | null; objectionNote: string | null; notes: string | null; next: string[];
  history: { id: string; action: string; actorEmail: string | null; createdAt: string }[];
};

export default function RegistrationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useSession();
  const router = useRouter();
  const { data: r, error, reload } = useFetch<Reg>(`/registrations/${id}`);
  const [move, setMove] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!r) return <DetailSkeleton error={error} />;
  const w = can("registrations.write");

  async function run(fn: () => Promise<unknown>, ok: string, after?: () => void) {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      after?.();
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
        title={`${assetTitle(r)} — ${r.registry}`}
        description={r.assetType === "WORK" ? "Musical work registration" : "Sound recording registration"}
        actions={<div className="flex flex-wrap gap-2">
          {r.workId || r.recordingId ? can("packages.generate") && <GeneratePackageButton assetType={r.assetType as "WORK" | "RECORDING"} assetId={(r.workId ?? r.recordingId)!} /> : null}
          {w && <Button variant="outline" onClick={() => setEdit(true)}><Pencil className="size-4" /> Edit</Button>}
          {w && r.status === "PLANNED" && <Button variant="outline" onClick={() => void run(() => api(`/registrations/${id}`, { method: "DELETE" }), "Deleted", () => router.push("/registrations"))}><Trash2 className="size-4" /></Button>}
        </div>}
      />
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        <Info className="mt-0.5 size-4 shrink-0" /> Tracking only — Music Rights Cloud does not file anything with the Copyright Office or any society. Enter the numbers the registry gives you.
      </div>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <SectionCard title={<span className="flex items-center gap-2">Status <StatusTag map={REG_STATUS} status={r.status} /></span>}>
          <InfoGrid items={[
            ["Song", <Link key="a" href={assetHref(r)} className="text-primary hover:underline">{assetTitle(r)}{assetCode(r) ? ` · ${assetCode(r)}` : ""}</Link>],
            ["Registry", r.registry], ["Jurisdiction", r.jurisdiction], ["Category", r.category ?? "—"],
            ["Diary no.", r.diaryNo ?? "—"], ["Application no.", r.applicationNo ?? "—"], ["Registration no.", r.registrationNo ?? "—"],
            ["Filed", fmtDate(r.filedAt)], ["Registered", fmtDate(r.registeredAt)], ["Next deadline", fmtDate(r.nextDeadline)],
          ]} />
          {r.objectionNote && <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm"><b>Objection:</b> {r.objectionNote}</div>}
          {r.notes && <div className="mt-4 whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm">{r.notes}</div>}
          {w && r.next.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
              <span className="self-center text-xs text-muted-foreground">Move to:</span>
              {r.next.map((s) => <Button key={s} size="sm" variant={s === "REGISTERED" ? "default" : "outline"} onClick={() => setMove(s)}>{REG_STATUS[s]?.label ?? s}</Button>)}
            </div>
          )}
        </SectionCard>
        <SectionCard title="History">
          <ul className="grid gap-2 text-sm">
            {r.history.map((h) => <li key={h.id} className="flex justify-between gap-2"><span>{h.action.replace("registration.", "")} <span className="text-xs text-muted-foreground">{h.actorEmail}</span></span><span className="text-xs text-muted-foreground">{fmtDate(h.createdAt, true)}</span></li>)}
          </ul>
        </SectionCard>
      </div>
      <div className="mt-6"><DocumentsCard ownerType="REGISTRATION" ownerId={id} /></div>

      <FormDialog open={!!move} onOpenChange={(o) => !o && setMove(null)} title={`Mark as ${move ? REG_STATUS[move]?.label : ""}`} busy={busy} submitLabel="Update status"
        onSubmit={(f) => void run(() => api(`/registrations/${id}/status`, { method: "POST", json: { status: move, registrationNo: str(f, "registrationNo"), date: str(f, "date"), note: str(f, "note") } }), "Status updated", () => setMove(null))}>
        {move === "REGISTERED" && <Field label="Registration no." name="registrationNo" required defaultValue={r.registrationNo ?? ""} />}
        <Field label="Date" name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
        <TextArea label={move === "OBJECTION" ? "Objection details" : "Note"} name="note" rows={3} />
      </FormDialog>
      <FormDialog open={edit} onOpenChange={setEdit} title="Edit registration" busy={busy} wide
        onSubmit={(f) => void run(() => api(`/registrations/${id}`, { method: "PATCH", json: { registry: str(f, "registry") ?? undefined, category: str(f, "category"), diaryNo: str(f, "diaryNo"), applicationNo: str(f, "applicationNo"), ...(r.status === "REGISTERED" ? {} : { registrationNo: str(f, "registrationNo") }), filedAt: str(f, "filedAt"), nextDeadline: str(f, "nextDeadline"), notes: str(f, "notes") } }), "Saved", () => setEdit(false))}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Registry" name="registry" defaultValue={r.registry} />
          <Field label="Category" name="category" defaultValue={r.category ?? ""} />
          <Field label="Diary no." name="diaryNo" defaultValue={r.diaryNo ?? ""} />
          <Field label="Application no." name="applicationNo" defaultValue={r.applicationNo ?? ""} />
          <Field label="Registration no." name="registrationNo" defaultValue={r.registrationNo ?? ""} disabled={r.status === "REGISTERED"} />
          <Field label="Filed on" name="filedAt" type="date" defaultValue={isoDay(r.filedAt)} />
          <Field label="Next deadline" name="nextDeadline" type="date" defaultValue={isoDay(r.nextDeadline)} />
        </div>
        <TextArea label="Notes" name="notes" rows={4} defaultValue={r.notes ?? ""} />
      </FormDialog>
    </>
  );
}
