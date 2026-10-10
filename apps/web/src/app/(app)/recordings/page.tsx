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
import { RecordingFields, recordingPayload } from "@/components/catalog-forms";
import { api, errMsg } from "@/lib/api";
import { fmtDuration, PartyLite, partyName, qs } from "@/lib/catalog";
import { useSession } from "@/lib/session";

type Rec = {
  id: string; title: string; version: string | null; isrc: string | null; durationSec: number | null; work: { id: string; title: string } | null;
  _count: { contributions: number; rightsClaims: number; releaseTracks: number }; contributions: { party: PartyLite }[];
};

export default function RecordingsPage() {
  const { can } = useSession();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const list = useList<Rec>("/recordings", qs({ q, missing: filter.startsWith("missing:") ? filter.slice(8) : "", archived: filter === "archived" && "true" }));
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function create(f: FormData) {
    setBusy(true);
    try {
      const r = await api<{ id: string }>("/recordings", { json: recordingPayload(f) });
      toast.success("Recording created");
      router.push(`/recordings/${r.id}`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Recordings"
        description="Sound recordings (masters). ISRC belongs here, not on the work."
        actions={can("catalog.write") && <Button onClick={() => setOpen(true)}><Plus className="size-4" /> New recording</Button>}
      />
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Search title, ISRC, version…" />
        <div className="w-48">
          <NativeSelect value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter">
            <option value="">All active</option>
            <option value="missing:isrc">Missing ISRC</option>
            <option value="missing:work">Not linked to a work</option>
            <option value="archived">Archived</option>
          </NativeSelect>
        </div>
      </Toolbar>
      <DataTable head={["Title", "Singers", "ISRC", "Work", "Duration", "Releases", "Claims"]}>
        <StateRows rows={list.rows} cols={7} empty={q || filter ? "Nothing matches." : "No recordings yet. Add one or use Bulk import."} />
        {list.rows?.map((r) => (
          <tr key={r.id} className="cursor-pointer hover:bg-muted/30" onClick={() => router.push(`/recordings/${r.id}`)}>
            <Td>
              <Link href={`/recordings/${r.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{r.title}</Link>
              {r.version && <span className="ml-1.5 text-xs text-muted-foreground">({r.version})</span>}
            </Td>
            <Td className="text-xs text-muted-foreground">{r.contributions.map((c) => partyName(c.party)).join(", ") || "—"}</Td>
            <Td className="font-mono text-xs">{r.isrc ?? <Pill tone="amber">missing</Pill>}</Td>
            <Td className="text-xs">{r.work ? <Link href={`/works/${r.work.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>{r.work.title}</Link> : <Pill tone="amber">not linked</Pill>}</Td>
            <Td className="tabular-nums">{fmtDuration(r.durationSec)}</Td>
            <Td>{r._count.releaseTracks}</Td>
            <Td>{r._count.rightsClaims ? r._count.rightsClaims : <Pill tone="amber">none</Pill>}</Td>
          </tr>
        ))}
      </DataTable>
      <LoadMore next={list.next} onMore={() => void list.more()} />
      <FormDialog open={open} onOpenChange={setOpen} title="New recording" onSubmit={(f) => { try { void create(f); } catch (e) { toast.error(errMsg(e)); } }} busy={busy} submitLabel="Create" wide>
        <RecordingFields />
      </FormDialog>
    </>
  );
}
