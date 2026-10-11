"use client";
import Link from "next/link";
import { Fragment, useState } from "react";
import { Ban } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app-shell";
import { DataTable, Pill, Td } from "@/components/data-table";
import { LoadMore, StateRows, useFetch, useList } from "@/components/catalog";
import { StatusTag } from "@/components/cases";
import { api, errMsg, fmtDate } from "@/lib/api";
import { qs } from "@/lib/catalog";
import { assetTitle, PKG_STATUS, SHARE_STATE, type AssetLite } from "@/lib/cases";

type Row = { id: string; label: string | null; expiresAt: string; revokedAt: string | null; viewCount: number; maxViews: number | null; watermark: string | null; createdAt: string; state: string; package: AssetLite & { id: string; status: string }; _count: { accesses: number } };
type Access = { id: string; action: string; ip: string | null; userAgent: string | null; accessedAt: string };
const ACTION_TONE: Record<string, "green" | "red" | "sky" | "violet"> = { VIEW: "sky", DENIED: "red", DOWNLOAD_ZIP: "violet", DOWNLOAD_PDF: "violet" };

function AccessLog({ id }: { id: string }) {
  const { data } = useFetch<{ accesses: Access[] }>(`/shares/${id}`);
  if (!data) return <p className="p-3 text-xs text-muted-foreground">Loading…</p>;
  if (!data.accesses.length) return <p className="p-3 text-xs text-muted-foreground">Nobody has opened this link yet.</p>;
  return (
    <ul className="grid gap-1 p-3 text-xs">
      {data.accesses.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center gap-2"><Pill tone={ACTION_TONE[a.action] ?? "slate"}>{a.action.replace("_", " ").toLowerCase()}</Pill><span>{fmtDate(a.accessedAt, true)}</span><span className="font-mono text-muted-foreground">{a.ip}</span><span className="truncate text-muted-foreground">{a.userAgent}</span></li>
      ))}
    </ul>
  );
}

export default function SharesPage() {
  const [state, setState] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useList<Row>("/shares", qs({ state }));
  async function revoke(id: string) {
    try {
      await api(`/shares/${id}/revoke`, { method: "POST" });
      toast.success("Link revoked");
      await list.reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }
  return (
    <>
      <PageHeader title="Secure shares" description="Password-protected, expiring links to verification packages. Every view, wrong password and download is logged. Create new links from a package page." />
      <div className="mb-4 flex flex-wrap gap-2">
        {["", "active", "expired", "revoked"].map((s) => (
          <button key={s} onClick={() => setState(s)} className={`rounded-full border px-3 py-1 text-xs font-medium transition ${state === s ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>{s ? SHARE_STATE[s].label : "All"}</button>
        ))}
      </div>
      <DataTable head={["Package", "Label", "State", "Views", "Log", "Expires", ""]}>
        <StateRows rows={list.rows} cols={7} empty={<span>No share links yet. Open a <Link href="/packages" className="text-primary hover:underline">verification package</Link> to create one.</span>} />
        {list.rows?.map((l) => (
          <Fragment key={l.id}>
            <tr className="hover:bg-muted/30">
              <Td className="font-medium"><Link href={`/packages/${l.package.id}`} className="hover:underline">{assetTitle(l.package)}</Link> <StatusTag map={PKG_STATUS} status={l.package.status} /></Td>
              <Td className="text-xs">{l.label ?? "—"}{l.watermark ? <div className="text-muted-foreground">watermark: {l.watermark}</div> : null}</Td>
              <Td><StatusTag map={SHARE_STATE} status={l.state} /></Td>
              <Td className="text-xs">{l.viewCount}{l.maxViews ? ` / ${l.maxViews}` : ""}</Td>
              <Td><button onClick={() => setOpenId(openId === l.id ? null : l.id)} className="text-xs text-primary hover:underline">{l._count.accesses} entries</button></Td>
              <Td className="whitespace-nowrap text-xs">{fmtDate(l.expiresAt, true)}</Td>
              <Td className="text-right">{l.state === "active" && <Button size="sm" variant="outline" onClick={() => void revoke(l.id)}><Ban className="size-4" /> Revoke</Button>}</Td>
            </tr>
            {openId === l.id && <tr><td colSpan={7} className="bg-muted/30"><AccessLog id={l.id} /></td></tr>}
          </Fragment>
        ))}
      </DataTable>
      <LoadMore next={list.next} onMore={() => void list.more()} />
    </>
  );
}
