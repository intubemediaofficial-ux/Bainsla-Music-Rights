"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app-shell";
import { DataTable, Pill, Td } from "@/components/data-table";
import { AssetField, FormDialog, LoadMore, SearchBox, StateRows, Toolbar, useList } from "@/components/catalog";
import { StatusTag } from "@/components/cases";
import { api, errMsg, fmtDate } from "@/lib/api";
import { assetHref, qs, str } from "@/lib/catalog";
import { assetCode, assetTitle, downloadPackage, PKG_STATUS, type AssetLite, type Warning } from "@/lib/cases";
import { useSession } from "@/lib/session";

type Row = AssetLite & { id: string; status: string; warnings: Warning[]; sha256: string | null; generatedAt: string; hasPdf: boolean; _count: { shareLinks: number } };

export default function PackagesPage() {
  const { can } = useSession();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const list = useList<Row>("/packages", qs({ q, status }));
  const counts = (list.extra.counts ?? {}) as Record<string, number>;

  async function generate(f: FormData) {
    setBusy(true);
    try {
      const r = await api<{ id: string }>("/packages", { method: "POST", json: { assetType: str(f, "assetType"), assetId: str(f, "assetId"), idempotencyKey: `ui-${crypto.randomUUID()}` } });
      toast.success("Package generated");
      router.push(`/packages/${r.id}`);
    } catch (e) {
      toast.error(errMsg(e));
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Verification packages"
        description="One-click proof bundle for a song: PDF summary + ZIP of signed evidence with a SHA-256 manifest and missing-document warnings. Share it with a secure, expiring link."
        actions={can("packages.generate") && <Button onClick={() => setOpen(true)}><PackagePlus className="size-4" /> Generate package</Button>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {["", ...Object.keys(PKG_STATUS)].map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`rounded-full border px-3 py-1 text-xs font-medium transition ${status === s ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>
            {s ? PKG_STATUS[s].label : "All"}{s && counts[s] ? <span className="ml-1 opacity-70">{counts[s]}</span> : null}
          </button>
        ))}
      </div>
      <Toolbar><SearchBox value={q} onChange={setQ} placeholder="Search song or ISRC…" /></Toolbar>
      <DataTable head={["Song", "Status", "Warnings", "Shares", "Generated", ""]}>
        <StateRows rows={list.rows} cols={6} empty="No packages yet. Generate one from a work or recording." />
        {list.rows?.map((p) => {
          const errs = p.warnings.filter((w) => w.level === "error").length;
          const warns = p.warnings.filter((w) => w.level === "warn").length;
          return (
            <tr key={p.id} className="hover:bg-muted/30">
              <Td className="font-medium">
                <Link href={`/packages/${p.id}`} className="hover:underline">{assetTitle(p)}</Link>
                <div className="text-xs text-muted-foreground"><Link href={assetHref(p)} className="hover:underline">{p.assetType === "WORK" ? "Work" : "Recording"}{assetCode(p) ? ` · ${assetCode(p)}` : ""}</Link></div>
              </Td>
              <Td><StatusTag map={PKG_STATUS} status={p.status} /></Td>
              <Td className="text-xs"><div className="flex gap-1">{errs > 0 && <Pill tone="red">{errs} error</Pill>}{warns > 0 && <Pill tone="amber">{warns} warning</Pill>}{!errs && !warns && <Pill tone="green">clear</Pill>}</div></Td>
              <Td className="text-xs">{p._count.shareLinks}</Td>
              <Td className="whitespace-nowrap text-xs">{fmtDate(p.generatedAt, true)}</Td>
              <Td className="text-right"><Button size="sm" variant="outline" onClick={() => downloadPackage(p.id, "zip")}><Download className="size-4" /> ZIP</Button></Td>
            </tr>
          );
        })}
      </DataTable>
      <LoadMore next={list.next} onMore={() => void list.more()} />
      <FormDialog open={open} onOpenChange={setOpen} title="Generate verification package" description="Collects catalog data, credits, ownership claims, agreements, licences, registrations, disputes and signed evidence for one song." onSubmit={(f) => void generate(f)} busy={busy} submitLabel="Generate" wide>
        <AssetField />
      </FormDialog>
    </>
  );
}
