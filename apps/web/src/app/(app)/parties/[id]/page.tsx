"use client";
import Link from "next/link";
import { use, useState } from "react";
import { Archive, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app-shell";
import { DataTable, Pill, Td } from "@/components/data-table";
import { ArchivedBanner, DetailSkeleton, FormDialog, InfoGrid, SectionCard, useFetch } from "@/components/catalog";
import { PartyFields, partyPayload } from "@/components/catalog-forms";
import { api, errMsg, fmtDate } from "@/lib/api";
import { assetHref, Claim, CLAIM_STATUS, CREDIT_ROLE, pct, RIGHT_LABEL, titleCase } from "@/lib/catalog";
import { useSession } from "@/lib/session";
import { DocumentsCard } from "@/components/documents";

type Party = {
  id: string; legalName: string; stageName: string | null; types: string[]; email: string | null; phone: string | null; address: string | null; notes: string | null; archivedAt: string | null;
  identifiers: { ipi: string | null; iprsId: string | null; ifsc: string | null; panMasked: string | null; bankMasked: string | null };
  contributions: { id: string; role: string; work: { id: string; title: string } | null; recording: { id: string; title: string; isrc: string | null } | null }[];
  rightsClaims: Claim[];
  licenses: { id: string; licenseeName: string; endDate: string | null }[];
};

export default function PartyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useSession();
  const { data: p, error, reload } = useFetch<Party>(`/parties/${id}`);
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!p) return <DetailSkeleton error={error} />;
  const write = can("catalog.write");

  async function save(f: FormData) {
    setBusy(true);
    try {
      await api(`/parties/${id}`, { method: "PATCH", json: partyPayload(f, true) });
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
    if (!restore && !confirm("Archive this party?")) return;
    try {
      await api(restore ? `/parties/${id}/restore` : `/parties/${id}`, { method: restore ? "POST" : "DELETE" });
      void reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }
  const ids = p.identifiers;

  return (
    <>
      <div className="mb-2 text-sm text-muted-foreground"><Link href="/parties" className="hover:underline">Parties</Link> /</div>
      <PageHeader
        title={p.legalName}
        description={p.stageName ? `Also known as ${p.stageName}` : p.types.map(titleCase).join(", ")}
        actions={write && (
          <>
            <Button variant="outline" onClick={() => setEdit(true)}><Pencil className="size-4" /> Edit</Button>
            {!p.archivedAt && <Button variant="outline" onClick={() => archive()}><Archive className="size-4" /> Archive</Button>}
          </>
        )}
      />
      <ArchivedBanner archivedAt={p.archivedAt} onRestore={write ? () => archive(true) : undefined} />
      <div className="grid gap-6">
        <SectionCard title="Details">
          <InfoGrid
            items={[
              ["Type", p.types.length ? <div className="flex flex-wrap gap-1">{p.types.map((t) => <Pill key={t} tone="violet">{titleCase(t)}</Pill>)}</div> : null],
              ["Email", p.email], ["Phone", p.phone], ["Address", p.address],
              ["IPI", ids.ipi], ["IPRS ID", ids.iprsId], ["PAN", ids.panMasked], ["Bank account", ids.bankMasked], ["IFSC", ids.ifsc], ["Notes", p.notes],
            ]}
          />
        </SectionCard>
        <SectionCard title={`Ownership claims (${p.rightsClaims.length})`}>
          <DataTable head={["Asset", "Right", "Share", "Territory", "Status"]}>
            {p.rightsClaims.length === 0 && <tr><Td colSpan={5} className="py-6 text-center text-muted-foreground">No claims.</Td></tr>}
            {p.rightsClaims.map((c) => (
              <tr key={c.id}>
                <Td><Link href={assetHref(c)} className="font-medium hover:underline">{c.work?.title ?? c.recording?.title}</Link> <span className="text-xs text-muted-foreground">{c.assetType === "WORK" ? "work" : "recording"}</span></Td>
                <Td>{RIGHT_LABEL[c.rightType]}</Td>
                <Td className="font-semibold">{pct(c.sharePercent)}</Td>
                <Td className="text-xs">{c.territories.join(", ")}</Td>
                <Td><Pill tone={CLAIM_STATUS[c.status]?.tone}>{CLAIM_STATUS[c.status]?.label}</Pill></Td>
              </tr>
            ))}
          </DataTable>
        </SectionCard>
        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard title={`Credits (${p.contributions.length})`}>
            {p.contributions.length === 0 ? <p className="text-sm text-muted-foreground">No credits.</p> : (
              <ul className="divide-y rounded-lg border">
                {p.contributions.map((c) => (
                  <li key={c.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <Link href={c.work ? `/works/${c.work.id}` : `/recordings/${c.recording?.id}`} className="font-medium hover:underline">{c.work?.title ?? c.recording?.title}</Link>
                    <span className="text-xs text-muted-foreground">{CREDIT_ROLE[c.role]} · {c.work ? "work" : "recording"}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
          <SectionCard title={`Licenses held (${p.licenses.length})`}>
            {p.licenses.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : (
              <ul className="divide-y rounded-lg border">
                {p.licenses.map((l) => <li key={l.id} className="flex justify-between px-3 py-2 text-sm"><span>{l.licenseeName}</span><span className="text-xs text-muted-foreground">until {fmtDate(l.endDate)}</span></li>)}
              </ul>
            )}
          </SectionCard>
        </div>
        <DocumentsCard ownerType="PARTY" ownerId={id} />
      </div>
      <FormDialog open={edit} onOpenChange={setEdit} title="Edit party" onSubmit={save} busy={busy} wide>
        <PartyFields p={p} />
      </FormDialog>
    </>
  );
}
