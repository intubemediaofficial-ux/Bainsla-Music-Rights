"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRightLeft, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { DataTable, Pill, Td } from "@/components/data-table";
import { NativeSelect } from "@/components/field";
import { LoadMore, SearchBox, StateRows, Toolbar, useList } from "@/components/catalog";
import { api, errMsg, fmtDate } from "@/lib/api";
import { assetHref, Claim, CLAIM_STATUS, Issue, partyName, pct, qs, RIGHT_LABEL, RIGHT_TYPES, Transfer } from "@/lib/catalog";
import { cn } from "@/lib/utils";

type Conflict = { assetType: string; assetId: string; title: string; issues: Issue[]; disputed: number };
const TABS = [["claims", "All claims"], ["conflicts", "Conflicts"], ["transfers", "Transfers"]] as const;

export default function RightsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("claims");
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "conflicts" || t === "transfers") setTimeout(() => setTab(t), 0);
  }, []);
  return (
    <>
      <PageHeader title="Rights claims" description="Who owns what share of each work and recording — and where the shares don't add up." />
      <div className="mb-5 inline-flex rounded-lg border bg-card p-1">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("rounded-md px-4 py-1.5 text-sm font-medium", tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
            {l}
          </button>
        ))}
      </div>
      {tab === "claims" && <Claims />}
      {tab === "conflicts" && <Conflicts />}
      {tab === "transfers" && <Transfers />}
    </>
  );
}

function Claims() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [rightType, setRightType] = useState("");
  const [assetType, setAssetType] = useState("");
  const list = useList<Claim>("/rights/claims", qs({ q, status, rightType, assetType }));
  const counts = (list.extra.counts ?? {}) as Record<string, number>;
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        {Object.entries(CLAIM_STATUS).map(([k, v]) => (
          <button key={k} onClick={() => setStatus(status === k ? "" : k)} className={cn("rounded-full border px-3 py-1 text-xs", status === k && "border-primary bg-primary/10")}>
            {v.label} <span className="ml-1 font-semibold">{counts[k] ?? 0}</span>
          </button>
        ))}
      </div>
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Search song or owner…" />
        <div className="w-48">
          <NativeSelect value={rightType} onChange={(e) => setRightType(e.target.value)} aria-label="Right">
            <option value="">All rights</option>
            {RIGHT_TYPES.map((r) => <option key={r} value={r}>{RIGHT_LABEL[r]}</option>)}
          </NativeSelect>
        </div>
        <div className="w-40">
          <NativeSelect value={assetType} onChange={(e) => setAssetType(e.target.value)} aria-label="Asset">
            <option value="">Works & recordings</option>
            <option value="WORK">Works</option>
            <option value="RECORDING">Recordings</option>
          </NativeSelect>
        </div>
      </Toolbar>
      <DataTable head={["Asset", "Owner", "Right", "Share", "Territory", "Status", "Updated"]}>
        <StateRows rows={list.rows} cols={7} empty="No claims match. Add claims from a work or recording page." />
        {list.rows?.map((c) => (
          <tr key={c.id} className="hover:bg-muted/30">
            <Td>
              <Link href={assetHref(c)} className="font-medium hover:underline">{c.work?.title ?? c.recording?.title}</Link>
              <div className="text-xs text-muted-foreground">{c.assetType === "WORK" ? "Musical work" : `Recording${c.recording?.isrc ? ` · ${c.recording.isrc}` : ""}`}</div>
            </Td>
            <Td><Link href={`/parties/${c.party.id}`} className="hover:underline">{partyName(c.party)}</Link></Td>
            <Td className="whitespace-nowrap">{RIGHT_LABEL[c.rightType]}</Td>
            <Td className="font-semibold tabular-nums">{pct(c.sharePercent)}</Td>
            <Td className="text-xs">{c.territories.join(", ")}</Td>
            <Td><Pill tone={CLAIM_STATUS[c.status]?.tone}>{CLAIM_STATUS[c.status]?.label}</Pill></Td>
            <Td className="text-xs text-muted-foreground">{fmtDate((c as Claim & { updatedAt: string }).updatedAt)}</Td>
          </tr>
        ))}
      </DataTable>
      <LoadMore next={list.next} onMore={() => void list.more()} />
    </>
  );
}

function Conflicts() {
  const [rows, setRows] = useState<Conflict[] | null>(null);
  useEffect(() => {
    api<{ data: Conflict[] }>("/rights/conflicts").then((r) => setRows(r.data), (e) => (toast.error(errMsg(e)), setRows([])));
  }, []);
  if (rows && !rows.length)
    return (
      <div className="flex flex-col items-center rounded-xl border bg-card py-14 text-center">
        <CheckCircle2 className="mb-3 size-10 text-emerald-500" />
        <p className="font-medium">No conflicts</p>
        <p className="text-sm text-muted-foreground">No asset has shares above 100% or disputed claims.</p>
      </div>
    );
  return (
    <div className="grid gap-3">
      {rows === null && <StateTable />}
      {rows?.map((c) => (
        <Link key={c.assetId} href={c.assetType === "WORK" ? `/works/${c.assetId}` : `/recordings/${c.assetId}`} className="rounded-xl border border-rose-200 bg-card p-4 transition hover:shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4 text-rose-600" /> {c.title}</div>
            <div className="flex gap-2">
              <Pill tone="slate">{c.assetType === "WORK" ? "work" : "recording"}</Pill>
              {c.disputed > 0 && <Pill tone="red">{c.disputed} disputed</Pill>}
            </div>
          </div>
          <ul className="mt-2 space-y-0.5 text-sm text-rose-700">
            {c.issues.map((i, n) => (
              <li key={n}>{i.kind === "OVER_100" ? `${RIGHT_LABEL[i.rightType]}: ${pct(i.total)} in ${i.territory === "WW" ? "worldwide" : i.territory}` : `${RIGHT_LABEL[i.rightType]}: same owner listed twice`}</li>
            ))}
          </ul>
        </Link>
      ))}
    </div>
  );
}

function StateTable() {
  return <DataTable head={[""]}><StateRows rows={null} cols={1} empty="" /></DataTable>;
}

function Transfers() {
  const list = useList<Transfer>("/rights/transfers", "");
  return (
    <>
      <DataTable head={["Asset", "From", "", "To", "Right", "Share", "Effective"]}>
        <StateRows rows={list.rows} cols={7} empty="No transfers recorded. Record one from a work or recording page." />
        {list.rows?.map((t) => (
          <tr key={t.id}>
            <Td><Link href={t.work ? `/works/${t.work.id}` : `/recordings/${t.recording?.id}`} className="font-medium hover:underline">{t.work?.title ?? t.recording?.title}</Link></Td>
            <Td>{partyName(t.fromParty)}</Td>
            <Td><ArrowRightLeft className="size-4 text-muted-foreground" /></Td>
            <Td>{partyName(t.toParty)}</Td>
            <Td>{RIGHT_LABEL[t.rightType]}</Td>
            <Td className="font-semibold">{pct(t.sharePercent)}</Td>
            <Td className="text-xs text-muted-foreground">{fmtDate(t.effectiveDate ?? t.createdAt)}</Td>
          </tr>
        ))}
      </DataTable>
      <LoadMore next={list.next} onMore={() => void list.more()} />
    </>
  );
}
