"use client";
import { useRef, useState } from "react";
import { CheckCircle2, Download, FileSpreadsheet, Loader2, RotateCcw, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app-shell";
import { DataTable, Pill, Td } from "@/components/data-table";
import { SectionCard, StateRows, useList } from "@/components/catalog";
import { api, errMsg, fmtDate } from "@/lib/api";

type Row = { row: number; data: Record<string, string>; errors: string[]; warnings: string[] };
type Preview = { id: string; mapping: Record<string, string>; unmapped: string[]; summary: { total: number; valid: number; invalid: number; warnings: number }; rows: Row[] };
type Batch = { id: string; filename: string; status: string; createdAt: string; summary: { total?: number; imported?: number; skipped?: number } };

export default function ImportsPage() {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const history = useList<Batch>("/imports", "");

  async function upload(file: File) {
    setBusy("upload");
    try {
      const fd = new FormData();
      fd.append("file", file);
      setPreview(await api<Preview>("/imports/preview", { method: "POST", body: fd }));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }
  async function commit() {
    if (!preview) return;
    setBusy("commit");
    try {
      const r = await api<{ summary: { imported: number; skipped: number } }>(`/imports/${preview.id}/commit`, { method: "POST" });
      toast.success(`Imported ${r.summary.imported} songs${r.summary.skipped ? `, skipped ${r.summary.skipped}` : ""}`);
      setPreview(null);
      void history.reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  }
  async function rollback(b: Batch) {
    if (!confirm(`Remove everything created by "${b.filename}"?`)) return;
    try {
      await api(`/imports/${b.id}/rollback`, { method: "POST" });
      toast.success("Import rolled back");
      void history.reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  return (
    <>
      <PageHeader title="Bulk import" description="Add many songs at once from a CSV or Excel sheet. You see a preview before anything is saved." />
      <div className="grid gap-6">
        <SectionCard title="1. Upload your sheet">
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
            <div className="text-sm text-muted-foreground">
              Columns we understand: <b>title</b> (required), version, isrc, language, genre, duration, singer, lyricist, composer, producer, release, upc, release date, label.
              Separate multiple names with commas or &amp;. Works, recordings, people, credits and releases are created for you.
            </div>
            <div className="flex gap-2">
              <a href="/api/v1/imports/template.csv"><Button variant="outline"><Download className="size-4" /> Template</Button></a>
              <Button onClick={() => input.current?.click()} disabled={busy === "upload"}>
                {busy === "upload" ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Choose file
              </Button>
              <input ref={input} type="file" accept=".csv,.xlsx" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </div>
          </div>
        </SectionCard>

        {preview && (
          <SectionCard
            title="2. Check the preview"
            action={
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setPreview(null)}>Discard</Button>
                <Button onClick={commit} disabled={!preview.summary.valid || busy === "commit"}>
                  {busy === "commit" && <Loader2 className="size-4 animate-spin" />} Import {preview.summary.valid} rows
                </Button>
              </div>
            }
          >
            <div className="mb-4 flex flex-wrap gap-2 text-sm">
              <Pill tone="slate">{preview.summary.total} rows</Pill>
              <Pill tone="green">{preview.summary.valid} ready</Pill>
              {preview.summary.invalid > 0 && <Pill tone="red">{preview.summary.invalid} with errors (skipped)</Pill>}
              {preview.summary.warnings > 0 && <Pill tone="amber">{preview.summary.warnings} with warnings</Pill>}
              {preview.unmapped.length > 0 && <span className="text-xs text-muted-foreground">Ignored columns: {preview.unmapped.join(", ")}</span>}
            </div>
            <DataTable head={["Row", "Title", "ISRC", "Singer", "Release", "Check"]} className="max-h-[480px] overflow-y-auto">
              {preview.rows.map((r) => (
                <tr key={r.row} className={r.errors.length ? "bg-rose-50/60" : undefined}>
                  <Td className="text-xs text-muted-foreground">{r.row}</Td>
                  <Td className="font-medium">{r.data.title ?? "—"}</Td>
                  <Td className="font-mono text-xs">{r.data.isrc ?? "—"}</Td>
                  <Td className="text-xs">{r.data.singer ?? "—"}</Td>
                  <Td className="text-xs">{r.data.releaseTitle ?? "—"}</Td>
                  <Td className="text-xs">
                    {r.errors.map((e) => <div key={e} className="flex items-center gap-1 text-rose-700"><XCircle className="size-3.5" /> {e}</div>)}
                    {r.warnings.map((w) => <div key={w} className="text-amber-700">{w}</div>)}
                    {!r.errors.length && !r.warnings.length && <CheckCircle2 className="size-4 text-emerald-600" />}
                  </Td>
                </tr>
              ))}
            </DataTable>
          </SectionCard>
        )}

        <SectionCard title="Import history">
          <DataTable head={["File", "Date", "Status", "Result", ""]}>
            <StateRows rows={history.rows} cols={5} empty="No imports yet." />
            {history.rows?.map((b) => (
              <tr key={b.id}>
                <Td className="font-medium"><FileSpreadsheet className="mr-1.5 inline size-4 text-muted-foreground" />{b.filename}</Td>
                <Td className="text-xs text-muted-foreground">{fmtDate(b.createdAt, true)}</Td>
                <Td><Pill tone={b.status === "COMMITTED" ? "green" : b.status === "ROLLED_BACK" ? "slate" : "sky"}>{b.status.replace("_", " ").toLowerCase()}</Pill></Td>
                <Td className="text-xs">{b.summary.imported !== undefined ? `${b.summary.imported} imported, ${b.summary.skipped ?? 0} skipped` : `${b.summary.total ?? 0} rows previewed`}</Td>
                <Td className="text-right">{b.status === "COMMITTED" && <Button size="sm" variant="ghost" onClick={() => rollback(b)}><RotateCcw className="size-4" /> Roll back</Button>}</Td>
              </tr>
            ))}
          </DataTable>
        </SectionCard>
      </div>
    </>
  );
}
