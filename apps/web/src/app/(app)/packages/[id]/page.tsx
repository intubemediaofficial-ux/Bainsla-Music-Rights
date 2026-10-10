"use client";
import Link from "next/link";
import { use, useState } from "react";
import { Ban, Copy, Download, FileText, Share2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/app-shell";
import { DataTable, Pill, Td } from "@/components/data-table";
import { Field } from "@/components/field";
import { DetailSkeleton, FormDialog, InfoGrid, SectionCard, useFetch } from "@/components/catalog";
import { GeneratePackageButton, StatusTag, WarningsList } from "@/components/cases";
import { api, errMsg, fmtDate } from "@/lib/api";
import { assetHref, str } from "@/lib/catalog";
import { assetCode, assetTitle, downloadPackage, PKG_STATUS, SHARE_STATE, type AssetLite, type Warning } from "@/lib/cases";
import { fmtBytes } from "@/lib/documents";
import { useSession } from "@/lib/session";

type FileRow = { path: string; sha256: string; bytes: number; source?: { documentId: string; title: string; status: string; category: string } };
type Pkg = AssetLite & {
  id: string; status: string; warnings: Warning[]; sha256: string | null; generatedAt: string; hasPdf: boolean;
  manifest: { files: FileRow[]; disclaimer: string };
  shareLinks: { id: string; label: string | null; expiresAt: string; revokedAt: string | null; viewCount: number; maxViews: number | null; createdAt: string }[];
};
const linkState = (l: Pkg["shareLinks"][number]) => (l.revokedAt ? "revoked" : new Date(l.expiresAt) < new Date() ? "expired" : l.maxViews != null && l.viewCount >= l.maxViews ? "exhausted" : "active");

export default function PackagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useSession();
  const { data: p, error, reload } = useFetch<Pkg>(`/packages/${id}`);
  const [share, setShare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ url: string; password: string } | null>(null);
  if (!p) return <DetailSkeleton error={error} />;
  const assetId = (p.work?.id ?? p.recording?.id)!;

  async function createShare(f: FormData) {
    setBusy(true);
    try {
      const password = str(f, "password") ?? "";
      const r = await api<{ url: string }>("/shares", { method: "POST", json: { packageId: id, label: str(f, "label"), password, expiresInDays: Number(str(f, "days") ?? 7), maxViews: str(f, "maxViews") ? Number(str(f, "maxViews")) : null, watermark: str(f, "watermark") } });
      setShare(false);
      setCreated({ url: r.url, password });
      await reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  async function revoke(linkId: string) {
    try {
      await api(`/shares/${linkId}/revoke`, { method: "POST" });
      toast.success("Link revoked");
      await reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  return (
    <>
      <PageHeader
        title={`Proof package — ${assetTitle(p)}`}
        description={`Generated ${fmtDate(p.generatedAt, true)}`}
        actions={<div className="flex flex-wrap gap-2">
          {p.hasPdf && <Button variant="outline" onClick={() => downloadPackage(id, "pdf")}><FileText className="size-4" /> PDF summary</Button>}
          <Button variant="outline" onClick={() => downloadPackage(id, "zip")}><Download className="size-4" /> ZIP</Button>
          {can("shares.manage") && <Button onClick={() => setShare(true)}><Share2 className="size-4" /> Secure share</Button>}
          {can("packages.generate") && <GeneratePackageButton assetType={p.assetType as "WORK" | "RECORDING"} assetId={assetId} />}
        </div>}
      />
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" /> {p.manifest.disclaimer}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <SectionCard title={<span className="flex items-center gap-2">Verification status <StatusTag map={PKG_STATUS} status={p.status} /></span>}>
          <InfoGrid items={[
            ["Song", <Link key="a" href={assetHref(p)} className="text-primary hover:underline">{assetTitle(p)}{assetCode(p) ? ` · ${assetCode(p)}` : ""}</Link>],
            ["Files", String(p.manifest.files.length)], ["Evidence files", String(p.manifest.files.filter((f) => f.source).length)],
            ["ZIP SHA-256", <span key="h" className="break-all font-mono text-xs">{p.sha256}</span>],
          ]} />
        </SectionCard>
        <SectionCard title={`Warnings (${p.warnings.length})`}><WarningsList warnings={p.warnings} /></SectionCard>
      </div>
      <SectionCard title="Manifest" className="mt-6">
        <DataTable head={["File", "Source", "Size", "SHA-256"]}>
          {p.manifest.files.map((f) => (
            <tr key={f.path}>
              <Td className="font-mono text-xs">{f.path}</Td>
              <Td className="text-xs">{f.source ? <Link href={`/documents/${f.source.documentId}`} className="hover:underline">{f.source.title} <Pill tone={f.source.status === "EXECUTED" ? "green" : "slate"}>{f.source.status.toLowerCase()}</Pill></Link> : "generated"}</Td>
              <Td className="whitespace-nowrap text-xs">{fmtBytes(f.bytes)}</Td>
              <Td className="max-w-72 break-all font-mono text-[11px] text-muted-foreground">{f.sha256}</Td>
            </tr>
          ))}
        </DataTable>
      </SectionCard>
      <SectionCard title="Secure share links" className="mt-6">
        {p.shareLinks.length ? (
          <DataTable head={["Label", "State", "Views", "Expires", "Created", ""]}>
            {p.shareLinks.map((l) => {
              const st = linkState(l);
              return (
                <tr key={l.id}>
                  <Td className="text-sm">{l.label ?? "—"}</Td>
                  <Td><StatusTag map={SHARE_STATE} status={st} /></Td>
                  <Td className="text-xs">{l.viewCount}{l.maxViews ? ` / ${l.maxViews}` : ""}</Td>
                  <Td className="whitespace-nowrap text-xs">{fmtDate(l.expiresAt, true)}</Td>
                  <Td className="whitespace-nowrap text-xs">{fmtDate(l.createdAt)}</Td>
                  <Td className="text-right">
                    <Link href="/shares" className="mr-2 text-xs text-primary hover:underline">Access log</Link>
                    {st === "active" && can("shares.manage") && <Button size="sm" variant="outline" onClick={() => void revoke(l.id)}><Ban className="size-4" /> Revoke</Button>}
                  </Td>
                </tr>
              );
            })}
          </DataTable>
        ) : <p className="text-sm text-muted-foreground">Not shared yet.</p>}
      </SectionCard>

      <FormDialog open={share} onOpenChange={setShare} title="Create secure share link" description="Recipient needs the password. Every view and download is logged; you can revoke any time." onSubmit={(f) => void createShare(f)} busy={busy} submitLabel="Create link">
        <Field label="Label (who is it for?)" name="label" placeholder="YouTube dispute team" />
        <Field label="Password (min 8 characters)" name="password" type="text" required minLength={8} autoComplete="off" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Expires after (days)" name="days" type="number" min={1} max={90} defaultValue={7} />
          <Field label="Max views (optional)" name="maxViews" type="number" min={1} max={1000} />
        </div>
        <Field label="Watermark text on PDF (optional)" name="watermark" placeholder="Confidential — for dispute #123" />
      </FormDialog>
      <Dialog open={!!created} onOpenChange={(o) => !o && setCreated(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share link created</DialogTitle>
            <DialogDescription>Copy it now — the link is shown only once. Send the password separately.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input readOnly value={created?.url ?? ""} onFocus={(e) => e.currentTarget.select()} />
            <Button variant="outline" onClick={() => void navigator.clipboard.writeText(created?.url ?? "").then(() => toast.success("Copied"))}><Copy className="size-4" /></Button>
          </div>
          <p className="text-sm">Password: <span className="font-mono">{created?.password}</span></p>
        </DialogContent>
      </Dialog>
    </>
  );
}
