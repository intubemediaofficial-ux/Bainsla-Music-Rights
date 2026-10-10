"use client";
import Link from "next/link";
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app-shell";
import { DataTable, Pill, Td } from "@/components/data-table";
import { FormDialog, LoadMore, SearchBox, StateRows, Toolbar, useList } from "@/components/catalog";
import { ReleaseFields, releasePayload } from "@/components/catalog-forms";
import { api, errMsg, fmtDate } from "@/lib/api";
import { qs, titleCase } from "@/lib/catalog";
import { useSession } from "@/lib/session";

type Rel = { id: string; title: string; type: string; upc: string | null; releaseDate: string | null; labelName: string | null; _count: { tracks: number } };

export default function ReleasesPage() {
  const { can } = useSession();
  const router = useRouter();
  const [q, setQ] = useState("");
  const list = useList<Rel>("/releases", qs({ q }));
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  async function create(f: FormData) {
    setBusy(true);
    try {
      const r = await api<{ id: string }>("/releases", { json: releasePayload(f) });
      toast.success("Release created — now add its tracks");
      router.push(`/releases/${r.id}`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader title="Releases" description="Singles, EPs and albums. UPC belongs to the release." actions={can("catalog.write") && <Button onClick={() => setOpen(true)}><Plus className="size-4" /> New release</Button>} />
      <Toolbar><SearchBox value={q} onChange={setQ} placeholder="Search title, UPC, label…" /></Toolbar>
      <DataTable head={["Title", "Type", "UPC", "Release date", "Label", "Tracks"]}>
        <StateRows rows={list.rows} cols={6} empty="No releases yet." />
        {list.rows?.map((r) => (
          <tr key={r.id} className="cursor-pointer hover:bg-muted/30" onClick={() => router.push(`/releases/${r.id}`)}>
            <Td><Link href={`/releases/${r.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{r.title}</Link></Td>
            <Td><Pill tone="sky">{titleCase(r.type)}</Pill></Td>
            <Td className="font-mono text-xs">{r.upc ?? <Pill tone="amber">missing</Pill>}</Td>
            <Td>{fmtDate(r.releaseDate)}</Td>
            <Td>{r.labelName ?? "—"}</Td>
            <Td>{r._count.tracks || <Pill tone="amber">empty</Pill>}</Td>
          </tr>
        ))}
      </DataTable>
      <LoadMore next={list.next} onMore={() => void list.more()} />
      <FormDialog open={open} onOpenChange={setOpen} title="New release" onSubmit={create} busy={busy} submitLabel="Create" wide>
        <ReleaseFields />
      </FormDialog>
    </>
  );
}
