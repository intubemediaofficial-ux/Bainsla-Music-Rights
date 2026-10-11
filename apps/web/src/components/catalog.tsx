"use client";
import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { AlertTriangle, ArrowRightLeft, Loader2, MoreHorizontal, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable, Pill, Td } from "@/components/data-table";
import { Field, NativeSelect } from "@/components/field";
import { api, ApiError, errMsg, fmtDate } from "@/lib/api";
import { useSession } from "@/lib/session";
import {
  AssetKind, AssetRights, Claim, CLAIM_STATUS, Credit, CREDIT_ROLE, dateOrNull, isoDay, Issue, License, Page, PartyLite, partyName, pct,
  RECORDING_ROLES, RIGHT_LABEL, RIGHT_TYPES, str, territories, WORK_ROLES,
} from "@/lib/catalog";

export function useList<T>(path: string, query: string) {
  const [rows, setRows] = useState<T[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [extra, setExtra] = useState<Record<string, unknown>>({});
  const load = useCallback(
    async (cursor?: string) => {
      try {
        const r = await api<Page<T> & Record<string, unknown>>(`${path}?${query}${cursor ? `${query ? "&" : ""}cursor=${cursor}` : ""}`);
        setRows((prev) => (cursor && prev ? [...prev, ...r.data] : r.data));
        setNext(r.nextCursor);
        setExtra(r);
      } catch (e) {
        toast.error(errMsg(e));
        setRows([]);
      }
    },
    [path, query],
  );
  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [load]);
  return { rows, next, extra, reload: () => load(), more: () => (next ? load(next) : undefined) };
}

export function useFetch<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!path) return;
    try {
      setData(await api<T>(path));
    } catch (e) {
      setError(errMsg(e));
    }
  }, [path]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);
  return { data, error, reload: load };
}

export function SearchBox({ value, onChange, placeholder = "Search…" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative w-full max-w-sm">
      <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-10 pl-9" />
    </div>
  );
}

export function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-center gap-2">{children}</div>;
}

export function StateRows({ rows, cols, empty }: { rows: unknown[] | null; cols: number; empty: React.ReactNode }) {
  if (rows === null)
    return (
      <tr>
        <Td colSpan={cols} className="py-10 text-center text-muted-foreground">
          <Loader2 className="mx-auto size-5 animate-spin" />
        </Td>
      </tr>
    );
  if (!rows.length)
    return (
      <tr>
        <Td colSpan={cols} className="py-12 text-center text-sm text-muted-foreground">
          {empty}
        </Td>
      </tr>
    );
  return null;
}

export function LoadMore({ next, onMore }: { next: string | null; onMore: () => void }) {
  if (!next) return null;
  return (
    <div className="mt-4 flex justify-center">
      <Button variant="outline" onClick={onMore}>
        Load more
      </Button>
    </div>
  );
}

