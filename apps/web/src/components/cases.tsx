"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/data-table";
import { SectionCard, useList } from "@/components/catalog";
import { api, errMsg, fmtDate } from "@/lib/api";
import { qs } from "@/lib/catalog";
import { DISPUTE_STATUS, PKG_STATUS, REG_STATUS, WARN_TONE, type Warning } from "@/lib/cases";
import { useSession } from "@/lib/session";

export function StatusTag({ map, status }: { map: Record<string, { label: string; tone: "slate" | "green" | "amber" | "red" | "violet" | "sky" }>; status: string }) {
  const s = map[status] ?? { label: status, tone: "slate" as const };
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

export function WarningsList({ warnings }: { warnings: Warning[] }) {
  if (!warnings.length) return <p className="text-sm text-emerald-700">No issues found in the recorded data.</p>;
  return (
    <ul className="grid gap-2">
      {warnings.map((w, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          <Pill tone={WARN_TONE[w.level]}>{w.level}</Pill>
          <span>{w.message}</span>
        </li>
      ))}
    </ul>
  );
}

export function GeneratePackageButton({ assetType, assetId, size }: { assetType: "WORK" | "RECORDING"; assetId: string; size?: "sm" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try {
      const r = await api<{ id: string; status: string }>("/packages", { method: "POST", json: { assetType, assetId, idempotencyKey: `ui-${crypto.randomUUID()}` } });
      toast.success(`Package generated — ${PKG_STATUS[r.status]?.label ?? r.status}`);
      router.push(`/packages/${r.id}`);
    } catch (e) {
      toast.error(errMsg(e));
      setBusy(false);
    }
  }
  return (
    <Button size={size} onClick={() => void go()} disabled={busy}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : <PackageCheck className="size-4" />} Generate proof package
    </Button>
  );
}

type Reg = { id: string; registry: string; status: string; diaryNo: string | null; registrationNo: string | null; nextDeadline: string | null };
type Disp = { id: string; counterparty: string; platform: string; status: string; deadline: string | null };
type Pkg = { id: string; status: string; generatedAt: string; warnings: Warning[] };

/** Registrations, disputes and proof packages for one work/recording. */
export function AssetCasesCard({ assetType, assetId }: { assetType: "WORK" | "RECORDING"; assetId: string }) {
  const { can } = useSession();
  const filter = qs(assetType === "WORK" ? { workId: assetId, limit: 20 } : { recordingId: assetId, limit: 20 });
  const regs = useList<Reg>("/registrations", filter);
  const disps = useList<Disp>("/disputes", filter);
  const pkgs = useList<Pkg>("/packages", filter);
  const row = "flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/40";
  return (
    <SectionCard title="Registrations, disputes & proof" action={can("packages.generate") && <GeneratePackageButton assetType={assetType} assetId={assetId} size="sm" />}>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="grid content-start gap-2">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Registrations</div>
          {regs.rows?.length ? regs.rows.map((r) => (
            <Link key={r.id} href={`/registrations/${r.id}`} className={row}><span className="truncate">{r.registrationNo ?? r.diaryNo ?? r.registry}</span><StatusTag map={REG_STATUS} status={r.status} /></Link>
          )) : <p className="text-sm text-muted-foreground">None. <Link href="/registrations" className="text-primary hover:underline">Add</Link></p>}
        </div>
        <div className="grid content-start gap-2">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Disputes</div>
          {disps.rows?.length ? disps.rows.map((d) => (
            <Link key={d.id} href={`/disputes/${d.id}`} className={row}><span className="truncate">{d.counterparty} · {d.platform}</span><StatusTag map={DISPUTE_STATUS} status={d.status} /></Link>
          )) : <p className="text-sm text-muted-foreground">No disputes.</p>}
        </div>
        <div className="grid content-start gap-2">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Proof packages</div>
          {pkgs.rows?.length ? pkgs.rows.slice(0, 5).map((p) => (
            <Link key={p.id} href={`/packages/${p.id}`} className={row}><span>{fmtDate(p.generatedAt, true)}</span><StatusTag map={PKG_STATUS} status={p.status} /></Link>
          )) : <p className="text-sm text-muted-foreground">Not generated yet.</p>}
        </div>
      </div>
    </SectionCard>
  );
}
