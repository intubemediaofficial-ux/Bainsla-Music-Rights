"use client";
import Link from "next/link";
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app-shell";
import { DataTable, Pill, Td } from "@/components/data-table";
import { NativeSelect } from "@/components/field";
import { FormDialog, LoadMore, SearchBox, StateRows, Toolbar, useList } from "@/components/catalog";
import { PartyFields, partyPayload } from "@/components/catalog-forms";
import { api, errMsg } from "@/lib/api";
import { PARTY_TYPES, qs, titleCase } from "@/lib/catalog";
import { useSession } from "@/lib/session";

type Party = { id: string; legalName: string; stageName: string | null; types: string[]; email: string | null; phone: string | null; _count: { contributions: number; rightsClaims: number } };

export default function PartiesPage() {
  const { can } = useSession();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const list = useList<Party>("/parties", qs({ q, type }));
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  async function create(f: FormData) {
    setBusy(true);
    try {
      const p = await api<{ id: string }>("/parties", { json: partyPayload(f) });
      toast.success("Added");
      router.push(`/parties/${p.id}`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader title="Parties" description="Everyone involved — singers, writers, composers, producers, labels, publishers." actions={can("catalog.write") && <Button onClick={() => setOpen(true)}><Plus className="size-4" /> New party</Button>} />
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Search name or email…" />
        <div className="w-44">
          <NativeSelect value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
            <option value="">All types</option>
            {PARTY_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
          </NativeSelect>
        </div>
      </Toolbar>
      <DataTable head={["Name", "Type", "Contact", "Credits", "Claims"]}>
        <StateRows rows={list.rows} cols={5} empty="No parties yet." />
        {list.rows?.map((p) => (
          <tr key={p.id} className="cursor-pointer hover:bg-muted/30" onClick={() => router.push(`/parties/${p.id}`)}>
            <Td>
              <Link href={`/parties/${p.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{p.legalName}</Link>
              {p.stageName && <div className="text-xs text-muted-foreground">{p.stageName}</div>}
            </Td>
            <Td><div className="flex flex-wrap gap-1">{p.types.map((t) => <Pill key={t} tone="violet">{titleCase(t)}</Pill>)}</div></Td>
            <Td className="text-xs text-muted-foreground">{[p.email, p.phone].filter(Boolean).join(" · ") || "—"}</Td>
            <Td>{p._count.contributions}</Td>
            <Td>{p._count.rightsClaims}</Td>
          </tr>
        ))}
      </DataTable>
      <LoadMore next={list.next} onMore={() => void list.more()} />
      <FormDialog open={open} onOpenChange={setOpen} title="New party" description="A person or company. Tax and bank details are encrypted and shown masked." onSubmit={create} busy={busy} submitLabel="Create" wide>
        <PartyFields />
      </FormDialog>
    </>
  );
}