export function FormDialog({
  open, onOpenChange, title, description, onSubmit, busy, submitLabel = "Save", children, wide, footer,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; onSubmit: (f: FormData) => void; busy?: boolean;
  submitLabel?: string; children: React.ReactNode; wide?: boolean; footer?: React.ReactNode;
}) {
  const id = useId();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={wide ? "sm:max-w-2xl" : undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form
          id={id}
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(new FormData(e.currentTarget));
          }}
          className="-mx-1 grid max-h-[65vh] gap-4 overflow-y-auto px-1 py-0.5"
        >
          {children}
        </form>
        <DialogFooter>
          {footer}
          <Button type="submit" form={id} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />} {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TextArea({ label, ...p }: React.ComponentProps<"textarea"> & { label: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={p.name}>{label}</Label>
      <textarea id={p.name} rows={3} {...p} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />
    </div>
  );
}

export function InfoGrid({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{k}</dt>
          <dd className="mt-1 text-sm break-words">{v || v === 0 ? v : "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SectionCard({ title, action, children, className }: { title: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** Party dropdown with an inline "add new person/company" option. Use resolveParty() on submit. */
export function PartyField({ name = "partyId", label = "Person / company", defaultValue, exclude }: { name?: string; label?: string; defaultValue?: string; exclude?: string }) {
  const [parties, setParties] = useState<PartyLite[]>([]);
  const [val, setVal] = useState(defaultValue ?? "");
  useEffect(() => {
    api<Page<PartyLite>>("/parties?limit=200").then((r) => setParties(r.data), () => setParties([]));
  }, []);
  return (
    <div className="grid gap-2">
      <NativeSelect label={label} name={name} value={val} onChange={(e) => setVal(e.target.value)} required>
        <option value="" disabled>
          Choose…
        </option>
        {parties.filter((p) => p.id !== exclude).map((p) => (
          <option key={p.id} value={p.id}>
            {partyName(p)}
          </option>
        ))}
        <option value="__new">+ Add a new person / company…</option>
      </NativeSelect>
      {val === "__new" && <Input name={`${name}New`} placeholder="Legal name" required className="h-10" autoFocus />}
    </div>
  );
}
export async function resolveParty(f: FormData, name = "partyId") {
  const v = String(f.get(name) ?? "");
  if (v !== "__new") return v;
  const p = await api<{ id: string }>("/parties", { json: { legalName: String(f.get(`${name}New`) ?? "").trim() } });
  return p.id;
}

/** Work-or-recording picker. */
export function AssetField({ defaultType = "RECORDING" }: { defaultType?: AssetKind }) {
  const [type, setType] = useState<AssetKind>(defaultType);
  const [items, setItems] = useState<{ id: string; title: string; isrc?: string | null; version?: string | null }[]>([]);
  useEffect(() => {
    api<Page<{ id: string; title: string }>>(`/${type === "WORK" ? "works" : "recordings"}?limit=200`).then((r) => setItems(r.data), () => setItems([]));
  }, [type]);
  return (
    <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
      <NativeSelect label="Asset type" name="assetType" value={type} onChange={(e) => setType(e.target.value as AssetKind)}>
        <option value="RECORDING">Recording</option>
        <option value="WORK">Musical work</option>
      </NativeSelect>
      <NativeSelect label={type === "WORK" ? "Work" : "Recording"} name="assetId" required defaultValue="">
        <option value="" disabled>
          Choose…
        </option>
        {items.map((i) => (
          <option key={i.id} value={i.id}>
            {i.title}
            {i.version ? ` (${i.version})` : ""}
            {i.isrc ? ` · ${i.isrc}` : ""}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

export function CreditsCard({ assetType, assetId, credits, onChange }: { assetType: AssetKind; assetId: string; credits: Credit[]; onChange: () => void }) {
  const { can } = useSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const roles = assetType === "WORK" ? WORK_ROLES : RECORDING_ROLES;
  async function add(f: FormData) {
    setBusy(true);
    try {
      await api("/contributions", { json: { assetType, assetId, partyId: await resolveParty(f), role: f.get("role"), creditOrder: Number(f.get("order") || 1) } });
      toast.success("Credit added");
      setOpen(false);
      onChange();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    try {
      await api(`/contributions/${id}`, { method: "DELETE" });
      onChange();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }
  return (
    <SectionCard
      title="Credits"
      action={can("catalog.write") && <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus className="size-4" /> Add credit</Button>}
    >
      <p className="mb-3 text-xs text-muted-foreground">Who wrote, composed, sang or produced it. Credits are not ownership — add ownership under Rights.</p>
      {credits.length === 0 ? (
        <p className="text-sm text-muted-foreground">No credits yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {credits.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <div>
                <Link href={`/parties/${c.party.id}`} className="font-medium hover:underline">{partyName(c.party)}</Link>
                <span className="ml-2 text-muted-foreground">{CREDIT_ROLE[c.role] ?? c.role}</span>
              </div>
              {can("catalog.write") && (
                <Button variant="ghost" size="icon" aria-label="Remove credit" onClick={() => remove(c.id)}>
                  <Trash2 className="size-4 text-muted-foreground" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <FormDialog open={open} onOpenChange={setOpen} title="Add credit" onSubmit={add} busy={busy} submitLabel="Add">
        <PartyField />
        <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
          <NativeSelect label="Role" name="role" defaultValue={roles[0]}>
            {roles.map((r) => <option key={r} value={r}>{CREDIT_ROLE[r]}</option>)}
          </NativeSelect>
          <Field label="Order" name="order" type="number" min={1} defaultValue={1} />
        </div>
      </FormDialog>
    </SectionCard>
  );
}

function IssueList({ issues }: { issues: Issue[] }) {
  return (
    <ul className="space-y-1">
      {issues.map((i, n) => (
        <li key={n} className="flex items-start gap-2 text-sm text-rose-700">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {i.kind === "OVER_100"
            ? `${RIGHT_LABEL[i.rightType] ?? i.rightType}: ${pct(i.total)} claimed in ${i.territory === "WW" ? "worldwide" : i.territory}${i.from || i.to ? ` (${i.from ? fmtDate(i.from) : "start"} → ${i.to ? fmtDate(i.to) : "open"})` : ""} — more than 100%`
            : `${RIGHT_LABEL[i.rightType] ?? i.rightType}: the same party has two overlapping claims`}
        </li>
      ))}
    </ul>
  );
}

export function ShareBar({ value }: { value: number }) {
  const over = value > 100.0001;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className={over ? "h-full bg-rose-500" : value >= 99.9999 ? "h-full bg-emerald-500" : "h-full bg-amber-400"} style={{ width: `${Math.min(value, 100)}%` }} />
    </div>
  );
}

const TERR_HINT = "ISO country codes, comma separated (IN, US…). WW = worldwide.";

export function RightsCard({ assetType, assetId, rights, onChange }: { assetType: AssetKind; assetId: string; rights: AssetRights; onChange: () => void }) {
  const { can } = useSession();
  const write = can("rights.write");
  const approve = can("rights.approve");
  const [edit, setEdit] = useState<Claim | "new" | null>(null);
  const [transfer, setTransfer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<{ issues: Issue[]; payload: Record<string, unknown> } | null>(null);
  const claims = rights.rightsClaims;

  async function saveClaim(payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const target = edit;
      const r = target && target !== "new"
        ? await api<{ issues: Issue[] }>(`/rights/claims/${target.id}`, { method: "PATCH", json: payload })
        : await api<{ issues: Issue[] }>("/rights/claims", { json: payload });
      toast[r.issues.length ? "warning" : "success"](r.issues.length ? "Saved as disputed — shares exceed 100%" : "Claim saved");
      setEdit(null);
      setConflict(null);
      onChange();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setConflict({ issues: (e.body as { issues: Issue[] }).issues ?? [], payload });
      else toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  async function submitClaim(f: FormData) {
    const base = {
      sharePercent: Number(f.get("share")), territories: territories(f),
      startDate: dateOrNull(f, "startDate"), endDate: dateOrNull(f, "endDate"), basis: str(f, "basis"),
    };
    if (edit && edit !== "new") return saveClaim(base);
    try {
      return saveClaim({ ...base, assetType, assetId, partyId: await resolveParty(f), rightType: f.get("rightType") });
    } catch (e) {
      toast.error(errMsg(e));
    }
  }
  async function status(c: Claim, s: string) {
    try {
      await api(`/rights/claims/${c.id}/status`, { json: { status: s } });
      toast.success(`Marked ${CLAIM_STATUS[s].label.toLowerCase()}`);
      onChange();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }
  async function remove(c: Claim) {
    if (!confirm(`Delete ${partyName(c.party)}'s ${pct(c.sharePercent)} claim?`)) return;
    try {
      await api(`/rights/claims/${c.id}`, { method: "DELETE" });
      onChange();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }
  async function submitTransfer(f: FormData) {
    setBusy(true);
    try {
      const [fromPartyId, rightType] = String(f.get("from")).split("|");
      await api("/rights/transfers", {
        json: { assetType, assetId, fromPartyId, rightType, toPartyId: await resolveParty(f, "to"), sharePercent: Number(f.get("share")), territories: territories(f), effectiveDate: dateOrNull(f, "effectiveDate"), scope: str(f, "scope") },
      });
      toast.success("Transfer recorded");
      setTransfer(false);
      onChange();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const current = edit && edit !== "new" ? edit : null;
  const sources = claims.filter((c) => !["REJECTED", "DISPUTED"].includes(c.status));
  return (
    <SectionCard
      title={<span className="flex items-center gap-2">Rights & ownership {rights.hasConflicts && <Pill tone="red">conflict</Pill>}</span>}
      action={
        write && (
          <div className="flex gap-2">
            {sources.length > 0 && <Button size="sm" variant="outline" onClick={() => setTransfer(true)}><ArrowRightLeft className="size-4" /> Transfer</Button>}
            <Button size="sm" onClick={() => (setConflict(null), setEdit("new"))}><Plus className="size-4" /> Add claim</Button>
          </div>
        )
      }
    >
      {rights.validation.length > 0 && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          {rights.validation.map((v) => (
            <div key={v.rightType} className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium">{RIGHT_LABEL[v.rightType] ?? v.rightType}</span>
                <span className={v.maxTotal > 100 ? "font-semibold text-rose-600" : "text-muted-foreground"}>{pct(v.worldwideTotal)} worldwide</span>
              </div>
              <ShareBar value={Math.max(v.worldwideTotal, v.maxTotal)} />
              {v.issues.length > 0 && <div className="mt-2"><IssueList issues={v.issues} /></div>}
              {v.issues.length === 0 && v.maxTotal < 100 && <p className="mt-2 text-xs text-amber-700">{pct(100 - v.maxTotal)} not yet accounted for</p>}
            </div>
          ))}
        </div>
      )}
      <DataTable head={["Party", "Right", "Share", "Territory", "Period", "Status", ""]}>
        <StateRows rows={claims} cols={7} empty="No ownership claims yet. Add who owns what share of this asset." />
        {claims.map((c) => (
          <tr key={c.id} className={c.status === "REJECTED" ? "opacity-50" : undefined}>
            <Td><Link href={`/parties/${c.party.id}`} className="font-medium hover:underline">{partyName(c.party)}</Link></Td>
            <Td className="whitespace-nowrap">{RIGHT_LABEL[c.rightType] ?? c.rightType}</Td>
            <Td className="font-semibold tabular-nums">{pct(c.sharePercent)}</Td>
            <Td className="text-xs">{c.territories.join(", ")}</Td>
            <Td className="whitespace-nowrap text-xs text-muted-foreground">{c.startDate || c.endDate ? `${fmtDate(c.startDate)} → ${c.endDate ? fmtDate(c.endDate) : "open"}` : "Perpetual"}</Td>
            <Td><Pill tone={CLAIM_STATUS[c.status]?.tone}>{CLAIM_STATUS[c.status]?.label ?? c.status}</Pill></Td>
            <Td className="text-right">
              {write && (
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Claim actions" />}>
                    <MoreHorizontal className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    {c.status !== "DOCUMENTED" && <DropdownMenuItem onClick={() => (setConflict(null), setEdit(c))}>Edit share / territory / dates</DropdownMenuItem>}
                    {c.status !== "UNDER_REVIEW" && <DropdownMenuItem onClick={() => status(c, "UNDER_REVIEW")}>Send for review</DropdownMenuItem>}
                    {approve && c.status !== "REVIEWED" && <DropdownMenuItem onClick={() => status(c, "REVIEWED")}>Mark internally reviewed</DropdownMenuItem>}
                    {approve && c.status !== "DOCUMENTED" && <DropdownMenuItem onClick={() => status(c, "DOCUMENTED")}>Mark documented (signed evidence)</DropdownMenuItem>}
                    {c.status !== "DISPUTED" && <DropdownMenuItem onClick={() => status(c, "DISPUTED")}>Mark disputed</DropdownMenuItem>}
                    {approve && c.status !== "REJECTED" && <DropdownMenuItem onClick={() => status(c, "REJECTED")}>Reject</DropdownMenuItem>}
                    {!["REVIEWED", "DOCUMENTED"].includes(c.status) && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onClick={() => remove(c)}>Delete</DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </Td>
          </tr>
        ))}
      </DataTable>

      {rights.transfers.length > 0 && (
        <div className="mt-5">
          <h4 className="mb-2 text-sm font-medium">Transfer history</h4>
          <ul className="space-y-1.5 text-sm">
            {rights.transfers.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
                <ArrowRightLeft className="size-3.5" />
                <span className="font-medium text-foreground">{t.fromParty.legalName}</span> → <span className="font-medium text-foreground">{t.toParty.legalName}</span>
                · {pct(t.sharePercent)} {RIGHT_LABEL[t.rightType]} · {t.territories.join(", ")} · {fmtDate(t.effectiveDate ?? t.createdAt)}
                {t.scope && <span>· {t.scope}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <FormDialog
        open={edit !== null}
        onOpenChange={(o) => !o && setEdit(null)}
        title={current ? `Edit ${partyName(current.party)}'s claim` : "Add ownership claim"}
        description="A claim is what someone says they own. Mark it reviewed after checking, and documented only when signed evidence exists."
        onSubmit={submitClaim}
        busy={busy}
        wide
        footer={conflict && <Button type="button" variant="destructive" disabled={busy} onClick={() => saveClaim({ ...conflict.payload, markDisputed: true })}>Save as disputed</Button>}
      >
        {conflict && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
            <p className="mb-1 text-sm font-semibold text-rose-800">This would make the shares exceed 100%</p>
            <IssueList issues={conflict.issues} />
            <p className="mt-2 text-xs text-rose-700">Fix the share, territory or dates — or save it as a disputed claim.</p>
          </div>
        )}
        {!current && (
          <div className="grid gap-4 sm:grid-cols-2">
            <PartyField label="Owner" />
            <NativeSelect label="Right" name="rightType" defaultValue={assetType === "WORK" ? "COMPOSITION" : "MASTER"}>
              {RIGHT_TYPES.map((r) => <option key={r} value={r}>{RIGHT_LABEL[r]}</option>)}
            </NativeSelect>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Share %" name="share" type="number" step="0.0001" min="0.0001" max="100" required defaultValue={current ? Number(current.sharePercent) : undefined} />
          <Field label="Territories" name="territories" defaultValue={current?.territories.join(", ") ?? "WW"} hint={TERR_HINT} />
          <Field label="From (optional)" name="startDate" type="date" defaultValue={isoDay(current?.startDate)} />
          <Field label="Until (optional)" name="endDate" type="date" defaultValue={isoDay(current?.endDate)} />
        </div>
        <TextArea label="Basis / note" name="basis" defaultValue={current?.basis ?? ""} placeholder="e.g. Assignment agreement dated 01-04-2024" />
      </FormDialog>

      <FormDialog open={transfer} onOpenChange={setTransfer} title="Record a rights transfer" description="Moves a share from one owner to another. The seller's claim is reduced and the buyer gets a new asserted claim." onSubmit={submitTransfer} busy={busy} submitLabel="Record transfer" wide>
        <NativeSelect label="From (current owner & right)" name="from" required defaultValue="">
          <option value="" disabled>Choose…</option>
          {sources.map((c) => <option key={c.id} value={`${c.partyId}|${c.rightType}`}>{partyName(c.party)} — {RIGHT_LABEL[c.rightType]} {pct(c.sharePercent)}</option>)}
        </NativeSelect>
        <PartyField name="to" label="To (new owner)" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Share % transferred" name="share" type="number" step="0.0001" min="0.0001" max="100" required />
          <Field label="Effective date" name="effectiveDate" type="date" />
          <Field label="Territories" name="territories" defaultValue="WW" hint={TERR_HINT} />
          <Field label="Scope (optional)" name="scope" placeholder="e.g. Full assignment, 10 years" />
        </div>
      </FormDialog>
    </SectionCard>
  );
}

export function licenseState(l: Pick<License, "endDate">) {
  if (!l.endDate) return { label: "No expiry", tone: "slate" as const };
  const d = (new Date(l.endDate).getTime() - Date.now()) / 86400_000;
  if (d < 0) return { label: "Expired", tone: "slate" as const };
  if (d <= 60) return { label: `Expires in ${Math.ceil(d)}d`, tone: "amber" as const };
  return { label: "Active", tone: "green" as const };
}

export function LicenseDialog({ open, onOpenChange, asset, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; asset?: { type: AssetKind; id: string }; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  async function submit(f: FormData) {
    setBusy(true);
    try {
      await api("/licenses", {
        json: {
          assetType: asset?.type ?? f.get("assetType"), assetId: asset?.id ?? f.get("assetId"), licenseeName: String(f.get("licensee")).trim(),
          territories: territories(f), exclusive: f.get("exclusive") === "on",
          permittedUses: String(f.get("uses") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
          startDate: dateOrNull(f, "startDate"), endDate: dateOrNull(f, "endDate"), feeNote: str(f, "fee"),
        },
      });
      toast.success("License added");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Add license" description="Permission you granted someone to use this asset. Exclusive licenses cannot overlap others in the same territory and period." onSubmit={submit} busy={busy} wide>
      {!asset && <AssetField />}
      <Field label="Licensee" name="licensee" required placeholder="e.g. ABC Films Pvt Ltd" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Territories" name="territories" defaultValue="WW" hint={TERR_HINT} />
        <Field label="Permitted uses" name="uses" placeholder="Film sync, Broadcast, Ads" hint="Comma separated" />
        <Field label="Start" name="startDate" type="date" />
        <Field label="End" name="endDate" type="date" />
      </div>
      <Field label="Fee note (optional)" name="fee" placeholder="₹50,000 one-time" />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="exclusive" className="size-4" /> Exclusive license</label>
    </FormDialog>
  );
}

export function LicensesCard({ asset, licenses, onChange }: { asset: { type: AssetKind; id: string }; licenses: License[]; onChange: () => void }) {
  const { can } = useSession();
  const [open, setOpen] = useState(false);
  return (
    <SectionCard title="Licenses" action={can("rights.write") && <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus className="size-4" /> Add license</Button>}>
      {licenses.length === 0 ? (
        <p className="text-sm text-muted-foreground">No licenses granted.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {licenses.map((l) => {
            const s = licenseState(l);
            return (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <div>
                  <span className="font-medium">{l.licenseeName}</span>
                  <span className="ml-2 text-muted-foreground">{l.territories.join(", ")} · {l.permittedUses.join(", ") || "any use"}</span>
                </div>
                <div className="flex items-center gap-2">
                  {l.exclusive && <Pill tone="violet">exclusive</Pill>}
                  <Pill tone={s.tone}>{s.label}</Pill>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <LicenseDialog open={open} onOpenChange={setOpen} asset={asset} onSaved={onChange} />
    </SectionCard>
  );
}

export function ArchivedBanner({ archivedAt, onRestore }: { archivedAt: string | null; onRestore?: () => void }) {
  if (!archivedAt) return null;
  return (
    <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      Archived on {fmtDate(archivedAt)} — hidden from lists and search.
      {onRestore && <Button size="sm" variant="outline" onClick={onRestore}>Restore</Button>}
    </div>
  );
}

export function DetailSkeleton({ error }: { error: string | null }) {
  if (error) return <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">{error}</div>;
  return <div className="grid place-items-center py-24"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
}
