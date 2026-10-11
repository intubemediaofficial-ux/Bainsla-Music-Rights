"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app-shell";
import { DataTable, Pill, Td } from "@/components/data-table";
import { Field } from "@/components/field";
import { AssetField, FormDialog, LoadMore, SearchBox, StateRows, TextArea, Toolbar, useList } from "@/components/catalog";
import { StatusTag } from "@/components/cases";
import { api, errMsg, fmtDate } from "@/lib/api";
import { assetHref, qs, str } from "@/lib/catalog";
import { assetCode, assetTitle, isOverdue, REG_STATUS, type AssetLite } from "@/lib/cases";
import { useSession } from "@/lib/session";

type Row = AssetLite & { id: string; registry: string; category: string | null; status: string; diaryNo: string | null; applicationNo: string | null; registrationNo: string | null; filedAt: string | null; nextDeadline: string | null };

export default function RegistrationsPage() {
  const { can } = useSession();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const list = useList<Row>("/registrations", qs({ q, status }));
  const counts = (list.extra.counts ?? {}) as Record<string, number>;

  async function create(f: FormData) {
    setBusy(true);
    try {
      const r = await api<{ id: string }>("/registrations", {
        method: "POST",
        json: { assetType: str(f, "assetType"), assetId: str(f, "assetId"), registry: str(f, "registry") ?? undefined, category: str(f, "category"), diaryNo: str(f, "diaryNo"), applicationNo: str(f, "applicationNo"), filedAt: str(f, "filedAt"), nextDeadline: str(f, "nextDeadline"), notes: str(f, "notes") },
      });
      toast.success("Registration added");
      router.push(`/registrations/${r.id}`);
    } catch (e) {
      toast.error(errMsg(e));
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Registrations"
        description="Track copyright-office and society registrations you file yourself: diary numbers, objections, hearings and certificates. Nothing is filed with any government system automatically."
        actions={can("registrations.write") && <Button onClick={() => setOpen(true)}><Plus className="size-4" /> Add registration</Button>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {["", ...Object.keys(REG_STATUS)].map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`rounded-full border px-3 py-1 text-xs font-medium transition ${status === s ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>
            {s ? REG_STATUS[s].label : "All"}{s && counts[s] ? <span className="ml-1 opacity-70">{counts[s]}</span> : null}
          </button>
        ))}
      </div>
      <Toolbar><SearchBox value={q} onChange={setQ} placeholder="Search song, diary or registration no…" /></Toolbar>
      <DataTable head={["Song", "Registry", "Diary / application", "Registration no.", "Status", "Filed", "Next deadline"]}>
        <StateRows rows={list.rows} cols={7} empty="No registrations tracked yet." />
        {list.rows?.map((r) => (
          <tr key={r.id} className="hover:bg-muted/30">
            <Td className="font-medium">
              <Link href={`/registrations/${r.id}`} className="hover:underline">{assetTitle(r)}</Link>
              <div className="text-xs text-muted-foreground"><Link href={assetHref(r)} className="hover:underline">{r.assetType === "WORK" ? "Work" : "Recording"}{assetCode(r) ? ` · ${assetCode(r)}` : ""}</Link></div>
            </Td>
            <Td className="text-xs">{r.registry}{r.category ? <div className="text-muted-foreground">{r.category}</div> : null}</Td>
            <Td className="font-mono text-xs">{r.diaryNo ?? r.applicationNo ?? "—"}</Td>
            <Td className="font-mono text-xs">{r.registrationNo ?? "—"}</Td>
            <Td><StatusTag map={REG_STATUS} status={r.status} /></Td>
            <Td className="whitespace-nowrap text-xs">{fmtDate(r.filedAt)}</Td>
            <Td className="whitespace-nowrap text-xs">{r.nextDeadline ? (isOverdue(r.nextDeadline) ? <Pill tone="red">{fmtDate(r.nextDeadline)}</Pill> : fmtDate(r.nextDeadline)) : "—"}</Td>
          </tr>
        ))}
      </DataTable>
      <LoadMore next={list.next} onMore={() => void list.more()} />
      <FormDialog open={open} onOpenChange={setOpen} title="Add registration" description="Record a registration you are filing or have filed. Leave “Filed on” empty if it is still planned." onSubmit={(f) => void create(f)} busy={busy} submitLabel="Add" wide>
        <AssetField defaultType="WORK" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Registry" name="registry" defaultValue="Copyright Office, India" />
          <Field label="Category" name="category" placeholder="Musical / Literary / Sound recording" />
          <Field label="Diary no." name="diaryNo" />
          <Field label="Application no." name="applicationNo" />
          <Field label="Filed on" name="filedAt" type="date" />
          <Field label="Next deadline" name="nextDeadline" type="date" />
        </div>
        <TextArea label="Notes" name="notes" rows={3} />
      </FormDialog>
    </>
  );
}
