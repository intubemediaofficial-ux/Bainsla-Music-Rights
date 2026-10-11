"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app-shell";
import { DataTable, Pill, Td } from "@/components/data-table";
import { NativeSelect } from "@/components/field";
import { LicenseDialog, licenseState, LoadMore, SearchBox, StateRows, Toolbar, useList } from "@/components/catalog";
import { api, errMsg, fmtDate } from "@/lib/api";
import { assetHref, License, qs } from "@/lib/catalog";
import { useSession } from "@/lib/session";

export default function LicensesPage() {
  const { can } = useSession();
  const [q, setQ] = useState("");
  const [state, setState] = useState("");
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("state");
    if (s) setTimeout(() => setState(s), 0);
  }, []);
  const list = useList<License>("/licenses", qs({ q, state }));
  const [open, setOpen] = useState(false);
  async function remove(l: License) {
    if (!confirm(`Delete the license to ${l.licenseeName}?`)) return;
    try {
      await api(`/licenses/${l.id}`, { method: "DELETE" });
      void list.reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }
  return (
    <>
      <PageHeader title="Licenses" description="Permissions you've granted others — film sync, ads, broadcast — with expiry tracking." actions={can("rights.write") && <Button onClick={() => setOpen(true)}><Plus className="size-4" /> New license</Button>} />
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Search licensee or song…" />
        <div className="w-48">
          <NativeSelect value={state} onChange={(e) => setState(e.target.value)} aria-label="State">
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="expiring">Expiring in 60 days</option>
            <option value="expired">Expired</option>
          </NativeSelect>
        </div>
      </Toolbar>
      <DataTable head={["Licensee", "Asset", "Territory", "Uses", "Period", "Status", ""]}>
        <StateRows rows={list.rows} cols={7} empty="No licenses." />
        {list.rows?.map((l) => {
          const s = licenseState(l);
          return (
            <tr key={l.id} className="hover:bg-muted/30">
              <Td className="font-medium">{l.licenseeName} {l.exclusive && <Pill tone="violet">exclusive</Pill>}</Td>
              <Td><Link href={assetHref(l)} className="hover:underline">{l.work?.title ?? l.recording?.title}</Link></Td>
              <Td className="text-xs">{l.territories.join(", ")}</Td>
              <Td className="text-xs text-muted-foreground">{l.permittedUses.join(", ") || "—"}</Td>
              <Td className="whitespace-nowrap text-xs">{fmtDate(l.startDate)} → {l.endDate ? fmtDate(l.endDate) : "open"}</Td>
              <Td><Pill tone={s.tone}>{s.label}</Pill></Td>
              <Td className="text-right">{can("rights.write") && <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => remove(l)}><Trash2 className="size-4 text-muted-foreground" /></Button>}</Td>
            </tr>
          );
        })}
      </DataTable>
      <LoadMore next={list.next} onMore={() => void list.more()} />
      <LicenseDialog open={open} onOpenChange={setOpen} onSaved={() => void list.reload()} />
    </>
  );
}
