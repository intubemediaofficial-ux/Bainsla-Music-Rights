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
import { assetCode, assetTitle, DISPUTE_STATUS, isOverdue, PLATFORMS, type AssetLite } from "@/lib/cases";
import { useSession } from "@/lib/session";

type Row = AssetLite & { id: string; counterparty: string; platform: string; caseNo: string | null; claimType: string | null; status: string; deadline: string | null; openedAt: string; _count: { events: number } };

export default function DisputesPage() {
  const { can } = useSession();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("open");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const list = useList<Row>("/disputes", qs({ q, status }));
  const counts = (list.extra.counts ?? {}) as Record<string, number>;

  async function create(f: FormData) {
    setBusy(true);
    try {
      const r = await api<{ id: string }>("/disputes", {
        method: "POST",
        json: { assetType: str(f, "assetType"), assetId: str(f, "assetId"), counterparty: str(f, "counterparty"), platform: str(f, "platform"), caseNo: str(f, "caseNo"), claimType: str(f, "claimType"), contentUrl: str(f, "contentUrl"), deadline: str(f, "deadline"), description: str(f, "description") },
      });
      toast.success("Dispute opened");
      router.push(`/disputes/${r.id}`);
    } catch (e) {
      toast.error(errMsg(e));
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Disputes"
        description="Content ID claims, takedowns and ownership conflicts with a full timeline of correspondence, evidence and deadlines. Responses are sent by you — nothing is filed on platforms automatically."
        actions={can("disputes.write") && <Button onClick={() => setOpen(true)}><Plus className="size-4" /> Open dispute</Button>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {["open", "closed", "", ...Object.keys(DISPUTE_STATUS)].map((s) => (
          <button key={s || "all"} onClick={() => setStatus(s)} className={`rounded-full border px-3 py-1 text-xs font-medium transition ${status === s ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>
            {s === "open" ? "Open" : s === "closed" ? "Closed" : s ? DISPUTE_STATUS[s].label : "All"}{counts[s] ? <span className="ml-1 opacity-70">{counts[s]}</span> : null}
          </button>
        ))}
      </div>
      <Toolbar><SearchBox value={q} onChange={setQ} placeholder="Search song, counterparty, case no…" /></Toolbar>
      <DataTable head={["Song", "Counterparty", "Platform", "Case no.", "Status", "Deadline", "Events", "Opened"]}>
        <StateRows rows={list.rows} cols={8} empty="No disputes here." />
        {list.rows?.map((d) => (
          <tr key={d.id} className="hover:bg-muted/30">
            <Td className="font-medium">
              <Link href={`/disputes/${d.id}`} className="hover:underline">{assetTitle(d)}</Link>
              <div className="text-xs text-muted-foreground"><Link href={assetHref(d)} className="hover:underline">{d.assetType === "WORK" ? "Work" : "Recording"}{assetCode(d) ? ` · ${assetCode(d)}` : ""}</Link></div>
            </Td>
            <Td className="text-xs">{d.counterparty}</Td>
            <Td className="text-xs">{d.platform}{d.claimType ? <div className="text-muted-foreground">{d.claimType}</div> : null}</Td>
            <Td className="font-mono text-xs">{d.caseNo ?? "—"}</Td>
            <Td><StatusTag map={DISPUTE_STATUS} status={d.status} /></Td>
            <Td className="whitespace-nowrap text-xs">{d.deadline ? (isOverdue(d.deadline) ? <Pill tone="red">{fmtDate(d.deadline)}</Pill> : fmtDate(d.deadline)) : "—"}</Td>
            <Td className="text-xs">{d._count.events}</Td>
            <Td className="whitespace-nowrap text-xs">{fmtDate(d.openedAt)}</Td>
          </tr>
        ))}
      </DataTable>
      <LoadMore next={list.next} onMore={() => void list.more()} />
      <FormDialog open={open} onOpenChange={setOpen} title="Open dispute" onSubmit={(f) => void create(f)} busy={busy} submitLabel="Open" wide>
        <AssetField />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Counterparty (who is claiming)" name="counterparty" required minLength={2} />
          <Field label="Platform" name="platform" required list="mrc-platforms" defaultValue="YouTube" />
          <datalist id="mrc-platforms">{PLATFORMS.map((p) => <option key={p} value={p} />)}</datalist>
          <Field label="Case / claim ID" name="caseNo" />
          <Field label="Claim type" name="claimType" placeholder="Content ID / copyright strike / manual claim" />
          <Field label="Content URL" name="contentUrl" type="url" placeholder="https://…" />
          <Field label="Response deadline" name="deadline" type="date" />
        </div>
        <TextArea label="What happened?" name="description" rows={3} />
      </FormDialog>
    </>
  );
}
