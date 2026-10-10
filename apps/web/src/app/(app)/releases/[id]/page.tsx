"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app-shell";
import { NativeSelect } from "@/components/field";
import { DetailSkeleton, FormDialog, InfoGrid, SectionCard, useFetch } from "@/components/catalog";
import { ReleaseFields, releasePayload } from "@/components/catalog-forms";
import { api, errMsg, fmtDate } from "@/lib/api";
import { fmtDuration, Page, titleCase } from "@/lib/catalog";
import { useSession } from "@/lib/session";

type RecLite = { id: string; title: string; version: string | null; isrc: string | null; durationSec: number | null };
type Rel = {
  id: string; title: string; type: string; upc: string | null; releaseDate: string | null; labelName: string | null; notes: string | null;
  tracks: { id: string; discNo: number; trackNo: number; recording: RecLite }[];
};

export default function ReleasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useSession();
  const { data: r, error, reload } = useFetch<Rel>(`/releases/${id}`);
  const [tracks, setTracks] = useState<RecLite[] | null>(null);
  const [all, setAll] = useState<RecLite[]>([]);
  const [pick, setPick] = useState("");
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Page<RecLite>>("/recordings?limit=200").then((x) => setAll(x.data), () => setAll([]));
  }, []);
  if (!r) return <DetailSkeleton error={error} />;
  const write = can("catalog.write");
  const current = tracks ?? r.tracks.map((t) => t.recording);
  const dirty = tracks !== null;

  const move = (i: number, d: number) => {
    const next = [...current];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setTracks(next);
  };
  async function saveTracks() {
    setBusy(true);
    try {
      await api(`/releases/${id}/tracks`, { method: "PUT", json: { tracks: current.map((t, i) => ({ recordingId: t.id, trackNo: i + 1 })) } });
      toast.success("Tracklist saved");
      setTracks(null);
      void reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  async function save(f: FormData) {
    setBusy(true);
    try {
      await api(`/releases/${id}`, { method: "PATCH", json: releasePayload(f) });
      setEdit(false);
      void reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  const available = all.filter((a) => !current.some((t) => t.id === a.id));

  return (
    <>
      <div className="mb-2 text-sm text-muted-foreground"><Link href="/releases" className="hover:underline">Releases</Link> /</div>
      <PageHeader title={r.title} description={`${titleCase(r.type)} release`} actions={write && <Button variant="outline" onClick={() => setEdit(true)}><Pencil className="size-4" /> Edit</Button>} />
      <div className="grid gap-6">
        <SectionCard title="Details">
          <InfoGrid items={[["UPC / EAN", r.upc && <span className="font-mono">{r.upc}</span>], ["Release date", r.releaseDate && fmtDate(r.releaseDate)], ["Label", r.labelName], ["Notes", r.notes]]} />
        </SectionCard>
        <SectionCard
          title={`Tracklist (${current.length})`}
          action={write && dirty && (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setTracks(null)}>Discard</Button>
              <Button size="sm" onClick={saveTracks} disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />} Save tracklist</Button>
            </div>
          )}
        >
          {current.length === 0 && <p className="mb-3 text-sm text-muted-foreground">No tracks yet.</p>}
          <ol className="divide-y rounded-lg border">
            {current.map((t, i) => (
              <li key={t.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="w-6 text-right font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
                <Link href={`/recordings/${t.id}`} className="flex-1 font-medium hover:underline">{t.title}{t.version ? ` (${t.version})` : ""}</Link>
                <span className="font-mono text-xs text-muted-foreground">{t.isrc ?? "no ISRC"}</span>
                <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">{fmtDuration(t.durationSec)}</span>
                {write && (
                  <span className="flex">
                    <Button variant="ghost" size="icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp className="size-4" /></Button>
                    <Button variant="ghost" size="icon" disabled={i === current.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown className="size-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setTracks(current.filter((x) => x.id !== t.id))} aria-label="Remove"><Trash2 className="size-4" /></Button>
                  </span>
                )}
              </li>
            ))}
          </ol>
          {write && (
            <div className="mt-3 flex gap-2">
              <div className="flex-1">
                <NativeSelect value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Add recording">
                  <option value="">Add a recording…</option>
                  {available.map((a) => <option key={a.id} value={a.id}>{a.title}{a.version ? ` (${a.version})` : ""}{a.isrc ? ` · ${a.isrc}` : ""}</option>)}
                </NativeSelect>
              </div>
              <Button variant="outline" disabled={!pick} onClick={() => { const a = all.find((x) => x.id === pick); if (a) setTracks([...current, a]); setPick(""); }}>
                <Plus className="size-4" /> Add
              </Button>
            </div>
          )}
        </SectionCard>
      </div>
      <FormDialog open={edit} onOpenChange={setEdit} title="Edit release" onSubmit={save} busy={busy} wide>
        <ReleaseFields r={r} />
      </FormDialog>
    </>
  );
}
