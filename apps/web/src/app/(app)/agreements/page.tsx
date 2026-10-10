"use client";
import Link from "next/link";
import { useState } from "react";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/app-shell";
import { DataTable, Pill, Td } from "@/components/data-table";
import { LoadMore, SearchBox, StateRows, Toolbar, useList } from "@/components/catalog";
import { StatusPill } from "@/components/documents";
import { fmtDate } from "@/lib/api";
import { qs } from "@/lib/catalog";
import { AGREEMENT_TYPE, DOC_STATUS } from "@/lib/documents";
import { useSession } from "@/lib/session";

type Row = {
  id: string; title: string; type: string; status: string; effectiveDate: string | null; expiryDate: string | null; updatedAt: string; lockedAt: string | null; languages: string[];
  parties: { id: string; role: string; party: { id: string; legalName: string } }[]; _count: { assets: number };
};

export default function AgreementsPage() {
  const { can } = useSession();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const list = useList<Row>("/agreements", qs({ q, status }));
  const counts = (list.extra.counts ?? {}) as Record<string, number>;
  return (
    <>
      <PageHeader
        title="Agreements"
        description="Assignment, licence and publishing agreements with Annexure-A song lists, bilingual PDFs, NOCs and signature tracking."
        actions={can("rights.write") && <Link href="/agreements/new" className={buttonVariants()}><Plus className="size-4" /> New agreement</Link>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {["", "DRAFT", "UNDER_REVIEW", "SENT_FOR_SIGNATURE", "EXECUTED", "REJECTED", "EXPIRED"].map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`rounded-full border px-3 py-1 text-xs font-medium transition ${status === s ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>
            {s ? DOC_STATUS[s].label : "All"}{s && counts[s] ? <span className="ml-1 opacity-70">{counts[s]}</span> : null}
          </button>
        ))}
      </div>
      <Toolbar><SearchBox value={q} onChange={setQ} placeholder="Search title or party…" /></Toolbar>
      <DataTable head={["Agreement", "Type", "Parties", "Songs", "Status", "Effective", "Updated"]}>
        <StateRows rows={list.rows} cols={7} empty={<span>No agreements yet. <Link href="/agreements/new" className="text-primary hover:underline">Create the first one</Link>.</span>} />
        {list.rows?.map((a) => (
          <tr key={a.id} className="hover:bg-muted/30">
            <Td className="font-medium"><Link href={`/agreements/${a.id}`} className="hover:underline">{a.title}</Link> <span className="text-xs text-muted-foreground">{a.languages.map((l) => l.toUpperCase()).join("/")}</span></Td>
            <Td className="text-xs">{AGREEMENT_TYPE[a.type] ?? a.type}</Td>
            <Td className="max-w-64 text-xs">{a.parties.map((p) => p.party.legalName).join(", ") || <Pill tone="amber">none</Pill>}</Td>
            <Td className="text-xs">{a._count.assets || <Pill tone="amber">0</Pill>}</Td>
            <Td><StatusPill status={a.status} /></Td>
            <Td className="whitespace-nowrap text-xs">{fmtDate(a.effectiveDate)}</Td>
            <Td className="whitespace-nowrap text-xs">{fmtDate(a.updatedAt)}</Td>
          </tr>
        ))}
      </DataTable>
      <LoadMore next={list.next} onMore={() => void list.more()} />
    </>
  );
}
