"use client";
import Link from "next/link";
import { use, useState } from "react";
import { Archive, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app-shell";
import { Pill } from "@/components/data-table";
import { ArchivedBanner, CreditsCard, DetailSkeleton, FormDialog, InfoGrid, LicensesCard, RightsCard, SectionCard, useFetch } from "@/components/catalog";
import { RecordingFields, recordingPayload, WorkFields, workPayload } from "@/components/catalog-forms";
import { api, errMsg } from "@/lib/api";
import { AssetRights, Credit, fmtDuration, License } from "@/lib/catalog";
import { useSession } from "@/lib/session";
import { DocumentsCard } from "@/components/documents";
import { AssetCasesCard } from "@/components/cases";

type Work = AssetRights & {
  id: string; title: string; aliases: string[]; language: string | null; genre: string | null; iswc: string | null; lyricsExcerpt: string | null; notes: string | null;
  archivedAt: string | null; recordings: { id: string; title: string; version: string | null; isrc: string | null; durationSec: number | null; archivedAt: string | null }[];
  contributions: Credit[]; licenses: License[];
};

export default function WorkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useSession();
  const router = useRouter();
  const { data: w, error, reload } = useFetch<Work>(`/works/${id}`);
  const [edit, setEdit] = useState(false);
  const [addRec, setAddRec] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!w) return <DetailSkeleton error={error} />;
  const write = can("catalog.write");

  async function save(f: FormData) {
    setBusy(true);
    try {
      await api(`/works/${id}`, { method: "PATCH", json: workPayload(f) });
      toast.success("Saved");
      setEdit(false);
      void reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  async function createRecording(f: FormData) {
    setBusy(true);
    try {
      const r = await api<{ id: string }>("/recordings", { json: { ...recordingPayload(f), workId: id } });
      toast.success("Recording added");
      router.push(`/recordings/${r.id}`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  async function archive(restore = false) {
    if (!restore && !confirm("Archive this work? It will be hidden from lists but kept with its history.")) return;
    try {
      await api(restore ? `/works/${id}/restore` : `/works/${id}`, { method: restore ? "POST" : "DELETE" });
      void reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  return (
    <>
      <div className="mb-2 text-sm text-muted-foreground"><Link href="/works" className="hover:underline">Musical works</Link> /</div>
      <PageHeader
        title={w.title}
        description="Musical work (composition)"
        actions={
          write && (
            <>
              <Button variant="outline" onClick={() => setEdit(true)}><Pencil className="size-4" /> Edit</Button>
              {!w.archivedAt && <Button variant="outline" onClick={() => archive()}><Archive className="size-4" /> Archive</Button>}
            </>
          )
        }
      />
      <ArchivedBanner archivedAt={w.archivedAt} onRestore={write ? () => archive(true) : undefined} />
      <div className="grid gap-6">
        <SectionCard title="Details">
          <InfoGrid
            items={[
              ["ISWC", w.iswc && <span className="font-mono">{w.iswc}</span>],
              ["Language", w.language],
              ["Genre", w.genre],
              ["Also known as", w.aliases.join(", ")],
              ["Lyrics excerpt", w.lyricsExcerpt],
              ["Notes", w.notes],
            ]}
          />
        </SectionCard>
        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard title={`Recordings (${w.recordings.length})`} action={write && <Button size="sm" variant="outline" onClick={() => setAddRec(true)}><Plus className="size-4" /> Add recording</Button>}>
            {w.recordings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recordings of this work yet.</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {w.recordings.map((r) => (
                  <li key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <Link href={`/recordings/${r.id}`} className="font-medium hover:underline">{r.title}{r.version ? ` (${r.version})` : ""}</Link>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {r.isrc ? <span className="font-mono">{r.isrc}</span> : <Pill tone="amber">no ISRC</Pill>} {fmtDuration(r.durationSec)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
          <CreditsCard assetType="WORK" assetId={id} credits={w.contributions} onChange={reload} />
        </div>
        <RightsCard assetType="WORK" assetId={id} rights={w} onChange={reload} />
        <LicensesCard asset={{ type: "WORK", id }} licenses={w.licenses} onChange={reload} />
        <DocumentsCard ownerType="WORK" ownerId={id} />
        <AssetCasesCard assetType="WORK" assetId={id} />
      </div>

      <FormDialog open={edit} onOpenChange={setEdit} title="Edit work" onSubmit={save} busy={busy} wide>
        <WorkFields w={w} />
      </FormDialog>
      <FormDialog open={addRec} onOpenChange={setAddRec} title={`New recording of "${w.title}"`} onSubmit={createRecording} busy={busy} submitLabel="Create" wide>
        <RecordingFields r={{ title: w.title, language: w.language }} hideWork />
      </FormDialog>
    </>
  );
}
