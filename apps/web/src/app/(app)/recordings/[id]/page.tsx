"use client";
import Link from "next/link";
import { use, useState } from "react";
import { Archive, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app-shell";
import { Pill } from "@/components/data-table";
import { ArchivedBanner, CreditsCard, DetailSkeleton, FormDialog, InfoGrid, LicensesCard, RightsCard, SectionCard, useFetch } from "@/components/catalog";
import { RecordingFields, recordingPayload } from "@/components/catalog-forms";
import { api, errMsg, fmtDate } from "@/lib/api";
import { AssetRights, Credit, fmtDuration, License, titleCase } from "@/lib/catalog";
import { useSession } from "@/lib/session";
import { DocumentsCard } from "@/components/documents";

type Rec = AssetRights & {
  id: string; title: string; version: string | null; isrc: string | null; durationSec: number | null; recordingDate: string | null; language: string | null;
  studioName: string | null; notes: string | null; archivedAt: string | null; workId: string | null; work: { id: string; title: string; iswc: string | null } | null;
  contributions: Credit[]; licenses: License[];
  releaseTracks: { id: string; trackNo: number; discNo: number; release: { id: string; title: string; upc: string | null; type: string; releaseDate: string | null } }[];
};

export default function RecordingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useSession();
  const { data: r, error, reload } = useFetch<Rec>(`/recordings/${id}`);
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!r) return <DetailSkeleton error={error} />;
  const write = can("catalog.write");

  async function save(f: FormData) {
    setBusy(true);
    try {
      await api(`/recordings/${id}`, { method: "PATCH", json: recordingPayload(f) });
      toast.success("Saved");
      setEdit(false);
      void reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  async function archive(restore = false) {
    if (!restore && !confirm("Archive this recording? It stays in history but is hidden from lists.")) return;
    try {
      await api(restore ? `/recordings/${id}/restore` : `/recordings/${id}`, { method: restore ? "POST" : "DELETE" });
      void reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  return (
    <>
      <div className="mb-2 text-sm text-muted-foreground"><Link href="/recordings" className="hover:underline">Recordings</Link> /</div>
      <PageHeader
        title={`${r.title}${r.version ? ` (${r.version})` : ""}`}
        description="Sound recording"
        actions={write && (
          <>
            <Button variant="outline" onClick={() => setEdit(true)}><Pencil className="size-4" /> Edit</Button>
            {!r.archivedAt && <Button variant="outline" onClick={() => archive()}><Archive className="size-4" /> Archive</Button>}
          </>
        )}
      />
      <ArchivedBanner archivedAt={r.archivedAt} onRestore={write ? () => archive(true) : undefined} />
      <div className="grid gap-6">
        <SectionCard title="Details">
          <InfoGrid
            items={[
              ["ISRC", r.isrc ? <span className="font-mono">{r.isrc}</span> : <Pill tone="amber">missing</Pill>],
              ["Musical work", r.work ? <Link href={`/works/${r.work.id}`} className="text-primary hover:underline">{r.work.title}</Link> : <Pill tone="amber">not linked</Pill>],
              ["Duration", fmtDuration(r.durationSec)],
              ["Recorded on", r.recordingDate && fmtDate(r.recordingDate)],
              ["Language", r.language],
              ["Studio", r.studioName],
              ["Notes", r.notes],
            ]}
          />
        </SectionCard>
        <div className="grid gap-6 lg:grid-cols-2">
          <CreditsCard assetType="RECORDING" assetId={id} credits={r.contributions} onChange={reload} />
          <SectionCard title={`Releases (${r.releaseTracks.length})`}>
            {r.releaseTracks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not on any release yet. Add it from a release&apos;s tracklist.</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {r.releaseTracks.map((t) => (
                  <li key={t.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <Link href={`/releases/${t.release.id}`} className="font-medium hover:underline">{t.release.title}</Link>
                    <span className="text-xs text-muted-foreground">{titleCase(t.release.type)} · track {t.trackNo} · {t.release.upc ?? "no UPC"}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
        <RightsCard assetType="RECORDING" assetId={id} rights={r} onChange={reload} />
        <LicensesCard asset={{ type: "RECORDING", id }} licenses={r.licenses} onChange={reload} />
        <DocumentsCard ownerType="RECORDING" ownerId={id} />
      </div>
      <FormDialog open={edit} onOpenChange={setEdit} title="Edit recording" onSubmit={(f) => { try { void save(f); } catch (e) { toast.error(errMsg(e)); } }} busy={busy} wide>
        <RecordingFields r={r} />
      </FormDialog>
    </>
  );
}
