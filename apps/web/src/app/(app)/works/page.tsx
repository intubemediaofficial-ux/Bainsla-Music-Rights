"use client";
import Link from "next/link";
import { useState } from "react";
import { Copy, Plus } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/app-shell";
import { DataTable, Pill, Td } from "@/components/data-table";
import { NativeSelect } from "@/components/field";
import { FormDialog, LoadMore, SearchBox, StateRows, Toolbar, useList } from "@/components/catalog";
import { WorkFields, workPayload } from "@/components/catalog-forms";
import { api, errMsg, fmtDate } from "@/lib/api";
import { CREDIT_ROLE, partyName, PartyLite, qs } from "@/lib/catalog";
import { useSession } from "@/lib/session";

type Work = {
  id: string; title: string; aliases: string[]; language: string | null; iswc: string | null;
  _count: { recordings: number; contributions: number; rightsClaims: number };
  contributions: { role: string; party: PartyLite }[];
};
type DupGroup = { id: string; title: string; language: string | null; iswc: string | null; createdAt: string; _count: { recordings: number } }[];

export default function WorksPage() {
  const { can } = useSession();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [archived, setArchived] = useState("");
  const list = useList<Work>("/works", qs({ q, archived }));
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dups, setDups] = useState<DupGroup[] | null>(null);

  async function create(f: FormData) {
    setBusy(true);
    try {
      const w = await api<{ id: string; possibleDuplicates: { title: string }[] }>("/works", { json: workPayload(f) });
      if (w.possibleDuplicates.length) toast.warning(`Possible duplicate of "${w.possibleDuplicates[0].title}" — check Duplicate review`);
      else toast.success("Work created");
      router.push(`/works/${w.id}`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  async function openDups() {
    try {
      setDups((await api<{ groups: DupGroup[] }>("/works/duplicates")).groups);
    } catch (e) {
      toast.error(errMsg(e));
    }
  }
  async function merge(id: string, into: string) {
    if (!confirm("Move all recordings, credits, claims and licenses into the kept work and archive this one?")) return;
    try {
      await api(`/works/${id}/merge-into/${into}`, { method: "POST" });
      toast.success("Merged");
      void openDups();
      void list.reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  return (
    <>
      <PageHeader
        title="Musical works"
        description="Compositions — the lyrics and music. Each work can have many recordings."
        actions={
          <>
            <Button variant="outline" onClick={openDups}><Copy className="size-4" /> Duplicate review</Button>
            {can("catalog.write") && <Button onClick={() => setOpen(true)}><Plus className="size-4" /> New work</Button>}
          </>
        }
      />
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Search title, alias, ISWC…" />
        <div className="w-40">
          <NativeSelect value={archived} onChange={(e) => setArchived(e.target.value)} aria-label="Show">
            <option value="">Active</option>
            <option value="true">Archived</option>
          </NativeSelect>
        </div>
      </Toolbar>
      <DataTable head={["Title", "Writers / composers", "Language", "ISWC", "Recordings", "Claims"]}>
        <StateRows rows={list.rows} cols={6} empty={q ? "Nothing matches your search." : "No works yet. Add one or use Bulk import."} />
        {list.rows?.map((w) => (
          <tr key={w.id} className="cursor-pointer hover:bg-muted/30" onClick={() => router.push(`/works/${w.id}`)}>
            <Td>
              <Link href={`/works/${w.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{w.title}</Link>
              {w.aliases.length > 0 && <div className="text-xs text-muted-foreground">aka {w.aliases.join(", ")}</div>}
            </Td>
            <Td className="text-xs text-muted-foreground">{w.contributions.map((c) => `${partyName(c.party)} (${CREDIT_ROLE[c.role]?.toLowerCase()})`).join(", ") || "—"}</Td>
            <Td>{w.language ?? "—"}</Td>
            <Td className="font-mono text-xs">{w.iswc ?? "—"}</Td>
            <Td>{w._count.recordings}</Td>
            <Td>{w._count.rightsClaims ? w._count.rightsClaims : <Pill tone="amber">none</Pill>}</Td>
          </tr>
        ))}
      </DataTable>
      <LoadMore next={list.next} onMore={() => void list.more()} />

      <FormDialog open={open} onOpenChange={setOpen} title="New musical work" description="The composition itself. Add recordings, credits and ownership after saving." onSubmit={create} busy={busy} submitLabel="Create" wide>
        <WorkFields />
      </FormDialog>

      <Dialog open={dups !== null} onOpenChange={(o) => !o && setDups(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Duplicate review</DialogTitle>
            <DialogDescription>Works whose titles match after ignoring case, punctuation and brackets. Merge keeps the first and moves everything into it.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-3 overflow-y-auto">
            {dups?.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No duplicates found.</p>}
            {dups?.map((g, i) => (
              <div key={i} className="rounded-lg border">
                {g.map((w, j) => (
                  <div key={w.id} className="flex items-center justify-between gap-2 border-b px-3 py-2 text-sm last:border-0">
                    <div>
                      <Link href={`/works/${w.id}`} className="font-medium hover:underline">{w.title}</Link>
                      <span className="ml-2 text-xs text-muted-foreground">{w.language ?? ""} · {w._count.recordings} recordings · added {fmtDate(w.createdAt)}</span>
                    </div>
                    {j === 0 ? <Pill tone="green">keep</Pill> : can("catalog.write") && <Button size="sm" variant="outline" onClick={() => merge(w.id, g[0].id)}>Merge into first</Button>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
